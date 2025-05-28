// All public interfaces (to be implemented in later phases)

export interface StoneboxOptions {
  timeoutMs?: number; // Max execution time in ms
  memoryLimitMb?: number; // Max memory in MB (Node.js only)
  entrypoint?: string; // Default entrypoint file
  args?: string[]; // Default args
  stdin?: string; // Default stdin
  env?: Record<string, string | undefined>; // Default environment variables
  languageOptions?: Record<string, any>; // Language-specific options
}

export interface StoneboxExecuteOptions {
  timeoutMs?: number;
  memoryLimitMb?: number;
  entrypoint?: string;
  args?: string[];
  stdin?: string;
  env?: Record<string, string | undefined>;
  languageOptions?: Record<string, any>;
}

export interface StoneboxExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
}
