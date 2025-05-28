import { TypeScriptEngine } from '../../src/engines/typescriptEngine';
import { StoneboxCompilationError } from '../../src/errors';
import { ExecutionTask } from '../../src/engines/types';
import * as path from 'path';
import * as fs from 'fs/promises';

// TypeScriptEngine tests (to be implemented in later phases)
describe('TypeScriptEngine', () => {
  const tempPath = path.join(__dirname, '../../tmp/ts-engine-test');
  const entrypoint = 'main.ts';
  const files = new Map<string, string>([[entrypoint, 'console.log("TS Engine Test")']]);
  const options = {};

  beforeAll(async () => {
    await fs.mkdir(tempPath, { recursive: true });
    // Write the entrypoint file to the tempPath
    await fs.writeFile(path.join(tempPath, entrypoint), files.get(entrypoint) || '', 'utf8');
  });
  afterAll(async () => {
    await fs.rm(tempPath, { recursive: true, force: true });
  });

  it('should prepare a valid command for TypeScript execution', async () => {
    const engine = new TypeScriptEngine();
    const task: ExecutionTask = { files, entrypoint, options, tempPath };
    const result = await engine.prepare(task);
    if (result instanceof StoneboxCompilationError) {
      // Print the error for debugging
      console.error(result.compilerStderr);
    }
    expect(result).not.toBeInstanceOf(StoneboxCompilationError);
    expect(result).toHaveProperty('command');
    expect(result).toHaveProperty('args');
    expect(result).toHaveProperty('cwd');
    expect(result).toHaveProperty('env');
  });

  it('should return StoneboxCompilationError for invalid TypeScript', async () => {
    const engine = new TypeScriptEngine();
    const badFiles = new Map<string, string>([[entrypoint, 'const x: number = "fail";']]);
    // Write the bad file
    await fs.writeFile(path.join(tempPath, entrypoint), badFiles.get(entrypoint) || '', 'utf8');
    const task: ExecutionTask = { files: badFiles, entrypoint, options, tempPath };
    const result = await engine.prepare(task);
    expect(result).toBeInstanceOf(StoneboxCompilationError);
  });
});
