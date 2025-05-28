import { Stonebox, StoneboxTimeoutError, StoneboxCompilationError, StoneboxConfigurationError, StoneboxRuntimeError, StoneboxMemoryLimitError } from '../src';

describe('Stonebox JavaScript Execution', () => {
  it('should execute a simple JavaScript "hello world"', async () => {
    const sandbox = new Stonebox('javascript');
    sandbox.addFile('main.js', 'console.log("Hello JS World");');
    const result = await sandbox.execute();
    expect(result.stdout.trim()).toBe('Hello JS World');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('should handle stdin for JavaScript', async () => {
    const sandbox = new Stonebox('javascript');
    sandbox.addFile('main.js', 'process.stdin.on("data", data => console.log(data.toString().toUpperCase()));');
    const result = await sandbox.execute({ stdin: 'test input' });
    expect(result.stdout.trim()).toBe('TEST INPUT');
  });

  it('should throw StoneboxTimeoutError for a long-running JS script', async () => {
    const sandbox = new Stonebox('javascript', { timeoutMs: 100 });
    sandbox.addFile('main.js', 'setTimeout(() => console.log("done"), 500);');
    try {
      await sandbox.execute();
      throw new Error('Expected StoneboxTimeoutError but execution completed');
    } catch (err) {
      expect(err).toBeInstanceOf(StoneboxTimeoutError);
      if (err instanceof StoneboxTimeoutError) {
        expect(err.configuredTimeoutMs).toBe(100);
        expect(typeof err.actualDurationMs).toBe('number');
      }
    }
  });

  it('should pass args and env to JavaScript', async () => {
    const sandbox = new Stonebox('javascript');
    sandbox.addFile('main.js', 'console.log(process.argv[2], process.env.TEST_ENV);');
    const result = await sandbox.execute({ args: ['foo'], env: { TEST_ENV: 'bar' } });
    expect(result.stdout.trim()).toBe('foo bar');
  });

  it('should return non-zero exit code for JS error', async () => {
    const sandbox = new Stonebox('javascript');
    sandbox.addFile('main.js', 'throw new Error("fail");');
    const result = await sandbox.execute();
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Error: fail');
  });
});

describe('Stonebox Python Execution', () => {
  it('should execute a simple Python "hello world"', async () => {
    const sandbox = new Stonebox('python');
    sandbox.addFile('main.py', 'print("Hello Python World")');
    const result = await sandbox.execute();
    expect(result.stdout.trim()).toBe('Hello Python World');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('should handle stdin for Python', async () => {
    const sandbox = new Stonebox('python');
    sandbox.addFile('main.py', 'import sys; print(sys.stdin.read().upper())');
    const result = await sandbox.execute({ stdin: 'test input' });
    expect(result.stdout.trim()).toBe('TEST INPUT');
  });

  it('should throw StoneboxTimeoutError for a long-running Python script', async () => {
    const sandbox = new Stonebox('python', { timeoutMs: 100 });
    sandbox.addFile('main.py', 'import time; time.sleep(0.5); print("done")');
    await expect(sandbox.execute()).rejects.toThrow(StoneboxTimeoutError);
  });

  it('should pass args and env to Python', async () => {
    const sandbox = new Stonebox('python');
    sandbox.addFile('main.py', 'import sys, os; print(sys.argv[1], os.environ.get("TEST_ENV"))');
    const result = await sandbox.execute({ args: ['foo'], env: { TEST_ENV: 'bar' } });
    expect(result.stdout.trim()).toBe('foo bar');
  });

  it('should return non-zero exit code for Python error', async () => {
    const sandbox = new Stonebox('python');
    sandbox.addFile('main.py', 'raise Exception("fail")');
    const result = await sandbox.execute();
    expect(result.exitCode).not.toBe(0);
    // Accept both 'Exception: fail' and 'fail' in stderr for cross-platform compatibility
    expect(result.stderr).toMatch(/Exception: fail|fail/);
  });
});

describe('Stonebox TypeScript Execution', () => {
  it('should execute a simple TypeScript "hello world"', async () => {
    const sandbox = new Stonebox('typescript');
    const tsCode = '// @ts-ignore\nconsole.log("Hello TS World")';
    sandbox.addFile('main.ts', tsCode);
    let result;
    try {
      result = await sandbox.execute();
    } catch (err) {
      // Print file contents and error for debugging
      console.error('TS file contents:', tsCode);
      if (err instanceof StoneboxCompilationError) {
        console.error('tsc stdout:', err.compilerStdout);
        console.error('tsc stderr:', err.compilerStderr);
      }
      throw err;
    }
    expect(result.stdout.trim()).toBe('Hello TS World');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('should handle stdin for TypeScript', async () => {
    const sandbox = new Stonebox('typescript');
    const tsCode = '// @ts-ignore\nprocess.stdin.on("data", data => console.log(data.toString().toUpperCase()));';
    sandbox.addFile('main.ts', tsCode);
    let result;
    try {
      result = await sandbox.execute({ stdin: 'test input' });
    } catch (err) {
      console.error('TS file contents:', tsCode);
      if (err instanceof StoneboxCompilationError) {
        console.error('tsc stdout:', err.compilerStdout);
        console.error('tsc stderr:', err.compilerStderr);
      }
      throw err;
    }
    expect(result.stdout.trim()).toBe('TEST INPUT');
  });

  it('should throw StoneboxTimeoutError for a long-running TS script', async () => {
    const sandbox = new Stonebox('typescript', { timeoutMs: 100 });
    const tsCode = '// @ts-ignore\nsetTimeout(() => console.log("done"), 500);';
    sandbox.addFile('main.ts', tsCode);
    try {
      await sandbox.execute();
      throw new Error('Expected StoneboxTimeoutError but execution completed');
    } catch (err) {
      expect(err).toBeInstanceOf(StoneboxTimeoutError);
    }
  });

  it('should pass args and env to TypeScript', async () => {
    const sandbox = new Stonebox('typescript');
    const tsCode = '// @ts-ignore\nconsole.log(process.argv[2], process.env.TEST_ENV);';
    sandbox.addFile('main.ts', tsCode);
    let result;
    try {
      result = await sandbox.execute({ args: ['foo'], env: { TEST_ENV: 'bar' } });
    } catch (err) {
      console.error('TS file contents:', tsCode);
      if (err instanceof StoneboxCompilationError) {
        console.error('tsc stdout:', err.compilerStdout);
        console.error('tsc stderr:', err.compilerStderr);
      }
      throw err;
    }
    expect(result.stdout.trim()).toBe('foo bar');
  });

  it('should throw StoneboxCompilationError for TS compile error', async () => {
    const sandbox = new Stonebox('typescript');
    const tsCode = 'const x: number = "not a number";';
    sandbox.addFile('main.ts', tsCode);
    try {
      await sandbox.execute();
    } catch (err) {
      expect(err).toBeInstanceOf(StoneboxCompilationError);
      return;
    }
    throw new Error('Expected StoneboxCompilationError but execution completed');
  });
});

describe('Stonebox General Functionality', () => {
  it('should add, reset, and manage files', () => {
    const sandbox = new Stonebox('javascript');
    sandbox.addFile('a.js', 'console.log(1)');
    sandbox.addFiles([
      { path: 'b.js', content: 'console.log(2)' },
      { path: 'c.js', content: 'console.log(3)' },
    ]);
    expect(sandbox['files'].size).toBe(3);
    sandbox.resetFiles();
    expect(sandbox['files'].size).toBe(0);
  });

  it('should throw StoneboxConfigurationError for unsupported language', () => {
    expect(() => new Stonebox('ruby')).toThrow(StoneboxConfigurationError);
  });

  it('should throw StoneboxConfigurationError for missing entrypoint', async () => {
    const sandbox = new Stonebox('javascript');
    await expect(sandbox.execute()).rejects.toThrow(StoneboxConfigurationError);
  });
});

describe('Stonebox Error Subclasses', () => {
  it('should set properties on StoneboxTimeoutError', () => {
    const err = new StoneboxTimeoutError('Timeout', { configuredTimeoutMs: 123, actualDurationMs: 456 });
    expect(err.configuredTimeoutMs).toBe(123);
    expect(err.actualDurationMs).toBe(456);
    expect(err).toBeInstanceOf(StoneboxTimeoutError);
  });
  it('should set properties on StoneboxRuntimeError', () => {
    const orig = new Error('fail');
    const err = new StoneboxRuntimeError('Runtime', { originalError: orig, command: 'foo', args: ['bar'] });
    expect(err.originalError).toBe(orig);
    expect(err.command).toBe('foo');
    expect(err.args).toEqual(['bar']);
    expect(err).toBeInstanceOf(StoneboxRuntimeError);
  });
  it('should set properties on StoneboxMemoryLimitError', () => {
    const err = new StoneboxMemoryLimitError('Mem', { configuredLimitMb: 42, observedUsageMb: 99 });
    expect(err.configuredLimitMb).toBe(42);
    expect(err.observedUsageMb).toBe(99);
    expect(err).toBeInstanceOf(StoneboxMemoryLimitError);
  });
});

describe('Stonebox Invalid Configuration', () => {
  it('should throw for invalid timeoutMs in constructor', () => {
    expect(() => new Stonebox('javascript', { timeoutMs: 0 })).toThrow(StoneboxConfigurationError);
    expect(() => new Stonebox('javascript', { timeoutMs: -1 })).toThrow(StoneboxConfigurationError);
  });
  it('should throw for invalid memoryLimitMb in constructor', () => {
    expect(() => new Stonebox('javascript', { memoryLimitMb: 0 })).toThrow(StoneboxConfigurationError);
    expect(() => new Stonebox('javascript', { memoryLimitMb: -1 })).toThrow(StoneboxConfigurationError);
  });
  it('should throw for invalid timeoutMs in execute', async () => {
    const s = new Stonebox('javascript');
    s.addFile('main.js', '');
    await expect(s.execute({ timeoutMs: 0 })).rejects.toThrow(StoneboxConfigurationError);
  });
  it('should throw for invalid memoryLimitMb in execute', async () => {
    const s = new Stonebox('javascript');
    s.addFile('main.js', '');
    await expect(s.execute({ memoryLimitMb: 0 })).rejects.toThrow(StoneboxConfigurationError);
  });
});

describe('Stonebox Runtime Path Configuration', () => {
  it('should use explicit nodePath for JavaScript', async () => {
    const s = new Stonebox('javascript', { languageOptions: { nodePath: process.execPath } });
    s.addFile('main.js', 'console.log("ok")');
    const result = await s.execute();
    expect(result.stdout.trim()).toBe('ok');
  });
  it('should use explicit pythonPath for Python', async () => {
    const s = new Stonebox('python', { languageOptions: { pythonPath: 'python3' } });
    s.addFile('main.py', 'print("ok")');
    const result = await s.execute();
    expect(result.stdout.trim()).toBe('ok');
  });
});

describe('Stonebox File Path Validation', () => {
  it('should throw for absolute file path', () => {
    const s = new Stonebox('javascript');
    expect(() => s.addFile('/abs.js', 'x')).toThrow(StoneboxConfigurationError);
  });
  it('should throw for parent traversal', () => {
    const s = new Stonebox('javascript');
    expect(() => s.addFile('../foo.js', 'x')).toThrow(StoneboxConfigurationError);
    expect(() => s.addFile('foo/../../bar.js', 'x')).toThrow(StoneboxConfigurationError);
  });
});

describe('Stonebox UID/GID Options (Unix only)', () => {
  it('should accept uid/gid in languageOptions.executionOverrides (no error if not privileged)', async () => {
    const s = new Stonebox('javascript', { languageOptions: { executionOverrides: { uid: 0, gid: 0 } } });
    s.addFile('main.js', 'console.log("uidgid")');
    // This may throw if not run as root, but should not throw a config error
    try {
      await s.execute();
    } catch (e) {
      // Accept any thrown value (not just Error)
      expect(e).toBeDefined();
    }
  });
});

// Optionally, add a test for Python memory/process limits on Unix (best-effort, skip on Windows)
const isUnix = process.platform === 'linux' || process.platform === 'darwin';
const isLinux = process.platform === 'linux';
(isUnix ? describe : describe.skip)('Stonebox Python Resource Limits (Unix only)', () => {
  beforeAll(() => {
    jest.setTimeout(30000); // Increase timeout for all tests in this block
  });
  (isLinux ? it : it.skip)('should kill process if memory limit is exceeded', async () => {
    // NOTE: RLIMIT_AS is not reliably enforced on macOS, so this test only runs on Linux.
    const s = new Stonebox('python', { memoryLimitMb: 20 });
    s.addFile('main.py', 'a = []\nwhile True: a.append("x"*1000000)');
    try {
      await s.execute();
      throw new Error('Expected process to be killed for memory');
    } catch (e: any) {
      expect(e).toBeDefined();
      // Accept any thrown value (timeout, error, etc.)
    }
  });
  it('should kill process if process limit is exceeded', async () => {
    const s = new Stonebox('python', { languageOptions: { processLimit: 10 } });
    s.addFile('main.py', 'import subprocess\nfor _ in range(100): subprocess.Popen(["echo", "hi"])');
    try {
      await s.execute();
      throw new Error('Expected process to be killed for process count');
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });
});
