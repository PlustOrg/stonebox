import { LanguageEngine, ExecutionTask, PreparedCommand } from './types';
import { StoneboxCompilationError } from '../errors';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

export class TypeScriptEngine implements LanguageEngine {
  async prepare(task: ExecutionTask): Promise<PreparedCommand | StoneboxCompilationError> {
    // 1. Write a default tsconfig.json if not present
    const tsconfigPath = path.join(task.tempPath, 'tsconfig.json');
    try {
      await fs.access(tsconfigPath);
    } catch {
      // No tsconfig.json, write a default one
      const outDir = 'compiled_ts';
      await fs.writeFile(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            target: 'es2020',
            module: 'commonjs',
            outDir,
            rootDir: '.',
            // Removed types and typeRoots to avoid missing node type definitions
          },
          include: ["**/*.ts"],
        }, null, 2),
        'utf8',
      );
    }
    // Ensure outDir exists before running tsc
    const outDir = 'compiled_ts';
    await fs.mkdir(path.join(task.tempPath, outDir), { recursive: true });
    // 2. Compile with tsc
    let tscBin: string | undefined;
    // Prefer explicit tscPath, then try require.resolve, then fallback
    if (task.options.languageOptions?.tscPath) {
      tscBin = task.options.languageOptions.tscPath;
    } else {
      try {
        // Try to resolve typescript from both __dirname and process.cwd()
        const tsPackagePath = require.resolve('typescript/package.json', { paths: [__dirname, process.cwd()] });
        tscBin = path.join(path.dirname(tsPackagePath), require(tsPackagePath).bin.tsc);
      } catch (e) {
        tscBin = 'tsc';
      }
    }
    const tscArgs = tscBin === 'npx' ? ['tsc', '-p', tsconfigPath] : ['-p', tsconfigPath];
    // Debugging output
    console.error('[Stonebox][TypeScriptEngine] tscBin:', tscBin);
    console.error('[Stonebox][TypeScriptEngine] tscArgs:', tscArgs);
    // Debug: List files in tempPath before running tsc
    try {
      const files = await fs.readdir(task.tempPath);
      console.error('[Stonebox][TypeScriptEngine] Files in tempPath:', files);
    } catch (e) {
      console.error('[Stonebox][TypeScriptEngine] Failed to list files in tempPath:', e);
    }
    const compileResult = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(tscBin!, tscArgs, { cwd: task.tempPath });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
      child.on('error', () => resolve({ code: 1, stdout, stderr: 'Failed to spawn tsc' }));
    });
    if (compileResult.code !== 0) {
      console.error('[Stonebox][TypeScriptEngine] tsc stderr:', compileResult.stderr);
      return new StoneboxCompilationError('TypeScript compilation failed.', {
        stdout: compileResult.stdout,
        stderr: compileResult.stderr,
      });
    }
    // 3. Prepare JS execution
    const jsEntrypoint = path.join(outDir, task.entrypoint.replace(/\.ts$/, '.js'));
    const nodeArgs: string[] = [];
    if (task.options.memoryLimitMb) {
      nodeArgs.push(`--max-old-space-size=${task.options.memoryLimitMb}`);
    }
    nodeArgs.push(jsEntrypoint);
    if (task.options.args) {
      nodeArgs.push(...task.options.args);
    }
    // Prefer explicit nodePath, then process.execPath
    const nodeCmd = (task.options.languageOptions?.nodePath as string) || process.execPath;
    return {
      command: nodeCmd,
      args: nodeArgs,
      env: { ...process.env, ...task.options.env },
      cwd: task.tempPath,
    };
  }
}
