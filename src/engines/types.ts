import { StoneboxExecuteOptions, StoneboxOptions } from '../interfaces';
import { StoneboxCompilationError } from '../errors';

export interface ExecutionTask {
  files: Map<string, string>;
  entrypoint: string;
  options: StoneboxExecuteOptions & Partial<StoneboxOptions>;
  tempPath: string;
}

export interface PreparedCommand {
  command?: string; // Make command optional
  args: string[]; // Ensure args is always an array
  env: Record<string, string | undefined>;
  cwd: string;
}

export interface LanguageEngine {
  prepare(task: ExecutionTask): Promise<PreparedCommand | StoneboxCompilationError>;
}
