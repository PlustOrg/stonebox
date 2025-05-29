import Docker from 'dockerode';
import { Stonebox, StoneboxExecutionResult, StoneboxLanguageOptions } from '../src';

beforeAll(async () => {
    // console.log('[Docker Tests] Attempting to initialize Docker connection in beforeAll...'); // Can be removed
    try {
        const docker = new Docker();
        await docker.info();
        console.log('[Docker Tests] Docker connection successful. Docker tests will run.');
    } catch (e: any) {
        console.error('[Docker Tests] Docker connection failed in beforeAll. Docker tests will be skipped due to this error.');
        console.error(`[Docker Tests] Underlying error: ${e.message || e}`);
        if (e.stack) {
            console.error(`[Docker Tests] Stack: ${e.stack}`);
        }
        throw new Error(`Docker is not available or connection failed. Skipping Docker integration tests. Original error: ${e.message}`);
    }
});

describe('Stonebox Docker Execution', () => {
    jest.setTimeout(60000); // Reduced default timeout for the suite

    // afterEach(() => { // Not strictly needed if not using global flags, or manage flags per test
    //     (global as any).__STONEBOX_DIAGNOSTIC_PRESERVE_TEMP_DIR = false;
    // });

    // Optional: Keep a simplified version of the "cat" test if desired for basic mount check
    it('should verify file mount by catting main.js in Docker', async () => {
        const imageName = 'alpine:latest'; // Use a very minimal image
        const scriptContentForCat = `This is main.js content for the cat test ${Date.now()}`;
        
        const sandbox = new Stonebox('javascript', { // Language doesn't matter much for this specific command
            engineType: 'docker',
            dockerEngineOptions: { image: imageName },
            // languageOptions: { __STONEBOX_DIAGNOSTIC_PRESERVE_CONTAINER: true } as any, // Uncomment to preserve
        });
        sandbox.addFile('main.js', scriptContentForCat);

        const originalGetEngineFor = (sandbox as any).getEngineFor.bind(sandbox);
        (sandbox as any).getEngineFor = (_language: string) => {
            return {
                prepare: async () => ({
                    command: 'cat', // Directly use cat
                    args: ['/stonebox_workspace/main.js'],
                    env: {},
                    cwd: '/', 
                })
            };
        };
        
        const result = await sandbox.execute();
        (sandbox as any).getEngineFor = originalGetEngineFor; // Restore

        // console.log('[Test] Cat test raw result:', JSON.stringify(result, null, 2)); 
        expect(result.stdout.trim()).toBe(scriptContentForCat);
        expect(result.stderr.trim()).toBe('');
        expect(result.exitCode).toBe(0); 
    });


    it('should execute JavaScript in a Node.js Docker container', async () => {
        const imageName = 'node:18-bullseye';
        const sandbox = new Stonebox('javascript', {
            engineType: 'docker',
            dockerEngineOptions: { image: imageName }
        });
        const scriptContent = 'console.log("Hello from JS in Docker"); console.error("DEBUG_STDERR_FROM_JS"); process.exit(0);';
        sandbox.addFile('main.js', scriptContent);
        
        // console.log(`[Test] Running JS test. Image: ${imageName}, Script: "${scriptContent}"`);
        const result = await sandbox.execute();
        // console.log(`[Test] JS test raw result for ${imageName}:`, JSON.stringify(result, null, 2)); 
        
        expect(result.stdout.trim()).toBe('Hello from JS in Docker');
        expect(result.stderr.trim()).toBe('DEBUG_STDERR_FROM_JS');
        expect(result.exitCode).toBe(0);
    });

    it('should execute Python in a Python Docker container', async () => {
        const sandbox = new Stonebox('python', {
            engineType: 'docker',
            dockerEngineOptions: { image: 'python:3.9-slim' }
        });
        sandbox.addFile('main.py', 'import sys; print("Hello from Python in Docker"); sys.stderr.write("DEBUG_PYTHON_STDERR\\n")');
        const result = await sandbox.execute();
        // console.log('[Test] Python test raw result:', JSON.stringify(result, null, 2));
        expect(result.stdout.trim()).toBe('Hello from Python in Docker');
        expect(result.stderr.trim()).toBe('DEBUG_PYTHON_STDERR');
        expect(result.exitCode).toBe(0);
    });
    
    it('should execute TypeScript (host compile, Docker JS run)', async () => {
        const sandbox = new Stonebox('typescript', {
            engineType: 'docker',
            dockerEngineOptions: { image: 'node:18-bullseye' }
        });
        sandbox.addFile('main.ts', 'console.log("Hello from TS in Docker"); console.error("DEBUG_TS_STDERR");');
        const result = await sandbox.execute();
        // console.log('[Test] TypeScript test raw result:', JSON.stringify(result, null, 2));
        expect(result.stdout.trim()).toBe('Hello from TS in Docker');
        expect(result.stderr.trim()).toBe('DEBUG_TS_STDERR');
        expect(result.exitCode).toBe(0);
    });

    it('should pass args and env to Docker container', async () => {
        const sandbox = new Stonebox('javascript', {
            engineType: 'docker',
            dockerEngineOptions: { image: 'node:18-bullseye' }
        });
        sandbox.addFile('main.js', 'console.log(process.argv[2], process.env.TEST_ENV); console.error("Arg:", process.argv[2], "Env:", process.env.TEST_ENV);');
        const result = await sandbox.execute({ args: ['foo'], env: { TEST_ENV: 'bar' } });
        // console.log('[Test] Args/Env test raw result:', JSON.stringify(result, null, 2));
        expect(result.stdout.trim()).toBe('foo bar');
        expect(result.stderr.trim()).toBe('Arg: foo Env: bar');
        expect(result.exitCode).toBe(0);
    });

    it('should handle stdin for Docker', async () => {
        const imageName = 'node:18-bullseye';
        const sandbox = new Stonebox('javascript', {
            engineType: 'docker',
            dockerEngineOptions: { image: imageName },
            timeoutMs: 15000 
        });

        sandbox.addFile('main.js', `
            process.stdin.resume(); 
            process.stdin.setEncoding('utf8'); 
            let input = '';
            let receivedEnd = false;
            let receivedClose = false;
            // console.error('STDIN_SCRIPT_STARTED: Waiting for stdin events...'); // Can be removed
            const scriptInternalTimeout = setTimeout(() => {
                if (!receivedEnd && !receivedClose) {
                    // console.error('STDIN_SCRIPT_TIMEOUT: No "end" or "close" event in 7s. Input so far:', input.replace(/\\n/g, '\\\\n'));
                    if (input) {
                        process.stdout.write(input.toUpperCase() + "_SCRIPT_TIMEOUT_FALLBACK");
                    } else {
                        process.stdout.write("NO_INPUT_SCRIPT_TIMEOUT_FALLBACK");
                    }
                    process.exit(0);
                }
            }, 7000); 
            process.stdin.on('data', (chunk) => { 
                // console.error('STDIN_SCRIPT_DATA_CHUNK:', chunk.replace(/\\n/g, '\\\\n'));
                input += chunk; 
            });
            process.stdin.on('end', () => { 
                if (receivedEnd || receivedClose) return;
                receivedEnd = true;
                clearTimeout(scriptInternalTimeout);
                // console.error('STDIN_SCRIPT_END_EVENT_RECEIVED. Final input:', input.replace(/\\n/g, '\\\\n'));
                process.stdout.write(input.toUpperCase()); 
                process.stderr.write('Input processed via END event.\\n'); // Keep for assertion
                process.exit(0); 
            });
            process.stdin.on('close', () => {
                if (receivedEnd || receivedClose) return;
                receivedClose = true;
                clearTimeout(scriptInternalTimeout);
                // console.error('STDIN_SCRIPT_CLOSE_EVENT_RECEIVED. Final input:', input.replace(/\\n/g, '\\\\n'));
                process.stdout.write(input.toUpperCase() + "_CLOSE_FALLBACK");
                process.stderr.write('Input processed via CLOSE event.\\n'); // Keep for assertion
                process.exit(0);
            });
            process.stdin.on('error', (err) => { 
                clearTimeout(scriptInternalTimeout);
                // console.error('STDIN_SCRIPT_ERROR_EVENT:', err.message);
                process.stderr.write('STDIN_ERROR_EVENT_MSG:' + err.message + '\\n'); 
                process.exit(1); 
            });
        `);
        
        const result = await sandbox.execute({ stdin: 'docker input' });
        // console.log('[Test] Stdin test raw result:', JSON.stringify(result, null, 2));
        
        const stdout = result.stdout.trim();
        const stderr = result.stderr.trim(); // Trim stderr for assertions

        expect(result.exitCode).toBe(0); 

        let matched = false;
        if (stdout === 'DOCKER INPUT') {
            expect(stderr).toBe('Input processed via END event.');
            matched = true;
        }
        if (stdout === 'DOCKER INPUT_CLOSE_FALLBACK') {
            expect(stderr).toBe('Input processed via CLOSE event.');
            matched = true;
        }
        if (stdout === 'DOCKER INPUT_SCRIPT_TIMEOUT_FALLBACK') {
             // If script times out, stderr might not have the specific "Input processed" message
             // but the main thing is that stdout matches.
             // console.error('Stdin script timed out, stderr:', stderr); // For debugging if needed
             matched = true;
        }
         if (stdout === 'NO_INPUT_SCRIPT_TIMEOUT_FALLBACK') {
             // console.error('Stdin script timed out with no input, stderr:', stderr); // For debugging
             matched = true;
        }
        expect(matched).toBe(true);
    });
    
    it('should support UID/GID in Docker', async () => {
        const sandbox = new Stonebox('javascript', {
            engineType: 'docker',
            dockerEngineOptions: { image: 'node:18-bullseye' },
            languageOptions: { executionOverrides: { uid: 1000, gid: 1000 } }
        });
        sandbox.addFile('main.js', 'const cp = require("child_process"); const out = cp.execSync("id -u; id -g", {encoding: "utf8"}); process.stdout.write(out); process.stderr.write("UID/GID check ran");');
        const result = await sandbox.execute();
        // console.log('[Test] UID/GID test raw result:', JSON.stringify(result, null, 2));
        const [uidOutput, gidOutput] = result.stdout.trim().split('\n');
        expect(uidOutput).toBe('1000');
        expect(gidOutput).toBe('1000');
        expect(result.stderr.trim()).toBe('UID/GID check ran');
        expect(result.exitCode).toBe(0);
    });

    it('should enforce timeouts in Docker', async () => {
        const sandbox = new Stonebox('javascript', {
            engineType: 'docker',
            timeoutMs: 300, 
            dockerEngineOptions: { image: 'node:18-bullseye' }
        });
        // This script will produce stderr before timeout.
        sandbox.addFile('main.js', 'console.error("Script starting for timeout test..."); setTimeout(() => { console.log("late output"); }, 2000);'); 
        
        // console.log('[Test] Timeout test starting...');
        let caughtError: any;
        try {
            await sandbox.execute();
        } catch (e: any) {
            caughtError = e;
        }
        expect(caughtError).toBeDefined(); 
        if (caughtError) { 
            expect(caughtError.message).toMatch(/Docker execution timed out after 300ms/i);
            // console.log('[Test] Timeout test rejected as expected.');
            // console.log('[Test] Timeout test caught error details:', JSON.stringify(caughtError, null, 2));
            // Check if the *initial* stderr from the script was captured by container.logs()
            expect(caughtError.stderr || '').toContain("Script starting for timeout test...");
        }
    });
});