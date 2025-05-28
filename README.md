# Stonebox

Stonebox is a TypeScript NPM package for running Python, TypeScript, and JavaScript code in a sandboxed environment using Node.js child processes. It is designed for extensibility and prototyping, with a simple API and support for file management, timeouts, and error handling.

## Features

- Run JavaScript, TypeScript, and Python code in a sandboxed temp directory
- Add multiple files and specify an entrypoint
- Enforce execution timeouts
- Capture stdout, stderr, exit codes, and signals
- Extensible engine architecture for future language support

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

## Limitations

- Not a true security sandbox: code can access the system if not otherwise restricted
- Requires Node.js for JS/TS, and Python installed for Python execution
- Memory limits only enforced for Node.js processes

## License

MIT
