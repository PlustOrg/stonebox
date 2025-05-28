import { TypeScriptEngine } from '../../src/engines/typescriptEngine';
import { StoneboxCompilationError } from '../../src/errors';
import { ExecutionTask } from '../../src/engines/types';
import * as path from 'path';

// TypeScriptEngine tests (to be implemented in later phases)
describe('TypeScriptEngine', () => {
  const tempPath = path.join(__dirname, '../../tmp/ts-engine-test');
  const entrypoint = 'main.ts';
  const files = new Map<string, string>([[entrypoint, 'console.log("TS Engine Test")']]);
  const options = {};

  it('should prepare a valid command for TypeScript execution', async () => {
    const engine = new TypeScriptEngine();
    const task: ExecutionTask = { files, entrypoint, options, tempPath };
    const result = await engine.prepare(task);
    expect(result).toHaveProperty('command');
    expect(result).toHaveProperty('args');
    expect(result).toHaveProperty('cwd');
    expect(result).toHaveProperty('env');
  });

  it('should return StoneboxCompilationError for invalid TypeScript', async () => {
    const engine = new TypeScriptEngine();
    const badFiles = new Map<string, string>([[entrypoint, 'const x: number = "fail";']]);
    const task: ExecutionTask = { files: badFiles, entrypoint, options, tempPath };
    const result = await engine.prepare(task);
    expect(result).toBeInstanceOf(StoneboxCompilationError);
  });
});
