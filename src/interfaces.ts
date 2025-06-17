// All public interfaces

export type EngineType = 'process' | 'docker';

export type Language = 'javascript' | 'typescript' | 'python';

export interface DockerEngineSpecificOptions {
  image: string; // Mandatory: e.g., "python:3.9-slim", "node:latest"
  dockerodeOptions?: Record<string, unknown>; // Options for dockerode connection
  pullPolicy?: 'Always' | 'IfNotPresent' | 'Never'; // Default 'IfNotPresent'
  networkMode?: string;
  workspaceMountMode?: 'rw' | 'ro';
  cpuShares?: number;
  cpuPeriod?: number;
  cpuQuota?: number;
  pidsLimit?: number;
  capDrop?: string[] | 'ALL';
  capAdd?: string[];
  noNewPrivileges?: boolean;
  readonlyRootfs?: boolean;
}

export interface StoneboxLanguageOptions {
  pythonPath?: string;
  nodePath?: string;
  tscPath?: string;
  processLimit?: number; // Unix: max number of processes for Python
  executionOverrides?: {
    uid?: number;
    gid?: number;
  };
  __STONEBOX_DIAGNOSTIC_PRESERVE_CONTAINER?: boolean;
  [key: string]: any;
}

export interface EnvironmentOptions {
  language: Language; // Required: language for the environment
  timeoutMs?: number;
  memoryLimitMb?: number;
  env?: Record<string, string | undefined>; // Default environment variables
  languageOptions?: StoneboxLanguageOptions;
  engineType?: EngineType;
  dockerEngineOptions?: DockerEngineSpecificOptions;
}

// DEFINITIVE FIX: `stdin` has been removed.
export interface ExecuteOptions {
  timeoutMs?: number;
  memoryLimitMb?: number;
  env?: Record<string, string | undefined>;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
}

export interface ExecutionEnvironment {
  readonly tempPath: string;
  readonly options: EnvironmentOptions;

  addFile(path: string, content: string): Promise<void>;
  addFiles(files: Array<{ path: string; content: string }>): Promise<void>;
  execute(command: string, args?: string[], options?: ExecuteOptions): Promise<ExecutionResult>;
  delete(): Promise<void>;
}

export interface Stonebox {
  createEnvironment(options: EnvironmentOptions): Promise<ExecutionEnvironment>;
}