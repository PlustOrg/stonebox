import { LanguageEngine, ExecutionTask, PreparedCommand } from './types';

export class PythonEngine implements LanguageEngine {
  async prepare(task: ExecutionTask): Promise<PreparedCommand> {
    const pythonCmd = (task.options.languageOptions?.pythonPath as string) || 'python3';
    const args: string[] = [task.entrypoint];
    if (task.options.args) {
      args.push(...task.options.args);
    }
    return {
      command: pythonCmd,
      args,
      env: { ...process.env, ...task.options.env },
      cwd: task.tempPath,
    };
  }
}
