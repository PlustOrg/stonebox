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
  constructor(message: string) {
    super(message);
    this.name = 'StoneboxTimeoutError';
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
  constructor(message: string) {
    super(message);
    this.name = 'StoneboxMemoryLimitError';
  }
}

export class StoneboxRuntimeError extends StoneboxError {
  constructor(message: string) {
    super(message);
    this.name = 'StoneboxRuntimeError';
  }
}
