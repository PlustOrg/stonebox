# Stonebox

Stonebox is a TypeScript NPM package for running Python, TypeScript, and JavaScript code in a sandboxed environment. It supports two execution engines:

- **Process Engine:** Uses Node.js child processes for fast, local sandboxing.
- **Docker Engine:** Runs code inside Docker containers for strong isolation and security.

Stonebox is designed for extensibility and prototyping, with a simple API, file management, timeouts, error handling, and advanced security controls when using Docker.

## Features

- **Run JavaScript, TypeScript, and Python code in a sandboxed temp directory**
- **Optional Docker-based isolation for untrusted code**
- Add multiple files and specify an entrypoint
- Enforce execution timeouts and memory limits
- Capture stdout, stderr, exit codes, and signals
- Extensible engine architecture for future language support
- **[Unix only]** Python memory and process count limits (see below)
- Explicit runtime path configuration for Node.js, Python, and TypeScript
- Opt-in UID/GID process isolation (Unix only)
- **Configurable Docker security options:** network isolation, read-only mounts, resource limits, kernel capabilities, and more

## Installation

```sh
npm install stonebox
```

## Usage Example

```typescript
import { Stonebox } from 'stonebox';

// --- JavaScript in Docker (recommended for untrusted code) ---
const sb = new Stonebox('javascript', {
  engineType: 'docker',
  dockerEngineOptions: {
    image: 'node:18-alpine',
    networkMode: 'none', // disables all network access
    workspaceMountMode: 'ro', // mount code as read-only
    noNewPrivileges: true, // prevent privilege escalation
    readonlyRootfs: true, // make root filesystem read-only
    capDrop: 'ALL', // drop all Linux capabilities
    memoryLimitMb: 128, // also supported at top-level for Docker
  }
});
sb.addFile('main.js', 'console.log("Hello from Docker!")');
const result = await sb.execute();
console.log(result.stdout); // "Hello from Docker!"

// --- TypeScript in Docker ---
const ts = new Stonebox('typescript', {
  engineType: 'docker',
  dockerEngineOptions: { image: 'node:18-alpine' }
});
ts.addFile('main.ts', 'console.log("Hello from TS in Docker")');
const tsResult = await ts.execute();
console.log(tsResult.stdout); // "Hello from TS in Docker"

// --- Python in Docker ---
const py = new Stonebox('python', {
  engineType: 'docker',
  dockerEngineOptions: { image: 'python:3.9-slim', networkMode: 'none' }
});
py.addFile('main.py', 'print("Hello from Python in Docker")');
const pyResult = await py.execute();
console.log(pyResult.stdout); // "Hello from Python in Docker"
```

## Why Docker?

Running code inside Docker containers provides strong OS-level isolation, making it much safer to execute untrusted or user-supplied code. With Stonebox's Docker engine, you can:

- Disable all network access (`networkMode: 'none'`)
- Mount code as read-only (`workspaceMountMode: 'ro'`)
- Drop all Linux kernel capabilities (`capDrop: 'ALL'`)
- Enforce resource limits (memory, CPU, PIDs)
- Prevent privilege escalation (`noNewPrivileges: true`)
- Make the root filesystem read-only (`readonlyRootfs: true`)
- Run as a non-root user (via `languageOptions.executionOverrides`)

All these options are configurable per-execution, giving you fine-grained control over the security posture of your sandbox.

## Supported Languages

- **JavaScript** (Node.js)
- **TypeScript** (compiled on host, runs as JS in Docker)
- **Python**

## API

See TypeScript typings for all options and result types. Key methods:

- `addFile(path, content)` — Add a file to the sandbox
- `addFiles([{ path, content }, ...])` — Add multiple files
- `resetFiles()` — Remove all files
- `execute(options?)` — Run the code and return a result or throw on error

### StoneboxOptions & StoneboxExecuteOptions

| Option          | Type                               | Description |
|-----------------|------------------------------------|-------------|
| timeoutMs       | number                             | Max execution time in ms (default: 5000) |
| memoryLimitMb   | number                             | Max memory in MB (Node.js/TypeScript, Python on Unix, Docker) |
| entrypoint      | string                             | Entrypoint file (default: first file added) |
| args            | string[]                           | Arguments to pass to the script |
| stdin           | string                             | Data to pass to stdin |
| env             | Record<string, string \| undefined> | Environment variables |
| languageOptions | StoneboxLanguageOptions            | Language/runtime-specific options |
| engineType      | 'process' \| 'docker'              | Selects execution engine (default: 'process') |
| dockerEngineOptions | DockerEngineSpecificOptions     | Docker-specific options (see below) |

