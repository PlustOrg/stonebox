import process from 'process';
import { LanguageEngine, PreparedCommand } from './types';
import { buildSandboxEnv } from '../utils/envUtils';
import { ExecutionEnvironment } from '../environment';
import { ExecuteOptions } from '../interfaces';

export class JavaScriptEngine implements LanguageEngine {
  async prepare(
    environment: ExecutionEnvironment,
    command: string,
    args: string[],
    options: ExecuteOptions,
  ): Promise<PreparedCommand> {
    const languageOptions = environment.options.languageOptions || {};
    const memoryLimitMb = options.memoryLimitMb || environment.options.memoryLimitMb;

    // Use the command passed to execute(), fallback to config, then system default
    const nodeCmd = command || languageOptions.nodePath || process.execPath;

    const finalArgs: string[] = [];
    if (memoryLimitMb) {
      finalArgs.push(`--max-old-space-size=${memoryLimitMb}`);
    }
    finalArgs.push(...args);

    return {
      command: nodeCmd,
      args: finalArgs,
      env: buildSandboxEnv(options.env || environment.options.env),
      cwd: environment.tempPath,
    };
  }
}