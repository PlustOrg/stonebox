import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn, SpawnOptions } from 'child_process';
import { rimraf } from 'rimraf';
import { StoneboxOptions, StoneboxExecuteOptions, StoneboxExecutionResult, EngineType, StoneboxLanguageOptions } from './interfaces';
import {
    StoneboxError,
    StoneboxConfigurationError,
    StoneboxTimeoutError,
    StoneboxCompilationError,
    StoneboxRuntimeError
} from './errors';
import { JavaScriptEngine } from './engines/javascriptEngine';
import { PythonEngine } from './engines/pythonEngine';
import { TypeScriptEngine } from './engines/typescriptEngine';
import { JavaScriptDockerEngine } from './engines/javascriptDockerEngine';
import { PythonDockerEngine } from './engines/pythonDockerEngine';
import { TypeScriptDockerEngine } from './engines/typescriptDockerEngine';
import { DockerEngineHelper } from './engines/dockerEngineHelper';
import { LanguageEngine, ExecutionTask, PreparedCommand } from './engines/types';

// Global diagnostic flag (can be removed if not needed for external debugging)
// (global as any).__STONEBOX_DIAGNOSTIC_PRESERVE_TEMP_DIR = false; 

export class Stonebox {
  private language: string;
  private options: StoneboxOptions;
  private files: Map<string, string> = new Map();

  constructor(language: string, options: StoneboxOptions = {}) {
    this.language = language.toLowerCase();
    this.options = options;
    if (!['javascript', 'typescript', 'python'].includes(this.language)) {
      throw new StoneboxConfigurationError(`Unsupported language: ${language}`);
    }
    if (
      options.timeoutMs !== undefined &&
      (typeof options.timeoutMs !== 'number' || options.timeoutMs <= 0)
    ) {
      throw new StoneboxConfigurationError('timeoutMs must be a positive number');
    }
    if (
      options.memoryLimitMb !== undefined &&
      (typeof options.memoryLimitMb !== 'number' || options.memoryLimitMb <= 0)
    ) {
      throw new StoneboxConfigurationError('memoryLimitMb must be a positive number');
    }
    if (this.options.engineType === 'docker') {
      if (!this.options.dockerEngineOptions || !this.options.dockerEngineOptions.image) {
        throw new StoneboxConfigurationError(
          "When engineType is 'docker', dockerEngineOptions.image must be provided."
        );
      }
    }
  }