### DockerEngineSpecificOptions

| Option                | Type/Values                | Description                                                                 | Default (if omitted)         |
|-----------------------|----------------------------|-----------------------------------------------------------------------------|------------------------------|
| `image`               | string                     | Docker image to use (e.g. `python:3.9-slim`, `node:18-alpine`)              | **Required**                 |
| `pullPolicy`          | 'Always' \| 'IfNotPresent' \| 'Never' | When/how to pull the image.                                                 | 'IfNotPresent'               |
| `dockerodeOptions`    | object                     | Options for Dockerode connection.                                           | `{}`                         |
| `networkMode`         | string                     | Docker network mode (`'none'`, `'bridge'`, custom).                         | Docker default ('bridge')    |
| `workspaceMountMode`  | 'rw' \| 'ro'               | Mount code as read-write or read-only.                                      | 'rw'                         |
| `cpuShares`           | number                     | Relative CPU weight (for CPU resource control).                             | unset                        |
| `cpuPeriod`           | number                     | CPU CFS period (µs).                                                        | unset                        |
| `cpuQuota`            | number                     | CPU CFS quota (µs).                                                         | unset                        |
| `pidsLimit`           | number                     | Max number of processes (PIDs) in container.                                | unset                        |
| `capDrop`             | string[] \| 'ALL'          | Drop Linux kernel capabilities.                                             | unset                        |
| `capAdd`              | string[]                   | Add Linux kernel capabilities.                                              | unset                        |
| `noNewPrivileges`     | boolean                    | Prevent privilege escalation.                                               | false                        |
| `readonlyRootfs`      | boolean                    | Make root filesystem read-only.                                             | false                        |

### StoneboxLanguageOptions

| Option             | Type     | Applies to   | Description |
|--------------------|----------|--------------|-------------|
| nodePath           | string   | JS/TS        | Path to Node.js binary |
| tscPath            | string   | TS           | Path to tsc binary |
| pythonPath         | string   | Python       | Path to Python interpreter |
| processLimit       | number   | Python/Unix  | Max number of processes (enforced via RLIMIT_NPROC) |
| executionOverrides | object   | All/Unix/Docker | `{ uid?: number, gid?: number }` to run as specific user/group |

#### Example: UID/GID (Unix or Docker)

```typescript
const box = new Stonebox('javascript', {
  engineType: 'docker',
  dockerEngineOptions: {
    image: 'node:18-alpine'
  },
  languageOptions: {
    executionOverrides: { uid: 1001, gid: 1001 }
  }
});
```

## Security Notes

- **Docker Engine:** For untrusted code, always use `engineType: 'docker'` and configure `dockerEngineOptions` for maximum isolation (see above).
- **Network Isolation:** Set `networkMode: 'none'` to fully disable network access in the container.
- **Read-Only Mounts:** Use `workspaceMountMode: 'ro'` to prevent code from modifying its own files.
- **Drop Capabilities:** Use `capDrop: 'ALL'` for minimal privileges.
- **No New Privileges:** Set `noNewPrivileges: true` to prevent privilege escalation.
- **Read-Only Root:** Set `readonlyRootfs: true` to make the container's root filesystem read-only.
- **Run as Non-Root:** Use `languageOptions.executionOverrides` to specify a non-root UID/GID (the user must exist in the image).
- **File Path Restrictions:** All file paths must be relative and cannot contain `..` or be absolute. Attempts to add files with such paths will throw an error.
- **Not a true security sandbox (process engine):** The process engine does **not** provide strong isolation. Use Docker for untrusted code.

## Resource Limits

- **Node.js (JavaScript/TypeScript):** Memory limit is enforced via Node's `--max-old-space-size` (process engine) or Docker memory limit.
- **Python (Unix only):** Memory and process count limits are enforced using OS-level resource limits (`RLIMIT_AS` for memory, `RLIMIT_NPROC` for process count) via a helper script. Set these using `memoryLimitMb` and `languageOptions.processLimit`.
- **Docker:** Memory, CPU, and PIDs limits are enforced by the Docker daemon if configured in `dockerEngineOptions`.

## Limitations

- Not a true security sandbox unless using Docker with restrictive options
- Requires Node.js for JS/TS, and Python installed for Python execution (host-side for TypeScript compilation)
- Memory/process limits for Python are best-effort and Unix-only
- Docker must be installed and the daemon running for Docker engine support
