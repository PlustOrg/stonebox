import { Stonebox, StoneboxTimeoutError, StoneboxCompilationError, StoneboxConfigurationError } from '../src';

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
    await expect(sandbox.execute()).rejects.toThrow(StoneboxTimeoutError);
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
    expect(result.stderr).toContain('Exception: fail');
  });
});

describe('Stonebox TypeScript Execution', () => {
  it('should execute a simple TypeScript "hello world"', async () => {
    const sandbox = new Stonebox('typescript');
    sandbox.addFile('main.ts', 'console.log("Hello TS World")');
    const result = await sandbox.execute();
    expect(result.stdout.trim()).toBe('Hello TS World');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('should handle stdin for TypeScript', async () => {
    const sandbox = new Stonebox('typescript');
    sandbox.addFile('main.ts', 'process.stdin.on("data", data => console.log(data.toString().toUpperCase()));');
    const result = await sandbox.execute({ stdin: 'test input' });
    expect(result.stdout.trim()).toBe('TEST INPUT');
  });

  it('should throw StoneboxTimeoutError for a long-running TS script', async () => {
    const sandbox = new Stonebox('typescript', { timeoutMs: 100 });
    sandbox.addFile('main.ts', 'setTimeout(() => console.log("done"), 500);');
    await expect(sandbox.execute()).rejects.toThrow(StoneboxTimeoutError);
  });

  it('should pass args and env to TypeScript', async () => {
    const sandbox = new Stonebox('typescript');
    sandbox.addFile('main.ts', 'console.log(process.argv[2], process.env.TEST_ENV);');
    const result = await sandbox.execute({ args: ['foo'], env: { TEST_ENV: 'bar' } });
    expect(result.stdout.trim()).toBe('foo bar');
  });

  it('should throw StoneboxCompilationError for TS compile error', async () => {
    const sandbox = new Stonebox('typescript');
    sandbox.addFile('main.ts', 'const x: number = "not a number";');
    await expect(sandbox.execute()).rejects.toThrow(StoneboxCompilationError);
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
