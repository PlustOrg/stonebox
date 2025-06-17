import { LanguageEngine, PreparedCommand } from './types';
import { StoneboxCompilationError, StoneboxConfigurationError } from '../errors';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import { ExecutionEnvironment } from '../environment';
import { ExecuteOptions } from '../interfaces';

export class TypeScriptDockerEngine implements LanguageEngine {
  async prepare(
    environment: ExecutionEnvironment,
    command: string, // e.g., 'node'
    args: string[], // e.g., ['main.ts', 'arg1']
    options: ExecuteOptions,
  ): Promise<PreparedCommand | StoneboxCompilationError> {
    const languageOptions = environment.options.languageOptions || {};

    const tsEntrypoint = args[0];
    if (!tsEntrypoint || !tsEntrypoint.endsWith('.ts')) {
      throw new StoneboxConfigurationError(
        `The first argument for a TypeScript execution must be a .ts file. Received: ${tsEntrypoint}`,
      );
    }

    // --- Stage 1: Compile TypeScript on the host (same as local engine) ---
    const outDir = 'compiled_ts_docker';
    await this.compile(environment, outDir);

    // --- Stage 2: Prepare command to run the *compiled JS inside Docker* ---
    const jsEntrypointFileName = tsEntrypoint.replace(/\.ts$/, '.js');
    // The path must be relative to the workspace root inside the container
    const jsEntrypointInContainer = path.join(outDir, jsEntrypointFileName).replace(/\\/g, '/');
    const userArgs = args.slice(1);

    const nodeCmd = command || languageOptions.nodePath || 'node';

    return {
      command: nodeCmd,
      args: [jsEntrypointInContainer, ...userArgs],
      env: options.env || environment.options.env || {},
      cwd: '/stonebox_workspace',
    };
  }

  // The compile method is identical to the one in the local TypeScriptEngine
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

    let tscBin = languageOptions.tscPath || 'tsc';
    const tscArgs = tscBin.toLowerCase().endsWith('npx') ? ['tsc', '-p', tsconfigPath] : ['-p', tsconfigPath];
    if(tscBin.toLowerCase().endsWith('npx')) {
      tscBin = 'npx';
    }

    const compileResult = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
      (resolve) => {
        const child = spawn(tscBin, tscArgs, { cwd: tempPath, env: process.env });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stderr += d.toString()));
        child.on('close', (code) => resolve({ code, stdout, stderr }));
        child.on('error', (err) => resolve({ code: 1, stdout, stderr: `Failed to spawn tsc: ${err.message}` }));
      },
    );

    if (compileResult.code !== 0) {
      throw new StoneboxCompilationError('TypeScript compilation failed (host stage for Docker).', {
        stdout: compileResult.stdout,
        stderr: compileResult.stderr,
      });
    }
  }
}