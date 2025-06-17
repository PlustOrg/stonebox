import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn, SpawnOptions } from 'child_process';
import { rimraf } from 'rimraf';
import {
  EnvironmentOptions,
  ExecuteOptions,
  ExecutionResult,
  EngineType,
  Language,
} from './interfaces';
import {
  StoneboxConfigurationError,
  StoneboxCompilationError,
  StoneboxTimeoutError,
  StoneboxRuntimeError,
} from './errors';
import { PreparedCommand, LanguageEngine } from './engines/types';
import { DockerEngineHelper } from './engines/dockerEngineHelper';
import { JavaScriptEngine } from './engines/javascriptEngine';
import { PythonEngine } from './engines/pythonEngine';
import { TypeScriptEngine } from './engines/typescriptEngine';
import { JavaScriptDockerEngine } from './engines/javascriptDockerEngine';
import { PythonDockerEngine } from './engines/pythonDockerEngine';
import { TypeScriptDockerEngine } from './engines/typescriptDockerEngine';

export class ExecutionEnvironment {
  public readonly options: EnvironmentOptions;
  public readonly tempPath: string;
  private readonly files: Map<string, string> = new Map();

  private constructor(options: EnvironmentOptions, tempDir: string) {
    this.options = options;
    this.tempPath = tempDir;
  }

  static async create(options: EnvironmentOptions): Promise<ExecutionEnvironment> {
    const realOsTmpDir = await fs.realpath(os.tmpdir());
    const tempDirPrefix = path.join(realOsTmpDir, 'stonebox-env-');
    const tempDir = await fs.mkdtemp(tempDirPrefix);
    return new ExecutionEnvironment(options, tempDir);
  }

  public async addFile(filePath: string, content: string): Promise<void> {
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
      throw new StoneboxConfigurationError(
        'Invalid file path: must be relative and within the sandbox.',
      );
    }
    this.files.set(normalizedPath, content);
    const absPath = path.join(this.tempPath, normalizedPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, { encoding: 'utf8', mode: 0o755 });
  }

  public async addFiles(files: Array<{ path: string; content: string }>): Promise<void> {
    for (const file of files) {
      await this.addFile(file.path, file.content);
    }
  }

  public async execute(
    command: string,
    args: string[] = [],
    executeOptions: ExecuteOptions = {},
  ): Promise<ExecutionResult> {
    if (executeOptions.timeoutMs !== undefined && (typeof executeOptions.timeoutMs !== 'number' || executeOptions.timeoutMs <= 0)) {
        throw new StoneboxConfigurationError('timeoutMs in execute options must be a positive number.');
    }
    if (executeOptions.memoryLimitMb !== undefined && (typeof executeOptions.memoryLimitMb !== 'number' || executeOptions.memoryLimitMb <= 0)) {
        throw new StoneboxConfigurationError('memoryLimitMb in execute options must be a positive number.');
    }

    const mergedOptions: EnvironmentOptions & ExecuteOptions = {
      ...this.options,
      ...executeOptions,
    };

    const currentTimeoutMs = mergedOptions.timeoutMs || 10000;
    const resolvedEngineType = mergedOptions.engineType || 'process';

    const engine = this.getEngineFor(this.options.language, resolvedEngineType);
    const preparedCmdOrError = await engine.prepare(this, command, args, mergedOptions);

    if (preparedCmdOrError instanceof StoneboxCompilationError) {
      throw preparedCmdOrError;
    }
    const preparedCmd = preparedCmdOrError as PreparedCommand;

    if (resolvedEngineType === 'docker') {
      if (!this.options.dockerEngineOptions) {
        throw new StoneboxConfigurationError(
          "dockerEngineOptions are required for 'docker' engine type.",
        );
      }
      const dockerHelper = new DockerEngineHelper(this.options.dockerEngineOptions, this);
      return await dockerHelper.run(preparedCmd, currentTimeoutMs, executeOptions);
    } else {
      if (!preparedCmd.command) {
        throw new StoneboxConfigurationError('Command not found for process-based execution.');
      }
      return await this.spawnAndCollect(
        preparedCmd as Required<PreparedCommand>,
        mergedOptions,
        currentTimeoutMs,
      );
    }
  }

  public async delete(): Promise<void> {
    await rimraf(this.tempPath);
  }

  private getEngineFor(language: Language, engineType: EngineType): LanguageEngine {
    if (engineType === 'docker') {
      switch (language) {
        case 'javascript': return new JavaScriptDockerEngine();
        case 'python': return new PythonDockerEngine();
        case 'typescript': return new TypeScriptDockerEngine();
      }
    } else {
      switch (language) {
        case 'javascript': return new JavaScriptEngine();
        case 'python': return new PythonEngine();
        case 'typescript': return new TypeScriptEngine();
      }
    }
    throw new StoneboxConfigurationError(`Unsupported language '${language}' or engine '${engineType}'.`);
  }

  private async spawnAndCollect(
    preparedCmd: Required<PreparedCommand>,
    options: EnvironmentOptions & ExecuteOptions,
    timeoutMs: number,
  ): Promise<ExecutionResult> {
    return new Promise<ExecutionResult>((resolve, reject) => {
      const start = Date.now();
      const abortController = new AbortController();
      let killedByTimeout = false;
      let finished = false;

      const spawnOpts: SpawnOptions = {
        cwd: preparedCmd.cwd,
        env: preparedCmd.env as Record<string, string>,
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: abortController.signal,
      };

      if ((os.platform() === 'linux' || os.platform() === 'darwin') && options.languageOptions?.executionOverrides) {
        const overrides = options.languageOptions.executionOverrides;
        if (typeof overrides.uid === 'number') (spawnOpts as any).uid = overrides.uid;
        if (typeof overrides.gid === 'number') (spawnOpts as any).gid = overrides.gid;
      }

      const child = spawn(preparedCmd.command, preparedCmd.args, spawnOpts);
      let stdout = '';
      let stderr = '';

      const timeoutHandle = setTimeout(() => {
        killedByTimeout = true;
        abortController.abort();
        const forceKillTimeout = setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 500);
        child.on('exit', () => clearTimeout(forceKillTimeout));
      }, timeoutMs);

      child.stdout?.on('data', (d) => (stdout += d.toString()));
      child.stderr?.on('data', (d) => (stderr += d.toString()));

      // DEFINITIVE FIX: The entire stdin block is removed.
      child.stdin?.end();

      child.on('error', (err: any) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutHandle);
        if (err.name === 'AbortError' || abortController.signal.aborted) {
          reject(new StoneboxTimeoutError('Process timed out (aborted).', {
            configuredTimeoutMs: timeoutMs,
            actualDurationMs: Date.now() - start,
            stdout,
            stderr,
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
        if (killedByTimeout) {
          reject(new StoneboxTimeoutError('Process timed out or was aborted.', {
            configuredTimeoutMs: timeoutMs,
            actualDurationMs: durationMs,
            stdout,
            stderr,
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