// Custom error classes (to be implemented in later phases)
export class StoneboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoneboxError';
  }
}

export class StoneboxConfigurationError extends StoneboxError {
  constructor(message: string) {
    super(message);
    this.name = 'StoneboxConfigurationError';
  }
}

export class StoneboxTimeoutError extends StoneboxError {
  configuredTimeoutMs?: number;
  actualDurationMs?: number;
  stdout?: string;
  stderr?: string;
  constructor(message: string, opts?: { configuredTimeoutMs?: number; actualDurationMs?: number; stdout?: string; stderr?: string }) {
    super(message);
    this.name = 'StoneboxTimeoutError';
    if (opts) {
      this.configuredTimeoutMs = opts.configuredTimeoutMs;
      this.actualDurationMs = opts.actualDurationMs;
      this.stdout = opts.stdout;
      this.stderr = opts.stderr;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StoneboxCompilationError extends StoneboxError {
  compilerStdout?: string;
  compilerStderr?: string;
  constructor(message: string, opts?: { stdout?: string; stderr?: string }) {
    super(message);
    this.name = 'StoneboxCompilationError';
    this.compilerStdout = opts?.stdout;
    this.compilerStderr = opts?.stderr;
  }
}

export class StoneboxMemoryLimitError extends StoneboxError {
  configuredLimitMb?: number;
  observedUsageMb?: number;
  constructor(message: string, opts?: { configuredLimitMb?: number; observedUsageMb?: number }) {
    super(message);
    this.name = 'StoneboxMemoryLimitError';
    if (opts) {
      this.configuredLimitMb = opts.configuredLimitMb;
      this.observedUsageMb = opts.observedUsageMb;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StoneboxRuntimeError extends StoneboxError {
  originalError?: Error | any;
  command?: string;
  args?: string[];
  constructor(
    message: string,
    opts?: { originalError?: Error | any; command?: string; args?: string[] },
  ) {
    super(message);
    this.name = 'StoneboxRuntimeError';
    if (opts) {
      this.originalError = opts.originalError;
      this.command = opts.command;
      this.args = opts.args;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
