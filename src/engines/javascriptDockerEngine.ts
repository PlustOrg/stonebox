import { LanguageEngine, ExecutionTask, PreparedCommand } from './types';
import { StoneboxConfigurationError } from '../errors';

// isOfficialNodeImage function might no longer be strictly necessary if we always set the command.
// function isOfficialNodeImage(image?: string): boolean { ... }

export class JavaScriptDockerEngine implements LanguageEngine {
  async prepare(task: ExecutionTask): Promise<PreparedCommand> {
    if (task.entrypoint === '' && task.files.size === 0) {
      // For running image's default command
      return {
        args: task.options.args || [],
        env: task.options.env || {},
        cwd: '/stonebox_workspace',
      };
    }

    if (!task.entrypoint) {
      throw new StoneboxConfigurationError('JavaScriptDockerEngine: Entrypoint must be specified if not using image default command.');
    }

    const nodeCommand = (task.options.languageOptions?.nodePath as string) || 'node'; // This 'node' is what Docker will execute
    
    let scriptName = task.entrypoint;
    if (task.entrypoint.includes('/') || task.entrypoint.includes('\\')) {
        scriptName = task.entrypoint.split(/[\\/]/).pop() || task.entrypoint;
    }
    if (!scriptName && task.entrypoint) {
         scriptName = task.entrypoint; 
    }
    if (!scriptName) { 
        throw new StoneboxConfigurationError(`JavaScriptDockerEngine: Invalid entrypoint '${task.entrypoint}', resulted in empty script name.`);
    }
    
    const scriptArgs: string[] = [scriptName]; 

    if (task.options.args) {
      scriptArgs.push(...task.options.args);
    }

    // Always explicitly use the nodeCommand.
    // The Docker image's ENTRYPOINT (often /usr/local/bin/docker-entrypoint.sh)
    // will receive this command and its arguments.
    return {
      command: nodeCommand, 
      args: scriptArgs, 
      env: task.options.env || {},
      cwd: '/stonebox_workspace',
    };
  }
}