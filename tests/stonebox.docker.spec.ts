import Docker from 'dockerode';
import { Stonebox, ExecutionEnvironment, EnvironmentOptions } from '../src';

beforeAll(async () => {
  try {
    const docker = new Docker();
    await docker.info();
    console.log('[Docker Tests] Docker connection successful. Docker tests will run.');
  } catch (e: any) {
    throw new Error(`Docker is not available or connection failed. Skipping Docker integration tests. Original error: ${e.message}`);
  }
});

describe('Stonebox Docker Execution', () => {
  jest.setTimeout(60000);

  async function withEnvironment(
    options: EnvironmentOptions,
    testFn: (env: ExecutionEnvironment) => Promise<void>,
  ) {
    const stonebox = new Stonebox();
    let env: ExecutionEnvironment | undefined;
    try {
      env = await stonebox.createEnvironment(options);
      await testFn(env);
    } finally {
      if (env) {
        await env.delete();
      }
    }
  }

  it('should execute JavaScript in a Node.js Docker container', async () => {
    await withEnvironment(
      { language: 'javascript', engineType: 'docker', dockerEngineOptions: { image: 'node:18-slim' } },
      async (env) => {
        await env.addFile('main.js', 'console.log("Hello from JS in Docker");');
        const result = await env.execute('node', ['main.js']);
        expect(result.stdout.trim()).toBe('Hello from JS in Docker');
      },
    );
  });
  
  it('should execute TypeScript (host compile, Docker JS run)', async () => {
    await withEnvironment(
      { language: 'typescript', engineType: 'docker', dockerEngineOptions: { image: 'node:18-slim' } },
      async (env) => {
        await env.addFile('main.ts', 'console.log("Hello from TS in Docker");');
        const result = await env.execute('node', ['main.ts']);
        expect(result.stdout.trim()).toBe('Hello from TS in Docker');
      },
    );
  });

  it('should block network access when networkMode is none', async () => {
      await withEnvironment(
          { 
              language: 'python', 
              engineType: 'docker', 
              dockerEngineOptions: { image: 'python:3.10-slim', networkMode: 'none' }
          },
          async (env) => {
              const script = 'import socket; print(socket.gethostbyname("google.com"))';
              await env.addFile('main.py', script);
              const result = await env.execute('python3', ['main.py']);

              // DEFINITIVE FIX: The stderr can be one of several messages depending on the OS.
              // We will use a regular expression to match either common failure mode.
              const networkErrorRegex = /Name or service not known|Temporary failure in name resolution/;
              expect(result.stderr).toMatch(networkErrorRegex);
              expect(result.exitCode).not.toBe(0);
          }
      );
  });

  it('should prevent writing to filesystem when workspace is read-only', async () => {
      await withEnvironment(
          {
              language: 'javascript',
              engineType: 'docker',
              dockerEngineOptions: { image: 'node:18-slim', workspaceMountMode: 'ro' }
          },
          async (env) => {
              const script = 'const fs = require("fs"); fs.writeFileSync("test.txt", "hello");';
              await env.addFile('main.js', script);
              const result = await env.execute('node', ['main.js']);
              expect(result.stderr).toContain('read-only file system');
              expect(result.exitCode).not.toBe(0);
          }
      );
  });

  it('should run code in a subdirectory within the container', async () => {
      await withEnvironment(
          {
              language: 'python',
              engineType: 'docker',
              dockerEngineOptions: { image: 'python:3.10-slim' }
          },
          async (env) => {
              await env.addFile('src/helpers.py', 'MESSAGE = "Hello from a subdir"');
              await env.addFile('src/main.py', 'from helpers import MESSAGE; print(MESSAGE)');
              const result = await env.execute('python3', ['src/main.py']);
              expect(result.stdout.trim()).toBe('Hello from a subdir');
              expect(result.exitCode).toBe(0);
          }
      )
  });
});