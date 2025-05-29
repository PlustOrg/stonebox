import { LanguageEngine, ExecutionTask, PreparedCommand } from './types';
import { StoneboxCompilationError } from '../errors';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import { buildSandboxEnv } from '../utils/envUtils';

// isOfficialNodeImage might not be needed if we always specify 'node' as command
// function isOfficialNodeImage(image?: string): boolean {
//   if (!image) return false;
//   return /^node:(\d+|\d+\.\d+|\d+\.\d+\.\d+|[\w.-]+)$/.test(image);
// }

export class TypeScriptDockerEngine implements LanguageEngine {
  async prepare(task: ExecutionTask): Promise<PreparedCommand | StoneboxCompilationError> {
    // --- Stage 1: Compile TypeScript locally (on the host) ---
    const tsconfigPath = path.join(task.tempPath, 'tsconfig.json');
    let outDir = 'compiled_ts_docker'; 

    try {
      await fs.access(tsconfigPath);
      try {
        const tsconfigContent = JSON.parse(await fs.readFile(tsconfigPath, 'utf8'));
        if (tsconfigContent?.compilerOptions?.outDir) {
          outDir = tsconfigContent.compilerOptions.outDir;
        }
      } catch (e) {
        console.warn(`Stonebox TypeScriptDockerEngine: Could not parse existing tsconfig.json at ${tsconfigPath}, using default outDir '${outDir}'. Error: ${e}`);
      }
    } catch {
      await fs.writeFile(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: { target: 'es2020', module: 'commonjs', outDir, rootDir: '.' },
          include: ['**/*.ts'],
        }, null, 2),
        'utf8',
      );
    }
    
    const absoluteOutDir = path.join(task.tempPath, outDir);
    await fs.mkdir(absoluteOutDir, { recursive: true });

    let tscBin = task.options.languageOptions?.tscPath as string | undefined;
    if (!tscBin) {
      try {
        const tsPackagePath = require.resolve('typescript/package.json', { paths: [process.cwd(), __dirname] });
        tscBin = path.join(path.dirname(tsPackagePath), require(tsPackagePath).bin.tsc);
      } catch (e) { 
        console.warn(`Stonebox TypeScriptDockerEngine: Could not resolve 'typescript' package. Falling back to 'tsc' in PATH. Error: ${e}`);
        tscBin = 'tsc';
      }
    }

    let tscSpawnCmd = tscBin;
    let tscSpawnArgs: string[];

    if (tscBin.endsWith('npx')) {
        tscSpawnCmd = 'npx';
        tscSpawnArgs = ['tsc', '-p', tsconfigPath];
    } else { // For 'tsc' or absolute path to tsc
        tscSpawnArgs = ['-p', tsconfigPath];
    }

    console.log(`[TypeScriptDockerEngine] Compiling TS. Command: '${tscSpawnCmd}', Args: '${JSON.stringify(tscSpawnArgs)}', CWD: '${task.tempPath}'`);
    const compileResult = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
      (resolve) => {
        const child = spawn(tscSpawnCmd, tscSpawnArgs, { cwd: task.tempPath, env: buildSandboxEnv(task.options.env) });
        let stdout = ''; 
        let stderr = '';
        child.stdout?.on('data', (d) => (stdout += d.toString()));
        child.stderr?.on('data', (d) => (stderr += d.toString()));
        child.on('close', (code) => {
            console.log(`[TypeScriptDockerEngine] tsc process exited with code: ${code}. Stdout: ${stdout.substring(0,100)}..., Stderr: ${stderr.substring(0,100)}...`);
            resolve({ code, stdout, stderr });
        });
        child.on('error', (err) => {
            console.error(`[TypeScriptDockerEngine] Failed to spawn tsc: ${err.message}`);
            resolve({ code: 1, stdout, stderr: `Failed to spawn tsc: ${err.message}` });
        });
      }
    );

    if (compileResult.code !== 0) {
      return new StoneboxCompilationError('TypeScript compilation failed (host stage for Docker).', {
        stdout: compileResult.stdout,
        stderr: compileResult.stderr,
      });
    }

    const jsEntrypointFileName = task.entrypoint.replace(/\.ts$/, '.js');
    const jsEntrypointOnHost = path.join(absoluteOutDir, jsEntrypointFileName);
    
    try {
        await fs.chmod(jsEntrypointOnHost, 0o755);
        console.log(`[TypeScriptDockerEngine] Set execute permission on compiled JS: ${jsEntrypointOnHost}`);
    } catch (chmodError: any) {
        console.warn(`[TypeScriptDockerEngine] Failed to set execute permission on ${jsEntrypointOnHost}: ${chmodError.message}.`);
    }

    const jsEntrypointInContainer = path.join(outDir, jsEntrypointFileName).replace(/\\/g, '/'); 
    
    const scriptArgs: string[] = [jsEntrypointInContainer];
    if (task.options.args) {
      scriptArgs.push(...task.options.args);
    }

    // MODIFICATION: Always explicitly use 'node' as the command for the Docker container.
    // The Docker image (e.g., node:18-bullseye) should have 'node' in its PATH.
    // Its ENTRYPOINT might be a shell script that eventually calls 'exec "$@"',
    // so if we provide 'node script.js' as Cmd, it will execute correctly.
    return {
      command: 'node', // Explicitly use 'node'
      args: scriptArgs,  // args will be [ "compiled_ts_docker/main.js", ...userArgs ]
      env: task.options.env || {},
      cwd: "/stonebox_workspace", 
    };
  }
}