import { LanguageEngine, ExecutionTask, PreparedCommand } from './types';

export class JavaScriptEngine implements LanguageEngine {
  async prepare(task: ExecutionTask): Promise<PreparedCommand> {
    const nodeArgs: string[] = [];
    if (task.options.memoryLimitMb) {
      nodeArgs.push(`--max-old-space-size=${task.options.memoryLimitMb}`);
    }
    nodeArgs.push(task.entrypoint);
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
