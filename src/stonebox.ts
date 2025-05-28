import {
  StoneboxOptions,
  StoneboxExecuteOptions,
  StoneboxExecutionResult,
} from './interfaces';
import {
  StoneboxError,
  StoneboxConfigurationError,
  StoneboxTimeoutError,
  StoneboxCompilationError,
  StoneboxMemoryLimitError,
  StoneboxRuntimeError,
} from './errors';

export class Stonebox {
  private language: string;
  private options: StoneboxOptions;
  private files: Map<string, string> = new Map();

  constructor(language: string, options: StoneboxOptions = {}) {
    this.language = language.toLowerCase();
    this.options = options;
    if (!['javascript', 'typescript', 'python'].includes(this.language)) {
      throw new StoneboxConfigurationError(
        `Unsupported language: ${language}`
      );
    }
  }

  public addFile(filePath: string, content: string): void {
    this.files.set(filePath, content);
  }

  public addFiles(files: Array<{ path: string; content: string }>): void {
    for (const file of files) {
      this.addFile(file.path, file.content);
    }
  }

  public resetFiles(): void {
    this.files.clear();
  }

  public async execute(
    executeOptionsInput?: StoneboxExecuteOptions
  ): Promise<StoneboxExecutionResult> {
    throw new StoneboxError('Not implemented.');
  }
}
