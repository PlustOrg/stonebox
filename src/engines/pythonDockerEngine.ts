import { LanguageEngine, PreparedCommand } from './types';
import { ExecutionEnvironment } from '../environment';
import { ExecuteOptions } from '../interfaces';

export class PythonDockerEngine implements LanguageEngine {
  async prepare(
    environment: ExecutionEnvironment,
    command: string,
    args: string[],
    options: ExecuteOptions,
  ): Promise<PreparedCommand> {
    const languageOptions = environment.options.languageOptions || {};

    // Use the command passed to execute(), fallback to config, then 'python3'
    const pythonCmd = command || languageOptions.pythonPath || 'python3';

    return {
      command: pythonCmd,
      args,
      env: options.env || environment.options.env || {},
      cwd: '/stonebox_workspace',
    };
  }
}