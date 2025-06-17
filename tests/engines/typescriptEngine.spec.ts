import { TypeScriptEngine } from '../../src/engines/typescriptEngine';
import { StoneboxCompilationError } from '../../src/errors';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ExecutionEnvironment } from '../../src/environment';

describe('TypeScriptEngine', () => {
  let testEnv: ExecutionEnvironment;
  const tempPath = path.join(__dirname, '../../tmp_test/ts-engine-test');
  const entrypoint = 'main.ts';

  beforeEach(async () => {
    await fs.rm(tempPath, { recursive: true, force: true });
    await fs.mkdir(tempPath, { recursive: true });
    testEnv = await ExecutionEnvironment.create({ language: 'typescript' });
    // This is a common pattern for testing things that need a constructed state.
    (testEnv as any).tempPath = tempPath;
  });

  afterAll(async () => {
    await fs.rm(tempPath, { recursive: true, force: true });
  });

  it('should prepare a valid command for TypeScript execution', async () => {
    await fs.writeFile(path.join(tempPath, entrypoint), 'console.log("TS Engine Test")', 'utf8');
    const engine = new TypeScriptEngine();
    const result = await engine.prepare(testEnv, 'node', [entrypoint], {});
    
    expect(result).not.toBeInstanceOf(StoneboxCompilationError);
    if (!(result instanceof StoneboxCompilationError)) {
        expect(result.command).toBeDefined();
        expect(result.args[0]).toContain(path.join('compiled_ts', entrypoint.replace('.ts', '.js')));
    }
  });

  it('should return StoneboxCompilationError for invalid TypeScript', async () => {
    await fs.writeFile(path.join(tempPath, entrypoint), 'const x: number = "fail";', 'utf8');
    const engine = new TypeScriptEngine();
    // FIX: The call to `prepare` should be wrapped in an expect().rejects block
    await expect(engine.prepare(testEnv, 'node', [entrypoint], {})).rejects.toThrow(StoneboxCompilationError);
  });
});