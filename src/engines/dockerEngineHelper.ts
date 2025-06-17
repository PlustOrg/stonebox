import Docker from 'dockerode';
import {
  StoneboxRuntimeError,
  StoneboxTimeoutError,
  StoneboxConfigurationError,
} from '../errors';
import { ExecutionResult, ExecuteOptions, DockerEngineSpecificOptions } from '../interfaces';
import { PreparedCommand } from './types';
import { buildSandboxEnv } from '../utils/envUtils';
import { ExecutionEnvironment } from '../environment';

export class DockerEngineHelper {
  private readonly docker: Docker;
  private readonly dockerRunOpts: DockerEngineSpecificOptions;
  private readonly environment: ExecutionEnvironment;

  constructor(
    dockerRunOpts: DockerEngineSpecificOptions | undefined,
    environment: ExecutionEnvironment,
  ) {
    if (!dockerRunOpts?.image) {
      throw new StoneboxConfigurationError('Docker image must be specified in dockerEngineOptions.');
    }
    this.docker = new Docker(dockerRunOpts.dockerodeOptions);
    this.dockerRunOpts = {
      pullPolicy: 'IfNotPresent',
      ...dockerRunOpts,
    };
    this.environment = environment;
  }

  public async run(
    preparedCmd: PreparedCommand,
    timeoutMs: number,
    executeOptions: ExecuteOptions,
  ): Promise<ExecutionResult> {
    await this.ensureImagePulled();

    const dockerEnv = buildSandboxEnv(executeOptions.env || this.environment.options.env);
    const languageOpts = this.environment.options.languageOptions || {};
    const preserveContainerForDebug = !!languageOpts.__STONEBOX_DIAGNOSTIC_PRESERVE_CONTAINER;
    const mountMode = this.dockerRunOpts.workspaceMountMode || 'rw';
    const bindMount = `${this.environment.tempPath}:/stonebox_workspace:${mountMode}`;

    // DEFINITIVE FIX: All stdin related properties are now `false`.
    const createOptions: Docker.ContainerCreateOptions = {
      Image: this.dockerRunOpts.image,
      Cmd: preparedCmd.command ? [preparedCmd.command, ...preparedCmd.args] : preparedCmd.args,
      WorkingDir: '/stonebox_workspace',
      Env: Object.entries(dockerEnv).map(([key, value]) => `${key}=${value}`),
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: false,
      Tty: false,
      HostConfig: { Binds: [bindMount], AutoRemove: false, NetworkMode: this.dockerRunOpts.networkMode, CpuShares: this.dockerRunOpts.cpuShares, CpuPeriod: this.dockerRunOpts.cpuPeriod, CpuQuota: this.dockerRunOpts.cpuQuota, PidsLimit: this.dockerRunOpts.pidsLimit, CapAdd: this.dockerRunOpts.capAdd, ReadonlyRootfs: this.dockerRunOpts.readonlyRootfs },
    };

    if (this.dockerRunOpts.capDrop) createOptions.HostConfig!.CapDrop = this.dockerRunOpts.capDrop === 'ALL' ? ['ALL'] : this.dockerRunOpts.capDrop;
    if (this.dockerRunOpts.noNewPrivileges === true) createOptions.HostConfig!.SecurityOpt = ['no-new-privileges'];
    const memoryLimit = executeOptions.memoryLimitMb || this.environment.options.memoryLimitMb;
    if (memoryLimit) createOptions.HostConfig!.Memory = memoryLimit * 1024 * 1024;
    const execOverrides = languageOpts.executionOverrides;
    if (execOverrides?.uid !== undefined) createOptions.User = `${execOverrides.uid}${execOverrides.gid !== undefined ? ':' + execOverrides.gid : ''}`;

    let container: Docker.Container | null = null;
    const startTime = Date.now();

    try {
      container = await this.docker.createContainer(createOptions);
      await container.start();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new StoneboxTimeoutError('Timeout')), timeoutMs)
      );
      
      const exitData = await Promise.race([
          container.wait(),
          timeoutPromise
      ]);

      const logBuffer = await container.logs({ stdout: true, stderr: true });
      const { stdout, stderr } = this.parseDockerLogBuffer(logBuffer);
      const durationMs = Date.now() - startTime;

      return {
          stdout,
          stderr: stderr + (exitData.Error ? `\nContainer Exit Error: ${exitData.Error.Message}` : ''),
          exitCode: exitData.StatusCode,
          durationMs,
          signal: null,
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      let stdout = '';
      let stderr = '';
      if (container) {
          try {
            const logs = await container.logs({stdout: true, stderr: true});
            const parsed = this.parseDockerLogBuffer(logs);
            stdout = parsed.stdout;
            stderr = parsed.stderr;
          } catch {/* ignore */}
      }

      if (error instanceof StoneboxTimeoutError) {
        if(container) {
          try { await container.stop({ t: 1 }); } catch {/* ignore */}
        }
        throw new StoneboxTimeoutError(`Docker execution timed out after ${timeoutMs}ms.`, { configuredTimeoutMs: timeoutMs, actualDurationMs: durationMs, stdout, stderr });
      }
      throw error;
    } finally {
      if (container && !preserveContainerForDebug) {
        try { await container.remove({ force: true }); } catch { /* ignore */ }
      }
    }
  }

  private parseDockerLogBuffer(logBuffer: Buffer): { stdout: string, stderr: string } {
    let stdout = '', stderr = '', offset = 0;
    while (offset < logBuffer.length) {
        if (offset + 8 > logBuffer.length) break;
        const streamType = logBuffer[offset];
        const length = logBuffer.readUInt32BE(offset + 4);
        offset += 8;
        if (offset + length > logBuffer.length) break;
        const payload = logBuffer.subarray(offset, offset + length).toString('utf8');
        offset += length;
        if (streamType === 1) stdout += payload;
        else if (streamType === 2) stderr += payload;
    }
    return { stdout, stderr };
  }

  private async ensureImagePulled(): Promise<void> {
    const { image, pullPolicy } = this.dockerRunOpts;
    if (pullPolicy === 'Never') return;
    try {
      const images = await this.docker.listImages({ filters: { reference: [image] } });
      if (images.length > 0 && pullPolicy === 'IfNotPresent') return;
      const pullStream = await this.docker.pull(image);
      await new Promise((resolve, reject) => {
        this.docker.modem.followProgress(pullStream, (err: Error | null) => {
          if (err) reject(err); else resolve(null);
        }, () => {});
      });
    } catch (err: any) {
      throw new StoneboxRuntimeError(`Failed to pull Docker image ${image}: ${err.message || err.reason}`, { originalError: err });
    }
  }
}