  public addFile(filePath: string, content: string): void {
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
      throw new StoneboxConfigurationError(
        'Invalid file path: must be relative and within the sandbox.',
      );
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
    executeOptionsInput?: StoneboxExecuteOptions,
  ): Promise<StoneboxExecutionResult> {
    const mergedOptions: StoneboxExecuteOptions & StoneboxOptions = {
      ...this.options,
      ...executeOptionsInput,
      languageOptions: {
        ...(this.options.languageOptions || {}),
        ...(executeOptionsInput?.languageOptions || {}),
      }
    };

    const currentTimeoutMs = mergedOptions.timeoutMs || 10000;
    let currentEntrypoint = mergedOptions.entrypoint;

    if (!currentEntrypoint && this.files.size === 1) {
      currentEntrypoint = this.files.keys().next().value;
    } else if (!currentEntrypoint && this.files.size > 1) {
      const commonEntrypoints = ['main.js', 'index.js', 'app.js', 'main.py', 'app.py', 'main.ts', 'index.ts'];
      for (const common of commonEntrypoints) {
        if (this.files.has(common)) {
          currentEntrypoint = common;
          break;
        }
      }
    }

    if (mergedOptions.engineType !== 'docker' || (currentEntrypoint !== undefined && currentEntrypoint !== '')) {
      if (!currentEntrypoint && currentEntrypoint !== '') {
        throw new StoneboxConfigurationError('No entrypoint specified and no files added, or multiple files added without a clear entrypoint.');
      }
      if (currentEntrypoint && !this.files.has(currentEntrypoint)) {
        const availableFiles = Array.from(this.files.keys()).join(', ');
        throw new StoneboxConfigurationError(
          `Entrypoint '${currentEntrypoint}' not found. Available files: ${availableFiles || 'none'}. Add the entrypoint file or specify a different one.`
        );
      }
    } else if (mergedOptions.engineType === 'docker' && currentEntrypoint === undefined) {
        currentEntrypoint = '';
    }

    if (
      mergedOptions.timeoutMs !== undefined &&
      (typeof mergedOptions.timeoutMs !== 'number' || mergedOptions.timeoutMs <= 0)
    ) {
      throw new StoneboxConfigurationError('timeoutMs must be a positive number.');
    }
    if (
      mergedOptions.memoryLimitMb !== undefined &&
      (typeof mergedOptions.memoryLimitMb !== 'number' || mergedOptions.memoryLimitMb <= 0)
    ) {
      throw new StoneboxConfigurationError('memoryLimitMb must be a positive number.');
    }

    const resolvedEngineType = mergedOptions.engineType || 'process';
    
    const realOsTmpDir = await fs.realpath(os.tmpdir());
    const tempDirPrefix = path.join(realOsTmpDir, 'stonebox-');
    const tempDir = await fs.mkdtemp(tempDirPrefix);
    // console.log(`[Stonebox.execute] Created host tempDir: ${tempDir}`); // Reduced logging

    const hostExecutionTask: ExecutionTask = {
      files: this.files,
      entrypoint: currentEntrypoint || '',
      options: mergedOptions,
      tempPath: tempDir,
    };

    try {
      for (const [filePath, content] of this.files.entries()) {
        const absPath = path.join(tempDir, filePath);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, content, { encoding: 'utf8', mode: 0o755 }); 
        // console.log(`[Stonebox.execute] Wrote file to host: ${absPath} with mode 755`); // Reduced logging
      }

      const engine = this.getEngineFor(this.language, resolvedEngineType);
      const preparedCmdOrError = await engine.prepare(hostExecutionTask);

      if (preparedCmdOrError instanceof StoneboxCompilationError) {
        throw preparedCmdOrError;
      }
      const preparedCmd = preparedCmdOrError as PreparedCommand;

      if (!preparedCmd.args) {
        preparedCmd.args = [];
      }

      if (resolvedEngineType === 'docker') {
        if (!this.options.dockerEngineOptions) {
            throw new StoneboxConfigurationError("dockerEngineOptions are required for 'docker' engine type.");
        }
        const dockerHelper = new DockerEngineHelper(this.options.dockerEngineOptions, hostExecutionTask);
        return await dockerHelper.runInContainer(preparedCmd, currentTimeoutMs);
      } else {
        if (!preparedCmd.command) {
            throw new StoneboxConfigurationError(
                `Command not found for process-based execution. Language: ${this.language}`
            );
        }
        return await this.spawnAndCollect(
            preparedCmd as { command: string; args: string[]; env: Record<string, string|undefined>; cwd: string; }, 
            mergedOptions, 
            currentTimeoutMs
        );
      }
    } finally {
      // Check diagnostic flag if kept, otherwise always remove
      const preserveTempDir = (mergedOptions.languageOptions as any)?.__STONEBOX_DIAGNOSTIC_PRESERVE_TEMP_DIR || (global as any).__STONEBOX_DIAGNOSTIC_PRESERVE_TEMP_DIR;
      if (!preserveTempDir) {
        try {
          await rimraf(tempDir);
        } catch (err) {
          console.warn(`Stonebox: Failed to remove temporary directory ${tempDir}:`, err);
        }
      } else {
        console.warn(`[Stonebox.execute] DIAGNOSTIC MODE: Host tempDir PRESERVED: ${tempDir}`);
      }
    }
  }

  private getEngineFor(language: string, engineType?: EngineType): LanguageEngine {
    engineType = engineType || this.options.engineType || 'process';
    if (engineType === 'docker') {
      switch (language) {
        case 'javascript':
          return new JavaScriptDockerEngine();
        case 'python':
          return new PythonDockerEngine();
        case 'typescript':
          return new TypeScriptDockerEngine();
        default:
          throw new StoneboxConfigurationError(`Docker engine not supported for language: ${language}`);
      }
    } else {
      switch (language) {
        case 'javascript':
          return new JavaScriptEngine();
        case 'python':
          return new PythonEngine();
        case 'typescript':
          return new TypeScriptEngine();
        default:
          throw new StoneboxConfigurationError(`Unsupported language for process engine: ${language}`);
      }
    }
  }

  private async spawnAndCollect(
    preparedCmd: {
      command: string;
      args: string[];
      env: Record<string, string | undefined>;
      cwd: string;
    },
    options: StoneboxExecuteOptions & StoneboxOptions,
    timeoutMs: number,
  ): Promise<StoneboxExecutionResult> {
    return new Promise<StoneboxExecutionResult>((resolve, reject) => {
      const start = Date.now();
      const abortController = new AbortController();
      let killedByTimeout = false;
      
      const spawnOpts: SpawnOptions = {
        cwd: preparedCmd.cwd,
        env: preparedCmd.env as Record<string, string>, 
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: abortController.signal,
      };

      if (
        (os.platform() === 'linux' || os.platform() === 'darwin') &&
        options.languageOptions?.executionOverrides
      ) {
        const overrides = options.languageOptions.executionOverrides;
        if (typeof overrides.uid === 'number') (spawnOpts as any).uid = overrides.uid;
        if (typeof overrides.gid === 'number') (spawnOpts as any).gid = overrides.gid;
      }

      const child = spawn(preparedCmd.command, preparedCmd.args, spawnOpts);
      let stdout = '';
      let stderr = '';
      let finished = false;

      const timeoutHandle = setTimeout(() => {
        killedByTimeout = true;
        abortController.abort(); 
        const forceKillTimeout = setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 500); 
        child.on('exit', () => clearTimeout(forceKillTimeout)); 
      }, timeoutMs);

      child.stdout?.on('data', (d) => (stdout += d.toString()));
      child.stderr?.on('data', (d) => (stderr += d.toString()));

      if (options.stdin) {
        child.stdin?.write(options.stdin);
        child.stdin?.end();                
      } else {
        child.stdin?.end();                
      }

      child.on('error', (err: any) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutHandle);
        if (err.name === 'AbortError' || abortController.signal.aborted) {
          reject(
            new StoneboxTimeoutError('Process timed out (aborted).', { 
              configuredTimeoutMs: timeoutMs,
              actualDurationMs: Date.now() - start,
            }),
          );
        } else {
          reject(
            new StoneboxRuntimeError(err.message, {
              originalError: err,
              command: preparedCmd.command,
              args: preparedCmd.args,
            }),
          );
        }
      });

      child.on('exit', (code, signal) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutHandle);
        const durationMs = Date.now() - start;
        if (killedByTimeout || (abortController.signal.aborted && signal === null && code === null) ) { 
          reject(
            new StoneboxTimeoutError('Process timed out or was aborted.', {
              configuredTimeoutMs: timeoutMs,
              actualDurationMs: durationMs,
            }),
          );
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