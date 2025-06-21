// ============================================================================
// WGSL Template Error Types
// ============================================================================

/**
 * Base class for all WGSL template errors.
 */
export abstract class WgslTemplateError extends Error {
  /**
   * The file path where the error occurred, if applicable.
   */
  readonly filePath?: string;

  /**
   * The line number where the error occurred, if applicable.
   */
  readonly lineNumber?: number;

  /**
   * The column number where the error occurred, if applicable.
   */
  readonly columnNumber?: number;

  constructor(
    message: string,
    options?: {
      filePath?: string;
      lineNumber?: number;
      columnNumber?: number;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.filePath = options?.filePath;
    this.lineNumber = options?.lineNumber;
    this.columnNumber = options?.columnNumber;

    // Preserve the cause chain
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  /**
   * Returns a formatted error message with location information.
   */
  getFormattedMessage(): string {
    let location = "";
    if (this.filePath) {
      location = this.filePath;
      if (this.lineNumber !== undefined) {
        location += `:${this.lineNumber}`;
        if (this.columnNumber !== undefined) {
          location += `:${this.columnNumber}`;
        }
      }
      location = ` at ${location}`;
    }
    return `${this.message}${location}`;
  }
}

/**
 * Error that occurs during template loading (file system operations).
 */
export class WgslTemplateLoadError extends WgslTemplateError {
  /**
   * The type of load operation that failed.
   */
  readonly operation: "read-file" | "scan-directory" | "resolve-path" | "file-not-found" | "permission-denied";

  constructor(
    message: string,
    operation: WgslTemplateLoadError["operation"],
    options?: {
      filePath?: string;
      cause?: Error;
    }
  ) {
    super(message, options);
    this.operation = operation;
  }
}

/**
 * Error that occurs during template parsing (syntax analysis, include resolution, etc.).
 */
export class WgslTemplateParseError extends WgslTemplateError {
  /**
   * The type of parse operation that failed.
   */
  readonly operation:
    | "comment-removal"
    | "include-resolution"
    | "include-not-found"
    | "include-circular"
    | "define-expansion"
    | "syntax-error"
    | "invalid-directive";

  /**
   * The source line that caused the error, if available.
   */
  readonly sourceLine?: string;

  constructor(
    message: string,
    operation: WgslTemplateParseError["operation"],
    options?: {
      filePath?: string;
      lineNumber?: number;
      columnNumber?: number;
      sourceLine?: string;
      cause?: Error;
    }
  ) {
    super(message, options);
    this.operation = operation;
    this.sourceLine = options?.sourceLine;
  }
}

/**
 * Error that occurs during code generation.
 */
export class WgslTemplateGenerateError extends WgslTemplateError {
  /**
   * The type of generation operation that failed.
   */
  readonly operation:
    | "code-pattern-not-found"
    | "parameter-missing"
    | "parameter-type-mismatch"
    | "variable-undefined"
    | "generator-not-found"
    | "code-generation-failed";

  /**
   * The name of the code pattern or parameter that caused the error, if applicable.
   */
  readonly symbolName?: string;

  /**
   * The expected type vs actual type, if this is a type-related error.
   */
  readonly typeInfo?: {
    expected: string;
    actual: string;
  };
  constructor(
    message: string,
    operation: WgslTemplateGenerateError["operation"],
    options?: {
      filePath?: string;
      lineNumber?: number;
      columnNumber?: number;
      symbolName?: string;
      typeInfo?: { expected: string; actual: string };
      cause?: Error;
    }
  ) {
    super(message, options);
    this.operation = operation;
    this.symbolName = options?.symbolName;
    this.typeInfo = options?.typeInfo;
  }
}

/**
 * Error that occurs during the final build process (file writing, output generation).
 */
export class WgslTemplateBuildError extends WgslTemplateError {
  /**
   * The type of build operation that failed.
   */
  readonly operation:
    | "create-directory"
    | "write-file"
    | "permission-denied"
    | "disk-full"
    | "path-security-violation"
    | "output-validation-failed";

  /**
   * The target output path that caused the error, if applicable.
   */
  readonly outputPath?: string;

  constructor(
    message: string,
    operation: WgslTemplateBuildError["operation"],
    options?: {
      filePath?: string;
      outputPath?: string;
      cause?: Error;
    }
  ) {
    super(message, options);
    this.operation = operation;
    this.outputPath = options?.outputPath;
  }
}

/**
 * Type guard to check if an error is a WGSL template error.
 */
export function isWgslTemplateError(error: unknown): error is WgslTemplateError {
  return error instanceof WgslTemplateError;
}

/**
 * Type guard functions for specific error types.
 */
export function isWgslTemplateLoadError(error: unknown): error is WgslTemplateLoadError {
  return error instanceof WgslTemplateLoadError;
}

export function isWgslTemplateParseError(error: unknown): error is WgslTemplateParseError {
  return error instanceof WgslTemplateParseError;
}

export function isWgslTemplateGenerateError(error: unknown): error is WgslTemplateGenerateError {
  return error instanceof WgslTemplateGenerateError;
}

export function isWgslTemplateBuildError(error: unknown): error is WgslTemplateBuildError {
  return error instanceof WgslTemplateBuildError;
}

/**
 * Utility function to create an error from an unknown error with context.
 */
export function wrapError<T extends WgslTemplateError>(
  ErrorClass: new (message: string, operation: string, options?: Record<string, unknown>) => T,
  operation: string,
  originalError: unknown,
  context?: {
    filePath?: string;
    lineNumber?: number;
    columnNumber?: number;
    [key: string]: unknown;
  }
): T {
  const message = originalError instanceof Error ? originalError.message : String(originalError);

  return new ErrorClass(message, operation, {
    ...context,
    cause: originalError instanceof Error ? originalError : undefined,
  });
}
