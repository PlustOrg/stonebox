import Docker from 'dockerode';
import stream, { Readable } from 'stream';
import {
    StoneboxError,
    StoneboxRuntimeError,
    StoneboxTimeoutError,
    StoneboxConfigurationError,
} from '../errors';
import {
    DockerEngineSpecificOptions,
    StoneboxExecutionResult,
    StoneboxLanguageOptions
} from '../interfaces';
import { ExecutionTask, PreparedCommand } from './types';
import { buildSandboxEnv } from '../utils/envUtils';

const LOG_PREFIX = '[Stonebox DockerEngineHelper]';

export class DockerEngineHelper {
    private docker: Docker;
    private dockerRunOpts: DockerEngineSpecificOptions;
    private task: ExecutionTask;

    constructor(dockerRunOpts: DockerEngineSpecificOptions, task: ExecutionTask) {
        if (!dockerRunOpts.image) {
            throw new StoneboxConfigurationError('Docker image must be specified in dockerEngineOptions.');
        }
        this.docker = new Docker(dockerRunOpts.dockerodeOptions);
        this.dockerRunOpts = {
            pullPolicy: 'IfNotPresent',
            ...dockerRunOpts,
        };
        this.task = task;
    }

    private async ensureImagePulled(): Promise<void> {
        const { image, pullPolicy } = this.dockerRunOpts;
        if (pullPolicy === 'Never') return;

        try {
            const images = await this.docker.listImages({ filters: { reference: [image] } });
            if (images.length > 0 && pullPolicy === 'IfNotPresent') {
                return;
            }
            // console.log(`${LOG_PREFIX} Pulling image ${image}...`); // Reduced logging
            const pullStream = await this.docker.pull(image);
            await new Promise((resolve, reject) => {
                this.docker.modem.followProgress(pullStream, (err: Error | null, output: any) => {
                    if (err) reject(err);
                    else resolve(output);
                }, (_event: any) => { /* Optional: log progress events */ });
            });
            // console.log(`${LOG_PREFIX} Image ${image} pulled successfully.`); // Reduced logging
        } catch (err: any) {
            // Keep this error log as it's important
            console.error(`${LOG_PREFIX} Failed to pull Docker image ${image}: ${err.message || err.reason}`);
            throw new StoneboxRuntimeError(`Failed to pull Docker image ${image}: ${err.message || err.reason}`, { originalError: err });
        }
    }

    private async getRawContainerLogs(container: Docker.Container | null): Promise<Buffer | string> {
        if (!container) return "Error: Container object was null, cannot fetch logs.";
        try {
            // console.error(`${LOG_PREFIX} Attempting to fetch raw logs for container ${container.id.substring(0,12)}.`); // Reduced
            const logsResult: Buffer | NodeJS.ReadableStream = await container.logs({
                follow: false,
                stdout: true,
                stderr: true,
                timestamps: false, 
            });

            if (Buffer.isBuffer(logsResult)) {
                // console.error(`${LOG_PREFIX} Successfully fetched logs (as Buffer) for ${container.id.substring(0,12)}.`); // Reduced
                return logsResult;
            } else if (logsResult && typeof (logsResult as Readable).on === 'function') {
                const logStream = logsResult as Readable; 
                return new Promise<Buffer>((resolve, reject) => {
                    const chunks: Buffer[] = [];
                    logStream.on('data', (chunk: Buffer) => chunks.push(chunk));
                    logStream.on('end', () => {
                        const completeBuffer = Buffer.concat(chunks);
                        // console.error(`${LOG_PREFIX} Successfully fetched logs (as Stream then Buffer) for ${container.id.substring(0,12)}.`); // Reduced
                        resolve(completeBuffer);
                    });
                    logStream.on('error', (err: Error) => {
                        console.error(`${LOG_PREFIX} Error on logStream for ${container.id.substring(0,12)}: ${err.message}`);
                        reject(err);
                    });
                });
            } else {
                const errMsg = "Error: container.logs() returned an unexpected type.";
                console.error(`${LOG_PREFIX} ${errMsg} Type: ${typeof logsResult}. Value:`, logsResult);
                return errMsg;
            }
        } catch (logErr: any) {
            if (logErr.statusCode === 409 || (logErr.message && logErr.message.includes("can not get logs from container which is dead or marked for removal"))) {
                console.warn(`${LOG_PREFIX} Failed to fetch logs for ${container.id.substring(0,12)} (HTTP 409 - likely removed or dead): ${logErr.message}`);
                return `Warn: Container logs inaccessible (HTTP 409): ${logErr.message}`;
            }
            console.error(`${LOG_PREFIX} Exception while trying to fetch raw logs for ${container.id.substring(0,12)}: ${logErr.message}`);
            return `Error during container.logs() call: ${logErr.message}`;
        }
    }

