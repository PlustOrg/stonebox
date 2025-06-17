import { StoneboxCompilationError } from '../errors';
import { ExecutionEnvironment } from '../environment';
import { ExecuteOptions } from '../interfaces';

export interface PreparedCommand {
  command?: string; // Optional: Docker may use image's entrypoint
  args: string[];
  env: Record<string, string | undefined>;
  cwd: string;
}

export interface LanguageEngine {
  prepare(
    environment: ExecutionEnvironment,
    command: string,
    args: string[],
    options: ExecuteOptions,
  ): Promise<PreparedCommand | StoneboxCompilationError>;
}