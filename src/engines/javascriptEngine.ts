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
    // Prefer explicit nodePath, then process.execPath
    const nodeCmd = (task.options.languageOptions?.nodePath as string) || process.execPath;
    return {
      command: nodeCmd,
      args: nodeArgs,
      env: { ...process.env, ...task.options.env },
      cwd: task.tempPath,
    };
  }
}
