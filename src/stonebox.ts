import {
  StoneboxOptions,
  StoneboxExecuteOptions,
  StoneboxExecutionResult,
} from './interfaces';
import {
  StoneboxConfigurationError,
  StoneboxCompilationError,
  StoneboxTimeoutError,
  StoneboxMemoryLimitError,
  StoneboxRuntimeError,
} from './errors';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { rimraf } from 'rimraf';
import { JavaScriptEngine } from './engines/javascriptEngine';
import { PythonEngine } from './engines/pythonEngine';
import { TypeScriptEngine } from './engines/typescriptEngine';

export class Stonebox {
  private language: string;
  private options: StoneboxOptions;
  private files: Map<string, string> = new Map();

  constructor(language: string, options: StoneboxOptions = {}) {
    this.language = language.toLowerCase();
    this.options = options;
    if (!['javascript', 'typescript', 'python'].includes(this.language)) {
      throw new StoneboxConfigurationError(
        `Unsupported language: ${language}`
      );
    }
  }

  public addFile(filePath: string, content: string): void {
    this.files.set(filePath, content);
  }

  public addFiles(files: Array<{ path: string; content: string }>): void {
    for (const file of files) {
      this.addFile(file.path, file.content);
    }
  }

  public resetFiles(): void {
    this.files.clear();
  }

  public async execute(
    executeOptionsInput?: StoneboxExecuteOptions
  ): Promise<StoneboxExecutionResult> {
    // Merge options
    const mergedOptions: StoneboxExecuteOptions & StoneboxOptions = {
      ...this.options,
      ...executeOptionsInput,
    };
    const timeoutMs = mergedOptions.timeoutMs ?? 5000;
    const entrypoint =
      mergedOptions.entrypoint ?? Array.from(this.files.keys())[0];
    if (!entrypoint) {
      throw new StoneboxConfigurationError(
        'No entrypoint specified and no files added.'
      );
    }
    if (!this.files.has(entrypoint)) {
      throw new StoneboxConfigurationError(
        `Entrypoint file not found: ${entrypoint}`
      );
    }
    if (this.files.size === 0) {
      throw new StoneboxConfigurationError('No files added to Stonebox.');
    }

    // Create temp dir
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stonebox-'));
    try {
      // Write all files
      for (const [filePath, content] of this.files.entries()) {
        const absPath = path.join(tempDir, filePath);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, content, 'utf8');
      }
      // Select engine
      const engine = this.getEngineFor(this.language);
      const preparedCmd = await engine.prepare({
        files: this.files,
        entrypoint,
        options: mergedOptions,
        tempPath: tempDir,
      });
      if (preparedCmd instanceof StoneboxCompilationError) {
        throw preparedCmd;
      }
      // Spawn process
      return await this.spawnAndCollect(preparedCmd, mergedOptions, timeoutMs);
    } finally {
      await rimraf(tempDir);
    }
  }

  private getEngineFor(language: string): any {
    switch (language) {
      case 'javascript':
        return new JavaScriptEngine();
      case 'python':
        return new PythonEngine();
      case 'typescript':
        return new TypeScriptEngine();
      default:
        throw new StoneboxConfigurationError('Engine selection not implemented.');
    }
  }

  private async spawnAndCollect(
    preparedCmd: { command: string; args: string[]; env: Record<string, string | undefined>; cwd: string },
    options: StoneboxExecuteOptions & StoneboxOptions,
    timeoutMs: number,
  ): Promise<StoneboxExecutionResult> {
    return new Promise<StoneboxExecutionResult>((resolve, reject) => {
      const start = Date.now();
      const child = spawn(preparedCmd.command, preparedCmd.args, {
        cwd: preparedCmd.cwd,
        env: preparedCmd.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let finished = false;
      let killedByTimeout = false;
      const timeout = setTimeout(() => {
        killedByTimeout = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 500);
      }, timeoutMs);
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      if (options.stdin) {
        child.stdin.write(options.stdin);
        child.stdin.end();
      } else {
        child.stdin.end();
      }
      child.on('error', (err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        reject(new StoneboxRuntimeError(err.message));
      });
      child.on('exit', (code, signal) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        const durationMs = Date.now() - start;
        if (killedByTimeout) {
          reject(new StoneboxTimeoutError('Process timed out.'));
        } else {
          resolve({
            stdout,
            stderr,
            exitCode: code,
            signal: signal ?? null,
            durationMs,
          });
        }
      });
    });
  }
}
