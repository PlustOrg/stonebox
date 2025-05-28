import * as os from 'os';
import * as path from 'path';
import { LanguageEngine, ExecutionTask, PreparedCommand } from './types';
import { buildSandboxEnv } from '../utils/envUtils';

declare const __dirname: string;

export class PythonEngine implements LanguageEngine {
  async prepare(task: ExecutionTask): Promise<PreparedCommand> {
    // Prefer explicit pythonPath, then python3, then python
    let pythonCmd = task.options.languageOptions?.pythonPath as string;
    if (!pythonCmd) {
      pythonCmd = 'python3';
    }
    const args: string[] = [task.entrypoint];
    if (task.options.args) {
      args.push(...task.options.args);
    }

    // Phase 2: Unix resource limiting
    const isUnix = os.platform() === 'linux' || os.platform() === 'darwin';
    const memoryLimitMb = task.options.memoryLimitMb;
    const processLimit = task.options.languageOptions?.processLimit;
    if (isUnix && (memoryLimitMb || processLimit)) {
      // Use the unixResourceLimiter.py script
      const limiterPath = path.resolve(__dirname, '../utils/unixResourceLimiter.py');
      const env = buildSandboxEnv(task.options.env);
      if (memoryLimitMb) env.STONEBOX_MEMORY_LIMIT_MB = String(memoryLimitMb);
      if (processLimit) env.STONEBOX_PROCESS_LIMIT = String(processLimit);
      env.STONEBOX_EXEC_ARGS = JSON.stringify([
        pythonCmd,
        task.entrypoint,
        ...(task.options.args || []),
      ]);
      return {
        command: pythonCmd,
        args: [limiterPath],
        env,
        cwd: task.tempPath,
      };
    }
    return {
      command: pythonCmd,
      args,
      env: buildSandboxEnv(task.options.env),
      cwd: task.tempPath,
    };
  }
}