    private parseDockerLogBuffer(logBuffer: Buffer): { stdout: string, stderr: string } {
        let stdout = '';
        let stderr = '';
        let offset = 0;
        while (offset < logBuffer.length) {
            if (offset + 8 > logBuffer.length) break; 
            const streamType = logBuffer[offset]; 
            const length = logBuffer.readUInt32BE(offset + 4);
            offset += 8;
            if (offset + length > logBuffer.length) break; 
            
            const payload = logBuffer.subarray(offset, offset + length).toString('utf8');
            offset += length;

            if (streamType === 1) {
                stdout += payload;
            } else if (streamType === 2) {
                stderr += payload;
            }
        }
        return { stdout, stderr };
    }


    public async runInContainer(
        preparedCmd: PreparedCommand,
        timeoutMs: number
    ): Promise<StoneboxExecutionResult> {
        await this.ensureImagePulled();

        const hostTempPath = this.task.tempPath;
        // console.error(`${LOG_PREFIX} hostTempPath for bind mount: ${hostTempPath}`); // Can be removed for less noise

        const dockerEnv = buildSandboxEnv(preparedCmd.env);
        const languageOpts = this.task.options.languageOptions as StoneboxLanguageOptions & { __STONEBOX_DIAGNOSTIC_PRESERVE_CONTAINER?: boolean };
        const preserveContainerForDebug = !!languageOpts?.__STONEBOX_DIAGNOSTIC_PRESERVE_CONTAINER;

        // --- Security/Isolation Option Defaults ---
        const mountMode = this.dockerRunOpts.workspaceMountMode || 'rw';
        if (this.dockerRunOpts.workspaceMountMode) {
            console.log(`${LOG_PREFIX} workspaceMountMode set to '${mountMode}'.`);
        } else {
            console.log(`${LOG_PREFIX} workspaceMountMode not set, using default 'rw'.`);
        }
        const bindMount = `${hostTempPath}:/stonebox_workspace:${mountMode}`;

        // Network mode
        if (this.dockerRunOpts.networkMode) {
            console.log(`${LOG_PREFIX} networkMode set to '${this.dockerRunOpts.networkMode}'.`);
        } else {
            console.log(`${LOG_PREFIX} networkMode not set, using Docker default.`);
        }

        // CPU/pids/capabilities
        if (this.dockerRunOpts.cpuShares !== undefined) {
            console.log(`${LOG_PREFIX} cpuShares set to ${this.dockerRunOpts.cpuShares}`);
        }
        if (this.dockerRunOpts.cpuPeriod !== undefined) {
            console.log(`${LOG_PREFIX} cpuPeriod set to ${this.dockerRunOpts.cpuPeriod}`);
        }
        if (this.dockerRunOpts.cpuQuota !== undefined) {
            console.log(`${LOG_PREFIX} cpuQuota set to ${this.dockerRunOpts.cpuQuota}`);
        }
        if (this.dockerRunOpts.pidsLimit !== undefined) {
            console.log(`${LOG_PREFIX} pidsLimit set to ${this.dockerRunOpts.pidsLimit}`);
        }
        if (this.dockerRunOpts.capDrop !== undefined) {
            console.log(`${LOG_PREFIX} capDrop set to ${JSON.stringify(this.dockerRunOpts.capDrop)}`);
        }
        if (this.dockerRunOpts.capAdd !== undefined) {
            console.log(`${LOG_PREFIX} capAdd set to ${JSON.stringify(this.dockerRunOpts.capAdd)}`);
        }
        if (this.dockerRunOpts.noNewPrivileges !== undefined) {
            console.log(`${LOG_PREFIX} noNewPrivileges set to ${this.dockerRunOpts.noNewPrivileges}`);
        }
        if (this.dockerRunOpts.readonlyRootfs !== undefined) {
            console.log(`${LOG_PREFIX} readonlyRootfs set to ${this.dockerRunOpts.readonlyRootfs}`);
        }

        const createOptions: Docker.ContainerCreateOptions = {
            Image: this.dockerRunOpts.image,
            Cmd: preparedCmd.command ? [preparedCmd.command, ...preparedCmd.args] : preparedCmd.args,
            WorkingDir: "/stonebox_workspace",
            Env: Object.entries(dockerEnv).map(([key, value]) => `${key}=${value}`),
            AttachStdin: !!this.task.options.stdin,
            AttachStdout: true, 
            AttachStderr: true, 
            OpenStdin: !!this.task.options.stdin,
            Tty: false, 
            HostConfig: {
                Binds: [bindMount],
                AutoRemove: false, 
            },
        };

        // --- Apply Security/Isolation Options ---
        // Network
        if (this.dockerRunOpts.networkMode) {
            createOptions.HostConfig!.NetworkMode = this.dockerRunOpts.networkMode;
        }
        // CPU
        if (this.dockerRunOpts.cpuShares !== undefined) {
            createOptions.HostConfig!.CpuShares = this.dockerRunOpts.cpuShares;
        }
        if (this.dockerRunOpts.cpuPeriod !== undefined) {
            createOptions.HostConfig!.CpuPeriod = this.dockerRunOpts.cpuPeriod;
        }
        if (this.dockerRunOpts.cpuQuota !== undefined) {
            createOptions.HostConfig!.CpuQuota = this.dockerRunOpts.cpuQuota;
        }
        // PIDs
        if (this.dockerRunOpts.pidsLimit !== undefined) {
            createOptions.HostConfig!.PidsLimit = this.dockerRunOpts.pidsLimit;
        }
        // Capabilities
        if (this.dockerRunOpts.capDrop !== undefined) {
            if (this.dockerRunOpts.capDrop === 'ALL') {
                createOptions.HostConfig!.CapDrop = ['ALL'];
            } else if (Array.isArray(this.dockerRunOpts.capDrop)) {
                createOptions.HostConfig!.CapDrop = this.dockerRunOpts.capDrop;
            }
        }
        if (this.dockerRunOpts.capAdd !== undefined) {
            createOptions.HostConfig!.CapAdd = this.dockerRunOpts.capAdd;
        }
        // no-new-privileges
        if (this.dockerRunOpts.noNewPrivileges === true) {
            if (!createOptions.HostConfig!.SecurityOpt) createOptions.HostConfig!.SecurityOpt = [];
            createOptions.HostConfig!.SecurityOpt.push('no-new-privileges');
        } else if (this.dockerRunOpts.noNewPrivileges === false && createOptions.HostConfig!.SecurityOpt) {
            // Remove if present
            createOptions.HostConfig!.SecurityOpt = createOptions.HostConfig!.SecurityOpt.filter((opt: string) => opt !== 'no-new-privileges');
        }
        // Readonly rootfs
        if (this.dockerRunOpts.readonlyRootfs !== undefined) {
            createOptions.HostConfig!.ReadonlyRootfs = !!this.dockerRunOpts.readonlyRootfs;
        }
        // ...existing code for memory limit, user, entrypoint override, etc...
        if (this.task.options.memoryLimitMb) {
            createOptions.HostConfig!.Memory = this.task.options.memoryLimitMb * 1024 * 1024;
        }
        const execOverrides = this.task.options.languageOptions?.executionOverrides;
        if (execOverrides?.uid !== undefined) {
            createOptions.User = `${execOverrides.uid}${execOverrides.gid !== undefined ? ':' + execOverrides.gid : ''}`;
        }
        if (
            this.dockerRunOpts.image === 'python:3.9-slim' &&
            !preparedCmd.command &&
            Array.isArray(preparedCmd.args) &&
            preparedCmd.args.length > 0 && 
            preparedCmd.args[0].endsWith('.py')
        ) {
             createOptions.Entrypoint = ['python3'];
             createOptions.Cmd = preparedCmd.args;
        }
        
        // console.error(`${LOG_PREFIX} Creating container. Image: ${createOptions.Image}, Cmd: ${JSON.stringify(createOptions.Cmd)}...`); // Reduced

        let container: Docker.Container | null = null;
        try {
            container = await this.docker.createContainer(createOptions);
            // console.error(`${LOG_PREFIX} Container ${container.id.substring(0,12)} created.`); // Reduced
        } catch (err: any) { 
            const createCmdString = preparedCmd.command ? `${preparedCmd.command} ${preparedCmd.args.join(' ')}` : (preparedCmd.args.join(' ') || 'Image Default CMD');
            console.error(`${LOG_PREFIX} Failed to create container. Error: ${err.message || err.reason}`); // Keep this important log
            throw new StoneboxRuntimeError(`Failed to create Docker container (Image: ${this.dockerRunOpts.image}, Effective CMD for create: ${createCmdString}): ${err.message || err.reason}`, { originalError: err });
        }

        let stdinStream: stream.Duplex | null = null; 
        let stdoutData = '';
        let stderrData = '';
        let rawLogs: Buffer | string | undefined = undefined; 
        
        const startTime = Date.now();
        let killedByTimeout = false;
        let containerExitError: Error | null = null;
        let timeoutHandle: NodeJS.Timeout | null = null;
        let containerWaitPromise: Promise<any> | null = null;

        try {
            if (this.task.options.stdin) { 
                // console.error(`${LOG_PREFIX} Attaching to container ${container.id.substring(0,12)} for stdin...`); // Reduced
                stdinStream = await container.attach({ stream: true, stdin: true, stdout: false, stderr: false }) as stream.Duplex;
                // console.error(`${LOG_PREFIX} Attached for stdin to container ${container.id.substring(0,12)}.`); // Reduced
            }

            // console.error(`${LOG_PREFIX} Starting container ${container.id.substring(0,12)}...`); // Reduced
            await container.start();
            // console.error(`${LOG_PREFIX} Container ${container.id.substring(0,12)} started.`); // Reduced

            timeoutHandle = setTimeout(async () => {
                killedByTimeout = true;
                console.warn(`${LOG_PREFIX} Timeout of ${timeoutMs}ms reached for container ${container?.id.substring(0,12)}. Attempting to stop...`); // Keep: Important warning
                try {
                    await container?.stop({ t: 2 }); 
                    // console.warn(`${LOG_PREFIX} Container ${container?.id.substring(0,12)} stopped after timeout.`); // Can be reduced
                } catch (e: any) { /* ... timeout stop/kill logic ... */ 
                    if (e.statusCode === 304) { /* console.warn(...) */ }
                    else if (e.statusCode === 404) { /* console.warn(...) */ }
                    else {
                        console.warn(`${LOG_PREFIX} Failed to stop container ${container?.id.substring(0,12)} (Error: ${e.message || e.statusCode}), attempting kill...`); // Keep
                        try { await container?.kill(); /* console.warn(...) */ }
                        catch (killErr: any) { console.error(`${LOG_PREFIX} Failed to kill container ${container?.id.substring(0,12)}: ${killErr.message || killErr.statusCode}`); } // Keep
                    }
                }
            }, timeoutMs);

            if (this.task.options.stdin && stdinStream) {
                // console.error(`${LOG_PREFIX} Writing stdin to ${container.id.substring(0,12)}.`); // Reduced
                stdinStream.write(this.task.options.stdin);
                stdinStream.end(); 
                // console.error(`${LOG_PREFIX} Ended stdin stream for ${container.id.substring(0,12)}.`); // Reduced
            }
            
            // console.error(`${LOG_PREFIX} Waiting for container ${container.id.substring(0,12)} to exit...`); // Reduced
            containerWaitPromise = container.wait();
            const exitData = await containerWaitPromise;
            containerWaitPromise = null; 
            // console.error(`${LOG_PREFIX} Container ${container.id.substring(0,12)} exited. Code: ${exitData.StatusCode}, Error: ${exitData.Error?.Message}`); // Reduced
            
            if (timeoutHandle) clearTimeout(timeoutHandle);
            timeoutHandle = null;
            
            rawLogs = await this.getRawContainerLogs(container);
            if (typeof rawLogs === 'string') { 
                stderrData = rawLogs.startsWith("Error:") || rawLogs.startsWith("Warn:") ? rawLogs : ''; 
                stdoutData = ''; 
            } else { 
                const parsed = this.parseDockerLogBuffer(rawLogs);
                stdoutData = parsed.stdout;
                stderrData = parsed.stderr;
                // console.error(`${LOG_PREFIX} Parsed stdout from logs (first 500 chars): ${stdoutData.substring(0,500)}`); // Can be removed
                // console.error(`${LOG_PREFIX} Parsed stderr from logs (first 500 chars): ${stderrData.substring(0,500)}`); // Can be removed
            }

            const durationMs = Date.now() - startTime;

            if (killedByTimeout) {
                // Fetch logs before throwing timeout error
                if (typeof rawLogs === 'undefined') {
                    rawLogs = await this.getRawContainerLogs(container);
                }
                let timeoutStdout = stdoutData;
                let timeoutStderr = stderrData;
                if (rawLogs) {
                    if (typeof rawLogs === 'string') {
                        if (!timeoutStderr.includes(rawLogs)) {
                            timeoutStderr += `\n--- ERROR_PATH_LOG_FETCH_INFO ---\n${rawLogs}`;
                        }
                    } else {
                        const parsed = this.parseDockerLogBuffer(rawLogs);
                        if (!timeoutStdout && parsed.stdout) timeoutStdout = parsed.stdout;
                        else if (parsed.stdout && !timeoutStdout.includes(parsed.stdout.substring(0,100))) timeoutStdout += `\n--- (RAW STDOUT IN TIMEOUT) ---\n${parsed.stdout}`;
                        if (!timeoutStderr && parsed.stderr) timeoutStderr = parsed.stderr;
                        else if (parsed.stderr && !timeoutStderr.includes(parsed.stderr.substring(0,100))) timeoutStderr += `\n--- (RAW STDERR IN TIMEOUT) ---\n${parsed.stderr}`;
                    }
                }
                throw new StoneboxTimeoutError(`Docker execution timed out after ${timeoutMs}ms. Container exited with code ${exitData.StatusCode}.`, {
                    configuredTimeoutMs: timeoutMs,
                    actualDurationMs: durationMs,
                    stdout: timeoutStdout,
                    stderr: timeoutStderr,
                });
            }

            if (exitData.Error) {
                 containerExitError = new Error(exitData.Error.Message);
            }

            return {
                stdout: stdoutData,
                stderr: stderrData + (containerExitError ? `\nContainer Exit Error: ${containerExitError.message}` : ''),
                exitCode: exitData.StatusCode,
                durationMs,
                signal: null,
            };
        } catch (error: any) {
            console.error(`${LOG_PREFIX} Catch block reached for ${container ? container.id.substring(0,12) : 'UNKNOWN_CONTAINER'}. Error: ${error.message}`); // Keep
            if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }
            if (containerWaitPromise && killedByTimeout) { containerWaitPromise.catch(() => {});}

            const durationMs = Date.now() - startTime; 
            
            let finalStdout = stdoutData;
            let finalStderr = stderrData;
            
            if (container && typeof rawLogs === 'undefined') { 
                rawLogs = await this.getRawContainerLogs(container);
            }

            if (rawLogs) {
                if (typeof rawLogs === 'string') { 
                    if (!finalStderr.includes(rawLogs)) { 
                        finalStderr += `\n--- ERROR_PATH_LOG_FETCH_INFO ---\n${rawLogs}`;
                    }
                } else { 
                    const parsedErrorLogs = this.parseDockerLogBuffer(rawLogs);
                    if (!finalStdout && parsedErrorLogs.stdout) finalStdout = parsedErrorLogs.stdout;
                    else if (parsedErrorLogs.stdout && !finalStdout.includes(parsedErrorLogs.stdout.substring(0,100))) finalStdout += `\n--- (RAW STDOUT IN CATCH) ---\n${parsedErrorLogs.stdout}`;
                    
                    if (!finalStderr && parsedErrorLogs.stderr) finalStderr = parsedErrorLogs.stderr;
                    else if (parsedErrorLogs.stderr && !finalStderr.includes(parsedErrorLogs.stderr.substring(0,100))) finalStderr += `\n--- (RAW STDERR IN CATCH) ---\n${parsedErrorLogs.stderr}`;
                }
            }

            if (killedByTimeout && !(error instanceof StoneboxTimeoutError)) {
                 // console.error(...); // Reduced
                 throw new StoneboxTimeoutError(`Docker execution timed out after ${timeoutMs}ms and was terminated. STDOUT: ${finalStdout} STDERR: ${finalStderr}`, {
                    configuredTimeoutMs: timeoutMs, actualDurationMs: durationMs, 
                 });
            }
            if (error instanceof StoneboxError) {
                // console.error(...); // Reduced
                let messageSuffix = '';
                if (rawLogs) {
                    const rawLogString = typeof rawLogs === 'string' ? rawLogs : `(Log data present, ${rawLogs.length} bytes)`;
                    if (error.message && !error.message.includes("RAW LOGS") && !error.message.includes(rawLogString.substring(0,50))) {
                         messageSuffix = `\n--- RAW LOGS INFO (Re-thrown Error) ---\n${rawLogString.substring(0,200)}...`;
                    }
                }
                if (error.message && messageSuffix) error.message += messageSuffix;
                else if (!error.message && messageSuffix) (error as any).message = messageSuffix;
                throw error;
            }

            const originalErrorForDetails = error;
            let errorMessage: string;
            if (error?.message) errorMessage = error.message;
            else if (error?.reason) errorMessage = error.reason;
            else if (error?.Error?.Message) errorMessage = error.Error.Message;
            else if (error?.json?.message) errorMessage = error.json.message;
            else if (typeof error === 'string') errorMessage = error;
            else errorMessage = "Unknown error structure in Docker execution.";
            
            const commandString = preparedCmd.command ? `${preparedCmd.command} ${preparedCmd.args.join(' ')}`.trim() : (this.dockerRunOpts.image || 'Image Default CMD');
            console.error(`${LOG_PREFIX} Throwing generic StoneboxRuntimeError for ${container ? container.id.substring(0,12) : 'UNKNOWN_CONTAINER'}.`); // Keep
            throw new StoneboxRuntimeError(`Error during Docker container execution (Image: ${this.dockerRunOpts.image}, Command: ${commandString}): ${errorMessage}. STDOUT: [${finalStdout}] STDERR: [${finalStderr}]`, { originalError: originalErrorForDetails });

        } finally {
            // console.error(`${LOG_PREFIX} Finally block for ${container ? container.id.substring(0,12) : 'UNKNOWN_CONTAINER'}.`); // Reduced
            if (stdinStream && !stdinStream.destroyed) {
                // console.error(`${LOG_PREFIX} Destroying stdinStream for ${container ? container.id.substring(0,12) : 'UNKNOWN_CONTAINER'}.`); // Reduced
                stdinStream.destroy();
            }
            if (container && !preserveContainerForDebug) {
                try {
                    // console.error(`${LOG_PREFIX} Attempting to remove container ${container.id.substring(0,12)} in finally block.`); // Reduced
                    await container.remove({ force: true });
                    // console.error(`${LOG_PREFIX} Container ${container.id.substring(0,12)} removed.`); // Reduced
                } catch (removeError: any) {
                    console.warn(`${LOG_PREFIX} Failed to remove container ${container.id.substring(0,12)}: ${removeError.message || removeError.statusCode}`); // Keep
                }
            } else if (container && preserveContainerForDebug) {
                 console.warn(`${LOG_PREFIX} DIAGNOSTIC MODE: Container ${container.id.substring(0,12)} was PRESERVED.`); // Keep
             }
        }
    }
}