// All public interfaces

export type EngineType = 'process' | 'docker';

export interface DockerEngineSpecificOptions {
  image: string; // Mandatory: e.g., "python:3.9-slim", "node:latest"
  dockerodeOptions?: Record<string, unknown>; // Options for dockerode connection
  pullPolicy?: 'Always' | 'IfNotPresent' | 'Never'; // Default 'IfNotPresent'
  /**
   * Network isolation: Docker network mode. Examples: 'none', 'bridge', custom network name.
   * If not set, Docker default applies (usually 'bridge').
   */
  networkMode?: string;
  /**
   * Workspace mount mode: 'rw' (read-write, default) or 'ro' (read-only).
   * If not set, defaults to 'rw'.
   */
  workspaceMountMode?: 'rw' | 'ro';
  /**
   * CPU resource controls. If not set, Docker default applies (no limit).
   */
  cpuShares?: number;
  cpuPeriod?: number;
  cpuQuota?: number;
  /**
   * Limit max number of processes (PIDs) in the container. If not set, Docker default applies.
   */
  pidsLimit?: number;
  /**
   * Kernel capabilities: drop/add. If not set, Docker default applies (no extra drop/add).
   * capDrop: string[] or 'ALL' to drop all capabilities.
   * capAdd: string[] to add capabilities.
   */
  capDrop?: string[] | 'ALL';
  capAdd?: string[];
  /**
   * no-new-privileges security option. If true, sets 'no-new-privileges'. Default: false (not set).
   */
  noNewPrivileges?: boolean;
  /**
   * Make root filesystem read-only. If true, sets ReadonlyRootfs. Default: false (writable root).
   */
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
  __STONEBOX_DIAGNOSTIC_PRESERVE_CONTAINER?: boolean; // Diagnostic flag
  [key: string]: any; // Allow other properties for flexibility
}

export interface StoneboxOptions {
  timeoutMs?: number; // Max execution time in ms
  memoryLimitMb?: number; // Max memory in MB (Node.js & Docker, Python on Unix)
  entrypoint?: string; // Default entrypoint file
  args?: string[]; // Default args
  stdin?: string; // Default stdin
  env?: Record<string, string | undefined>; // Default environment variables
  languageOptions?: StoneboxLanguageOptions; // Language-specific options
  engineType?: EngineType; // Default to 'process' if not specified
  dockerEngineOptions?: DockerEngineSpecificOptions;
}

export interface StoneboxExecuteOptions {
  timeoutMs?: number;
  memoryLimitMb?: number;
  entrypoint?: string;
  args?: string[];
  stdin?: string;
  env?: Record<string, string | undefined>;
  languageOptions?: StoneboxLanguageOptions; // Allow overriding/extending at execute time
}

export interface StoneboxExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
}