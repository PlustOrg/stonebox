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
import { spawn, spawnSync } from 'child_process';
import { rimraf } from 'rimraf';
import { JavaScriptEngine } from './engines/javascriptEngine';
import { PythonEngine } from './engines/pythonEngine';
import { TypeScriptEngine } from './engines/typescriptEngine';

export class Stonebox {
  private language: string;
  private options: StoneboxOptions;
  private files: Map<string, string> = new Map();
  private static checkedLanguages = new Set<string>();

  constructor(language: string, options: StoneboxOptions = {}) {
    this.language = language.toLowerCase();
    this.options = options;
    if (!['javascript', 'typescript', 'python'].includes(this.language)) {
      throw new StoneboxConfigurationError(
        `Unsupported language: ${language}`
      );
    }
    // Validate options.timeoutMs and memoryLimitMb if provided
    if (options.timeoutMs !== undefined && (typeof options.timeoutMs !== 'number' || options.timeoutMs <= 0)) {
      throw new StoneboxConfigurationError('timeoutMs must be a positive number');
    }
    if (options.memoryLimitMb !== undefined && (typeof options.memoryLimitMb !== 'number' || options.memoryLimitMb <= 0)) {
      throw new StoneboxConfigurationError('memoryLimitMb must be a positive number');
    }
  }

  public addFile(filePath: string, content: string): void {
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
      throw new StoneboxConfigurationError("Invalid file path: must be relative and within the sandbox.");
    }
    this.files.set(normalizedPath, content);
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
    // Validate mergedOptions.timeoutMs and memoryLimitMb
    if (mergedOptions.timeoutMs !== undefined && (typeof mergedOptions.timeoutMs !== 'number' || mergedOptions.timeoutMs <= 0)) {
      throw new StoneboxConfigurationError('timeoutMs must be a positive number');
    }
    if (mergedOptions.memoryLimitMb !== undefined && (typeof mergedOptions.memoryLimitMb !== 'number' || mergedOptions.memoryLimitMb <= 0)) {
      throw new StoneboxConfigurationError('memoryLimitMb must be a positive number');
    }
    const timeoutMs = mergedOptions.timeoutMs ?? 5000;
    // Entrypoint logic: if not set, use first file (insertion order)
    let entrypoint = mergedOptions.entrypoint ?? this.options.entrypoint;
    if (!entrypoint) {
      if (this.files.size > 1) {
        // Document fallback to first file
        // throw new StoneboxConfigurationError('Multiple files added but no entrypoint specified. Please specify an entrypoint.');
        entrypoint = Array.from(this.files.keys())[0];
        // Note: fallback to first file added (insertion order)
      } else {
        entrypoint = Array.from(this.files.keys())[0];
      }
    }
    if (!entrypoint) {
      throw new StoneboxConfigurationError(
        'No entrypoint specified and no files added.'
      );
    }
    if (!this.files.has(entrypoint)) {
      // Improve error message: list available files if small, else suggest checking
      const available = Array.from(this.files.keys());
      let msg = `Entrypoint file not found: ${entrypoint}.`;
      if (available.length <= 5) {
        msg += ` Available files: ${available.join(', ')}`;
      } else {
        msg += ' Please check the files you have added.';
      }
      throw new StoneboxConfigurationError(msg);
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
    // Step 3.3: Pre-flight runtime check on first use
    if (!Stonebox.checkedLanguages.has(language)) {
      let checkCmd: string | undefined;
      let checkArgs: string[] = [];
      let failMsg: string | undefined;
      switch (language) {
        case 'python': {
          // Prefer explicit pythonPath if set
          const pythonPath = this.options.languageOptions?.pythonPath as string | undefined;
          checkCmd = pythonPath || 'python3';
          checkArgs = ['--version'];
          failMsg = `Python runtime not found or not working (tried: ${checkCmd} --version)`;
          break;
        }
        case 'javascript': {
          // Node.js: check process.execPath
          checkCmd = (this.options.languageOptions?.nodePath as string) || process.execPath;
          checkArgs = ['--version'];
          failMsg = `Node.js runtime not found or not working (tried: ${checkCmd} --version)`;
          break;
        }
        case 'typescript': {
          // Check tsc
          const tscPath = this.options.languageOptions?.tscPath as string | undefined;
          checkCmd = tscPath || 'tsc';
          checkArgs = ['--version'];
          failMsg = `TypeScript compiler (tsc) not found or not working (tried: ${checkCmd} --version)`;
          break;
        }
        default:
          throw new StoneboxConfigurationError('Engine selection not implemented.');
      }
      try {
        const result = spawnSync(checkCmd, checkArgs, { encoding: 'utf8' });
        if (result.error || result.status !== 0) {
          throw new Error(result.error ? result.error.message : result.stderr || 'Unknown error');
        }
      } catch (e: any) {
        throw new StoneboxConfigurationError(failMsg + (e?.message ? `: ${e.message}` : ''));
      }
      Stonebox.checkedLanguages.add(language);
    }
    // ...existing code...
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
      const abortController = new AbortController();
      let killedByTimeout = false;
      // 3.2: Add uid/gid support for Unix
      const spawnOpts: any = {
        cwd: preparedCmd.cwd,
        env: preparedCmd.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: abortController.signal,
      };
      const mergedOptions = options;
      if ((os.platform() === 'linux' || os.platform() === 'darwin') && mergedOptions.languageOptions?.executionOverrides) {
        const overrides = mergedOptions.languageOptions.executionOverrides;
        if (typeof overrides.uid === 'number') spawnOpts.uid = overrides.uid;
        if (typeof overrides.gid === 'number') spawnOpts.gid = overrides.gid;
      }
      const child = spawn(preparedCmd.command, preparedCmd.args, spawnOpts);
      let stdout = '';
      let stderr = '';
      let finished = false;
      const timeoutHandle = setTimeout(() => {
        killedByTimeout = true;
        abortController.abort();
        child.kill('SIGTERM');
        const forceKillTimeout = setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 500);
        child.on('exit', () => clearTimeout(forceKillTimeout));
      }, timeoutMs);
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      if (options.stdin) {
        child.stdin.write(options.stdin);
        child.stdin.end();
      } else {
        child.stdin.end();
      }
      child.on('error', (err: any) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutHandle);
        if (err.name === 'AbortError' || abortController.signal.aborted) {
          reject(new StoneboxTimeoutError('Process timed out.', {
            configuredTimeoutMs: timeoutMs,
            actualDurationMs: Date.now() - start,
          }));
        } else {
          reject(new StoneboxRuntimeError(err.message, {
            originalError: err,
            command: preparedCmd.command,
            args: preparedCmd.args,
          }));
        }
      });
      child.on('exit', (code, signal) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutHandle);
        const durationMs = Date.now() - start;
        if (killedByTimeout || abortController.signal.aborted) {
          reject(new StoneboxTimeoutError('Process timed out.', {
            configuredTimeoutMs: timeoutMs,
            actualDurationMs: durationMs,
          }));
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
