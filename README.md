# Stonebox

![NPM Version](https://img.shields.io/npm/v/@plust/stonebox?style=flat-square)
![NPM Downloads](https://img.shields.io/npm/dm/@plust/stonebox?style=flat-square)
![GitHub License](https://img.shields.io/github/license/plustorg/stonebox?style=flat-square)
![Build Status](https://img.shields.io/github/actions/workflow/status/plustorg/stonebox/main.yml?branch=main&style=flat-square)

**Stonebox is a powerful TypeScript library for running sandboxed code locally. It provides a simple, modern API for executing JavaScript, TypeScript, and Python within secure, isolated environments.**

Stonebox is designed for reliability and developer experience. It uses a clean, environment-based factory pattern and supports both lightweight process-based sandboxing and high-security Docker container isolation.

This is the core, open-source engine that will power the Stonebox Cloud platform.

## Key Features

- **Isolated Environments:** Create sandboxes with their own file systems on the fly.
- **Multi-Language Support:** Execute JavaScript, TypeScript, and Python code seamlessly.
- **Secure by Default:** Leverage Docker for strong, OS-level isolation of untrusted code.
- **Flexible Execution:** Run any command within the sandboxed environment.
- **Resource Management:** Control execution time with timeouts and memory limits.
- **Simple, Modern API:** A declarative, `async/await` first API that is a pleasure to use.
- **Extensible:** A clean engine architecture ready for future language and runtime support.

## Installation

```sh
npm install @plust/stonebox
```

## Quick Start: Python in Docker

Here is how simple it is to securely run a Python script inside a locked-down Docker container.

```typescript
import { Stonebox } from '@plust/stonebox';

async function main() {
  const stonebox = new Stonebox();
  let environment;

  try {
    // 1. Create a secure, isolated environment
    environment = await stonebox.createEnvironment({
      language: 'python',
      engineType: 'docker',
      dockerEngineOptions: {
        image: 'python:3.10-slim',
        networkMode: 'none', // Disable network access
        workspaceMountMode: 'ro', // Mount code as read-only
      },
      timeoutMs: 5000,
    });

    // 2. Add files to the environment's virtual filesystem
    await environment.addFile(
      'main.py',
      'import os; print(f"Hello from Python! Current dir: {os.getcwd()}")'
    );

    // 3. Execute a command within the environment
    console.log('Executing script in Docker...');
    const result = await environment.execute('python3', ['main.py']);

    // 4. Use the results
    console.log('--- Execution Result ---');
    console.log('STDOUT:', result.stdout.trim());
    console.log('STDERR:', result.stderr.trim());
    console.log('Exit Code:', result.exitCode);
    console.log('Duration:', `${result.durationMs}ms`);

  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    // 5. Clean up the environment and its temporary files
    if (environment) {
      console.log('Deleting environment...');
      await environment.delete();
    }
  }
}

main();
```

## API Reference

The Stonebox API is designed around two core concepts: a stateless `Stonebox` factory and stateful `ExecutionEnvironment` instances.

### The `Stonebox` Factory

This is your main entry point.

```typescript
import { Stonebox } from '@plust/stonebox';
const stonebox = new Stonebox();
```

- **`createEnvironment(options: EnvironmentOptions): Promise<ExecutionEnvironment>`**
  Creates and returns a new sandboxed environment. This sets up a temporary directory on the host machine.

### The `ExecutionEnvironment`

This object represents a single, active sandbox.

- **`addFile(path: string, content: string): Promise<void>`**
  Adds a file to the environment's filesystem.
- **`addFiles(files: Array<{ path, content }>): Promise<void>`**
  A convenience method to add multiple files at once.
- **`execute(command: string, args?: string[], options?: ExecuteOptions): Promise<ExecutionResult>`**
  Executes a shell command inside the environment. This is the primary method for running code.
- **`delete(): Promise<void>`**
  Destroys the environment, permanently deleting its temporary directory and all contained files.

### Core Interfaces

#### `EnvironmentOptions`

Options for creating a new environment.

| Option                | Type                          | Description                                         |
| --------------------- | ----------------------------- | --------------------------------------------------- |
| `language`            | `'javascript' \| ...`         | **Required.** The primary language for the environment. |
| `engineType`          | `'process' \| 'docker'`       | The execution engine. Defaults to `'process'`.        |
| `dockerEngineOptions` | `DockerEngineSpecificOptions` | Required options when `engineType` is `'docker'`.   |
| `timeoutMs`           | `number`                      | Default execution timeout for all commands.         |
| `memoryLimitMb`       | `number`                      | Default memory limit.                               |
| `env`                 | `Record<string, string>`      | Default environment variables.                      |
| `languageOptions`     | `StoneboxLanguageOptions`     | Language-specific settings (e.g., `pythonPath`).    |

#### `ExecuteOptions`

Options for a single `execute` call, which override any defaults from `EnvironmentOptions`.

| Option          | Type                     | Description                           |
| --------------- | ------------------------ | ------------------------------------- |
| `timeoutMs`     | `number`                 | Override the default timeout.         |
| `memoryLimitMb` | `number`                 | Override the default memory limit.    |
| `env`           | `Record<string, string>` | Override or extend environment variables. |

#### `ExecutionResult`

| Property     | Type     | Description                                |
| ------------ | -------- | ------------------------------------------ |
| `stdout`     | `string` | The captured standard output.              |
| `stderr`     | `string` | The captured standard error.               |
| `exitCode`   | `number` | The exit code of the process.              |
| `durationMs` | `number` | The total execution time in milliseconds.  |
| `signal`     | `string` | The signal that terminated the process, if any. |

## Security with Docker

For executing untrusted code, **always** use `engineType: 'docker'`. The `dockerEngineOptions` give you fine-grained control over the container's security policy. Best practices include:

- **`networkMode: 'none'`**: Completely disables all network access.
- **`workspaceMountMode: 'ro'`**: Prevents the running code from modifying its own source files.
- **`capDrop: 'ALL'`**: Drops all Linux kernel capabilities for a minimal-privilege environment.
- **`noNewPrivileges: true`**: Prevents the process from escalating its privileges.

```typescript
const secureOpts = {
  engineType: 'docker',
  dockerEngineOptions: {
    image: 'node:18-slim',
    networkMode: 'none',
    workspaceMountMode: 'ro',
    capDrop: 'ALL',
    noNewPrivileges: true,
  }
};
```
