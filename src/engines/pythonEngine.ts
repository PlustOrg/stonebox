import { LanguageEngine, ExecutionTask, PreparedCommand } from './types';

export class PythonEngine implements LanguageEngine {
  async prepare(task: ExecutionTask): Promise<PreparedCommand> {
    // Prefer explicit pythonPath, then python3, then python
    let pythonCmd = (task.options.languageOptions?.pythonPath as string);
    if (!pythonCmd) {
      pythonCmd = 'python3';
      // Optionally, could check for 'python' as a fallback, but 'python3' is preferred for modern code
    }
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
