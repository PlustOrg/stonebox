// All public interfaces (to be implemented in later phases)

export interface StoneboxLanguageOptions {
  pythonPath?: string;
  nodePath?: string;
  tscPath?: string;
  processLimit?: number; // Unix: max number of processes for Python
  executionOverrides?: {
    uid?: number;
    gid?: number;
  };
  [key: string]: any;
}

export interface StoneboxOptions {
  timeoutMs?: number; // Max execution time in ms
  memoryLimitMb?: number; // Max memory in MB (Node.js only)
  entrypoint?: string; // Default entrypoint file
  args?: string[]; // Default args
  stdin?: string; // Default stdin
  env?: Record<string, string | undefined>; // Default environment variables
  languageOptions?: StoneboxLanguageOptions; // Language-specific options
}

export interface StoneboxExecuteOptions {
  timeoutMs?: number;
  memoryLimitMb?: number;
  entrypoint?: string;
  args?: string[];
  stdin?: string;
  env?: Record<string, string | undefined>;
  languageOptions?: StoneboxLanguageOptions;
}

export interface StoneboxExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
}
