import {
  Stonebox,
  StoneboxTimeoutError,
  StoneboxCompilationError,
  StoneboxConfigurationError,
  ExecutionEnvironment,
} from '../src';

// Helper function to create and automatically clean up an environment
async function withEnvironment(options: any, testFn: (env: ExecutionEnvironment) => Promise<void>) {
    const stonebox = new Stonebox();
    let env: ExecutionEnvironment | undefined;
    try {
        env = await stonebox.createEnvironment(options);
        await testFn(env);
    } finally {
        if (env) await env.delete();
    }
}

describe('Stonebox Process Execution', () => {
    it('should execute a simple JavaScript "hello world"', async () => {
        await withEnvironment({ language: 'javascript' }, async (env) => {
            await env.addFile('main.js', 'console.log("Hello JS World");');
            const result = await env.execute('node', ['main.js']);
            expect(result.stdout.trim()).toBe('Hello JS World');
            expect(result.exitCode).toBe(0);
        });
    });

    it('should handle multi-file JavaScript imports', async () => {
        await withEnvironment({ language: 'javascript' }, async (env) => {
            await env.addFile('lib.js', 'module.exports = { message: "Hello from a module" };');
            await env.addFile('main.js', 'const lib = require("./lib.js"); console.log(lib.message);');
            const result = await env.execute('node', ['main.js']);
            expect(result.stdout.trim()).toBe('Hello from a module');
            expect(result.exitCode).toBe(0);
        });
    });

    it('should handle sub-directory imports in JavaScript', async () => {
        await withEnvironment({ language: 'javascript' }, async (env) => {
            await env.addFile('utils/math.js', 'module.exports.add = (a, b) => a + b;');
            await env.addFile('main.js', 'const { add } = require("./utils/math.js"); console.log(add(5, 3));');
            const result = await env.execute('node', ['main.js']);
            expect(result.stdout.trim()).toBe('8');
            expect(result.exitCode).toBe(0);
        });
    });

    it('should throw StoneboxTimeoutError for a long-running script', async () => {
        await withEnvironment({ language: 'javascript', timeoutMs: 100 }, async (env) => {
            await env.addFile('main.js', 'setTimeout(() => {}, 500);');
            await expect(env.execute('node', ['main.js'])).rejects.toThrow(StoneboxTimeoutError);
        });
    });

    it('should execute a simple Python "hello world"', async () => {
        await withEnvironment({ language: 'python' }, async (env) => {
            await env.addFile('main.py', 'print("Hello Python World")');
            const result = await env.execute('python3', ['main.py']);
            expect(result.stdout.trim()).toBe('Hello Python World');
        });
    });

    it('should handle multi-file Python imports', async () => {
        await withEnvironment({ language: 'python' }, async (env) => {
            await env.addFile('helpers.py', 'def get_message():\n    return "Hello from a Python module"');
            await env.addFile('main.py', 'import helpers\nprint(helpers.get_message())');
            const result = await env.execute('python3', ['main.py']);
            expect(result.stdout.trim()).toBe('Hello from a Python module');
        });
    });
});