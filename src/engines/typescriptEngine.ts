import { LanguageEngine, ExecutionTask, PreparedCommand } from './types';
import { StoneboxCompilationError } from '../errors';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

export class TypeScriptEngine implements LanguageEngine {
  async prepare(task: ExecutionTask): Promise<PreparedCommand | StoneboxCompilationError> {
    // 1. Write a default tsconfig.json if not present
    const tsconfigPath = path.join(task.tempPath, 'tsconfig.json');
    let hasTsconfig = false;
    try {
      await fs.access(tsconfigPath);
      hasTsconfig = true;
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
          },
          include: ['**/*.ts'],
        }, null, 2),
        'utf8',
      );
    }
    // 2. Compile with tsc
    const tscBin = path.join(
      task.tempPath,
      '..',
      '..',
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
    );
    const compileResult = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(
        tscBin,
        ['-p', tsconfigPath],
        { cwd: task.tempPath }
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
      child.on('error', () => resolve({ code: 1, stdout, stderr: 'Failed to spawn tsc' }));
    });
    if (compileResult.code !== 0) {
      return new StoneboxCompilationError('TypeScript compilation failed.', {
        stdout: compileResult.stdout,
        stderr: compileResult.stderr,
      });
    }
    // 3. Prepare JS execution
    const outDir = 'compiled_ts';
    const jsEntrypoint = path.join(outDir, task.entrypoint.replace(/\.ts$/, '.js'));
    const nodeArgs: string[] = [];
    if (task.options.memoryLimitMb) {
      nodeArgs.push(`--max-old-space-size=${task.options.memoryLimitMb}`);
    }
    nodeArgs.push(jsEntrypoint);
    if (task.options.args) {
      nodeArgs.push(...task.options.args);
    }
    return {
      command: process.execPath,
      args: nodeArgs,
      env: { ...process.env, ...task.options.env },
      cwd: task.tempPath,
    };
  }
}
