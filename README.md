# Stonebox

Stonebox is a TypeScript NPM package for running Python, TypeScript, and JavaScript code in a sandboxed environment using Node.js child processes. It is designed for extensibility and prototyping, with a simple API and support for file management, timeouts, and error handling.

## Features

- Run JavaScript, TypeScript, and Python code in a sandboxed temp directory
- Add multiple files and specify an entrypoint
- Enforce execution timeouts
- Capture stdout, stderr, exit codes, and signals
- Extensible engine architecture for future language support
- **[Unix only]** Python memory and process count limits (see below)

## Installation

```sh
npm install stonebox
```

## Usage Example

```typescript
import { Stonebox, StoneboxTimeoutError, StoneboxCompilationError } from 'stonebox';

// JavaScript example
const js = new Stonebox('javascript');
js.addFile('main.js', 'console.log("Hello from JS")');
const result = await js.execute();
console.log(result.stdout); // "Hello from JS"

// TypeScript example
const ts = new Stonebox('typescript');
ts.addFile('main.ts', 'console.log("Hello from TS")');
const tsResult = await ts.execute();
console.log(tsResult.stdout); // "Hello from TS"

// Python example
const py = new Stonebox('python');
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

## Security Notes

- **File Path Restrictions:** All file paths must be relative and cannot contain `..` or be absolute. Attempts to add files with such paths will throw an error.
- **UID/GID (Unix only):** You can opt-in to run the child process as a specific Unix user/group by setting `languageOptions.executionOverrides = { uid, gid }` in your options. This is advanced and requires the user/group to exist and the current process to have permission to setuid/setgid.
- **Network Access:** By default, Stonebox does **not** restrict network access for executed code. If you need to restrict network access, use OS-level controls or a containerized engine.

## Resource Limits

- **Node.js (JavaScript/TypeScript):** Memory limit is enforced via Node's `--max-old-space-size`.
- **Python (Unix only):** Memory and process count limits are enforced using OS-level resource limits (`RLIMIT_AS` for memory, `RLIMIT_NPROC` for process count) via a helper script. Set these using `memoryLimitMb` and `languageOptions.processLimit`.
- **Windows:** Python memory/process limits are not supported.

## Limitations

- Not a true security sandbox: code can access the system if not otherwise restricted
- Requires Node.js for JS/TS, and Python installed for Python execution
- Memory/process limits for Python are best-effort and Unix-only

## License

MIT
