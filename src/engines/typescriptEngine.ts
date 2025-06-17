import { LanguageEngine, PreparedCommand } from './types';
import { StoneboxCompilationError, StoneboxConfigurationError } from '../errors';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import { buildSandboxEnv } from '../utils/envUtils';
import { ExecutionEnvironment } from '../environment';
import { ExecuteOptions } from '../interfaces';

export class TypeScriptEngine implements LanguageEngine {
  async prepare(
    environment: ExecutionEnvironment,
    command: string,
    args: string[],
    options: ExecuteOptions,
  ): Promise<PreparedCommand | StoneboxCompilationError> {
    const languageOptions = environment.options.languageOptions || {};
    const memoryLimitMb = options.memoryLimitMb || environment.options.memoryLimitMb;

    const tsEntrypoint = args[0];
    if (!tsEntrypoint || !tsEntrypoint.endsWith('.ts')) {
      throw new StoneboxConfigurationError(
        `The first argument for a TypeScript execution must be a .ts file. Received: ${tsEntrypoint}`,
      );
    }

    const outDir = 'compiled_ts';
    await this.compile(environment, outDir);

    const jsEntrypoint = path.join(outDir, tsEntrypoint.replace(/\.ts$/, '.js'));
    const userArgs = args.slice(1);
    const nodeCmd = command || languageOptions.nodePath || process.execPath;
    const finalNodeArgs: string[] = [];

    if (memoryLimitMb) {
      finalNodeArgs.push(`--max-old-space-size=${memoryLimitMb}`);
    }
    finalNodeArgs.push(jsEntrypoint, ...userArgs);

    return {
      command: nodeCmd,
      args: finalNodeArgs,
      env: buildSandboxEnv(options.env || environment.options.env),
      cwd: environment.tempPath,
    };
  }

  private async compile(environment: ExecutionEnvironment, outDir: string): Promise<void> {
    const tempPath = environment.tempPath;
    const languageOptions = environment.options.languageOptions || {};
    const tsconfigPath = path.join(tempPath, 'tsconfig.json');

    try {
      await fs.access(tsconfigPath);
    } catch {
      await fs.writeFile(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'es2020', module: 'commonjs', outDir, rootDir: '.' },
          include: ['**/*.ts'],
        }),
        'utf8',
      );
    }
    await fs.mkdir(path.join(tempPath, outDir), { recursive: true });

    // DEFINITIVE FIX: Restore robust tsc path discovery from the old code.
    let tscBin = languageOptions.tscPath as string | undefined;
    if (!tscBin) {
      try {
        const tsPackagePath = require.resolve('typescript/package.json', { paths: [process.cwd(), __dirname] });
        tscBin = path.join(path.dirname(tsPackagePath), require(tsPackagePath).bin.tsc);
      } catch (e) { 
        console.warn(`Stonebox TypeScriptEngine: Could not resolve 'typescript' package. Falling back to 'tsc' in PATH. Error: ${e}`);
        tscBin = 'tsc';
      }
    }

    const tscSpawnCmd = tscBin.toLowerCase().endsWith('npx') ? 'npx' : tscBin;
    const tscSpawnArgs = tscBin.toLowerCase().endsWith('npx') ? ['tsc', '-p', tsconfigPath] : ['-p', tsconfigPath];

    const compileResult = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
      (resolve) => {
        const child = spawn(tscSpawnCmd, tscSpawnArgs, { cwd: tempPath, env: process.env });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stderr += d.toString()));
        child.on('close', (code) => resolve({ code, stdout, stderr }));
        child.on('error', (err) => resolve({ code: 1, stdout, stderr: `Failed to spawn tsc: ${err.message}` }));
      },
    );

    if (compileResult.code !== 0) {
      throw new StoneboxCompilationError('TypeScript compilation failed.', {
        stdout: compileResult.stdout,
        stderr: compileResult.stderr,
      });
    }
  }
}