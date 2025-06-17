import { EnvironmentOptions } from './interfaces';
import { StoneboxConfigurationError } from './errors';
import { ExecutionEnvironment } from './environment';

export class Stonebox {
  constructor() {
    // This constructor can be used for global configuration in the future
  }

  /**
   * Creates a new isolated execution environment.
   * This is the main entry point for the library.
   * @param options The configuration for the environment.
   * @returns A promise that resolves to an ExecutionEnvironment instance.
   */
  public async createEnvironment(options: EnvironmentOptions): Promise<ExecutionEnvironment> {
    // Validate options
    if (!options.language) {
      throw new StoneboxConfigurationError('The "language" property must be specified in EnvironmentOptions.');
    }
    if (options.timeoutMs !== undefined && (typeof options.timeoutMs !== 'number' || options.timeoutMs <= 0)) {
      throw new StoneboxConfigurationError('timeoutMs must be a positive number.');
    }
    if (options.memoryLimitMb !== undefined && (typeof options.memoryLimitMb !== 'number' || options.memoryLimitMb <= 0)) {
      throw new StoneboxConfigurationError('memoryLimitMb must be a positive number.');
    }
    if (options.engineType === 'docker') {
      if (!options.dockerEngineOptions || !options.dockerEngineOptions.image) {
        throw new StoneboxConfigurationError(
          "When engineType is 'docker', dockerEngineOptions.image must be provided.",
        );
      }
    }

    // Delegate creation to the static method on ExecutionEnvironment
    return ExecutionEnvironment.create(options);
  }
}