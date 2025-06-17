import * as os from 'os';
import * as path from 'path';
import { LanguageEngine, PreparedCommand } from './types';
import { buildSandboxEnv } from '../utils/envUtils';
import { ExecutionEnvironment } from '../environment';
import { ExecuteOptions } from '../interfaces';

declare const __dirname: string;

export class PythonEngine implements LanguageEngine {
  async prepare(
    environment: ExecutionEnvironment,
    command: string,
    args: string[],
    options: ExecuteOptions,
  ): Promise<PreparedCommand> {
    const languageOptions = environment.options.languageOptions || {};
    const memoryLimitMb = options.memoryLimitMb || environment.options.memoryLimitMb;
    const processLimit = languageOptions.processLimit;

    // FIX: Default to 'python3' for better compatibility.
    const pythonCmd = command || languageOptions.pythonPath || 'python3';
    const combinedEnv = buildSandboxEnv(options.env || environment.options.env);

    const isUnix = os.platform() === 'linux' || os.platform() === 'darwin';
    if (isUnix && (memoryLimitMb || processLimit)) {
      const limiterPath = path.resolve(__dirname, '../utils/unixResourceLimiter.py');

      if (memoryLimitMb) combinedEnv.STONEBOX_MEMORY_LIMIT_MB = String(memoryLimitMb);
      if (processLimit) combinedEnv.STONEBOX_PROCESS_LIMIT = String(processLimit);

      combinedEnv.STONEBOX_EXEC_ARGS = JSON.stringify([pythonCmd, ...args]);

      return {
        command: pythonCmd,
        args: [limiterPath],
        env: combinedEnv,
        cwd: environment.tempPath,
      };
    }

    return {
      command: pythonCmd,
      args,
      env: combinedEnv,
      cwd: environment.tempPath,
    };
  }
}