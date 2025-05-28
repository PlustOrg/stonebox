import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import * as tmp from 'tmp';
import { rimraf } from 'rimraf';
import {
  StoneboxOptions,
  StoneboxExecuteOptions,
  StoneboxExecutionResult,
} from './interfaces';
import {
  StoneboxError,
  StoneboxConfigurationError,
  StoneboxTimeoutError,
  StoneboxCompilationError,
  StoneboxMemoryLimitError,
  StoneboxRuntimeError,
} from './errors';

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
      const { command, args, env, cwd } = preparedCmd;
      const child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let exited = false;
      let exitCode: number | null = null;
      let signal: string | null = null;
      const start = Date.now();
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      if (mergedOptions.stdin) {
        child.stdin.write(mergedOptions.stdin);
        child.stdin.end();
      }
      const timeout = setTimeout(() => {
        if (!exited) {
          child.kill('SIGTERM');
          setTimeout(() => child.kill('SIGKILL'), 500);
        }
      }, timeoutMs);
      return await new Promise<StoneboxExecutionResult>((resolve, reject) => {
        child.on('error', (err) => {
          clearTimeout(timeout);
          reject(new StoneboxRuntimeError(err.message));
        });
        child.on('exit', (code, sig) => {
          clearTimeout(timeout);
          exited = true;
          exitCode = code;
          signal = sig;
          const durationMs = Date.now() - start;
          if (sig === 'SIGTERM' || sig === 'SIGKILL') {
            reject(new StoneboxTimeoutError('Process timed out.'));
          } else {
            resolve({ stdout, stderr, exitCode, signal, durationMs });
          }
        });
      });
    } finally {
      await rimraf(tempDir);
    }
  }

  private getEngineFor(language: string): any {
    throw new StoneboxConfigurationError('Engine selection not implemented.');
  }
}
