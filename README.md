# Stonebox

Stonebox is a TypeScript NPM package for running Python, TypeScript, and JavaScript code in a sandboxed environment using Node.js child processes. It is designed for extensibility and prototyping, with a simple API and support for file management, timeouts, and error handling.

## Features

- Run JavaScript, TypeScript, and Python code in a sandboxed temp directory
- Add multiple files and specify an entrypoint
- Enforce execution timeouts
- Capture stdout, stderr, exit codes, and signals
- Extensible engine architecture for future language support
- **[Unix only]** Python memory and process count limits (see below)
- Explicit runtime path configuration for Node.js, Python, and TypeScript
- Opt-in UID/GID process isolation (Unix only)

## Installation

```sh
npm install stonebox
```

## Usage Example

```typescript
import { Stonebox, StoneboxTimeoutError, StoneboxCompilationError } from 'stonebox';

// JavaScript example with custom Node.js path and memory limit
const js = new Stonebox('javascript', {
  timeoutMs: 2000,
  memoryLimitMb: 128,
  languageOptions: { nodePath: '/usr/local/bin/node' }
});
js.addFile('main.js', 'console.log("Hello from JS")');
const result = await js.execute();
console.log(result.stdout); // "Hello from JS"

// TypeScript example with custom tsc and node path
const ts = new Stonebox('typescript', {
  languageOptions: {
    tscPath: require.resolve('typescript/bin/tsc'),
    nodePath: process.execPath
  }
});
ts.addFile('main.ts', 'console.log("Hello from TS")');
const tsResult = await ts.execute();
console.log(tsResult.stdout); // "Hello from TS"

// Python example with process/memory limits (Unix only)
const py = new Stonebox('python', {
  memoryLimitMb: 64, // MB
  languageOptions: {
    pythonPath: '/usr/bin/python3',
    processLimit: 5 // max 5 processes
  }
});
py.addFile('main.py', 'print("Hello from Python")');
const pyResult = await py.execute();
console.log(pyResult.stdout); // "Hello from Python"
```

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
| memoryLimitMb   | number                             | Max memory in MB (Node.js/TypeScript, Python on Unix) |
| entrypoint      | string                             | Entrypoint file (default: first file added) |
| args            | string[]                           | Arguments to pass to the script |
| stdin           | string                             | Data to pass to stdin |
| env             | Record<string, string \| undefined> | Environment variables |
| languageOptions | StoneboxLanguageOptions            | Language/runtime-specific options |

### StoneboxLanguageOptions

| Option             | Type     | Applies to   | Description |
|--------------------|----------|--------------|-------------|
| nodePath           | string   | JS/TS        | Path to Node.js binary |
| tscPath            | string   | TS           | Path to tsc binary |
| pythonPath         | string   | Python       | Path to Python interpreter |
| processLimit       | number   | Python/Unix  | Max number of processes (enforced via RLIMIT_NPROC) |
| executionOverrides | object   | All/Unix     | `{ uid?: number, gid?: number }` to run as specific user/group |


#### Example: UID/GID (Unix only)

```typescript
const box = new Stonebox('javascript', {
  languageOptions: {
    executionOverrides: { uid: 1001, gid: 1001 }
  }
});
```

## Security Notes

- **File Path Restrictions:** All file paths must be relative and cannot contain `..` or be absolute. Attempts to add files with such paths will throw an error.
- **UID/GID (Unix only):** You can opt-in to run the child process as a specific Unix user/group by setting `languageOptions.executionOverrides = { uid, gid }` in your options. This is advanced and requires the user/group to exist and the current process to have permission to setuid/setgid.
- **Network Access:** By default, Stonebox does **not** restrict network access for executed code. If you need to restrict network access, use OS-level controls or a containerized engine.
- **Not a true security sandbox:** Code can access the system if not otherwise restricted. Use with caution for untrusted code.

## Resource Limits

- **Node.js (JavaScript/TypeScript):** Memory limit is enforced via Node's `--max-old-space-size`.
- **Python (Unix only):** Memory and process count limits are enforced using OS-level resource limits (`RLIMIT_AS` for memory, `RLIMIT_NPROC` for process count) via a helper script. Set these using `memoryLimitMb` and `languageOptions.processLimit`.
  - *Note:* Memory/process limits for Python are best-effort and only supported on Unix (Linux, macOS). On macOS, RLIMIT_AS may not be strictly enforced.
- **Windows:** Python memory/process limits are not supported.

## Limitations

- Not a true security sandbox: code can access the system if not otherwise restricted
- Requires Node.js for JS/TS, and Python installed for Python execution
- Memory/process limits for Python are best-effort and Unix-only

## Docker Engine Support

Stonebox can optionally run code inside Docker containers for stronger isolation. To use Docker, set `engineType: 'docker'` and provide `dockerEngineOptions` with an image name:

```typescript
const sb = new Stonebox('javascript', {
  engineType: 'docker',
  dockerEngineOptions: { image: 'node:18-alpine' }
});
sb.addFile('main.js', 'console.log("Hello from Docker!")');
const result = await sb.execute();
console.log(result.stdout); // "Hello from Docker!"
```

- **Supported languages:** `javascript`, `python`, `typescript` (TypeScript is compiled on the host, then JS runs in Docker)
- **dockerEngineOptions:**
  - `image` (required): Docker image to use (e.g., `python:3.9-slim`, `node:18-alpine`)
  - `pullPolicy`: `'Always' | 'IfNotPresent' | 'Never'` (default: `'IfNotPresent'`)
  - `dockerodeOptions`: Optional connection options for Dockerode
- **UID/GID:** Set `languageOptions.executionOverrides.uid`/`gid` to run as a specific user inside the container (maps to Docker's `--user`)
- **TypeScript:** Compiled on the host, then the resulting JS is run in Docker
- **Timeouts, memory limits, stdin, args, env:** All supported in Docker mode

**Prerequisite:** Docker must be installed and the daemon running.

---
