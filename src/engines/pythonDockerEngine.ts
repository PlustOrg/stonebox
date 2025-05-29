import { LanguageEngine, ExecutionTask, PreparedCommand } from './types';
import { StoneboxConfigurationError } from '../errors';

// isOfficialPythonImage function might no longer be strictly necessary.
// function isOfficialPythonImage(image?: string): boolean { ... }

export class PythonDockerEngine implements LanguageEngine {
  async prepare(task: ExecutionTask): Promise<PreparedCommand> {
    if (task.entrypoint === '' && task.files.size === 0) {
      return {
        args: task.options.args || [],
        env: task.options.env || {},
        cwd: "/stonebox_workspace",
      };
    }

    // Default to 'python3' if pythonPath is not specified.
    // This is the command that will be executed inside the Docker container.
    const pythonCommand = (task.options.languageOptions?.pythonPath as string) || 'python3'; 
    
    if (!task.entrypoint) {
        throw new StoneboxConfigurationError('PythonDockerEngine: Entrypoint must be specified if not using image default command.');
    }
    
    // For Python, the script itself is usually the first argument to the interpreter.
    const scriptArgs: string[] = [task.entrypoint];

    if (task.options.args) {
      scriptArgs.push(...task.options.args);
    }

    // Always explicitly use the pythonCommand.
    // The image's ENTRYPOINT will receive this command and its arguments.
    return {
      command: pythonCommand, 
      args: scriptArgs,
      env: task.options.env || {},
      cwd: "/stonebox_workspace",
    };
  }
}