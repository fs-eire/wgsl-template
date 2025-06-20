// ============================================================================
// Template Types
// ============================================================================

/**
 * Represents a template file with its raw content before processing.
 */
export interface TemplateBase {
  readonly filePath: string;
}

export type TemplatePass0 = TemplateBase & {
  /**
   * The raw content of the template file, split into lines.
   */
  readonly raw: readonly string[];
};

export type TemplatePass1 = TemplateBase & {
  /**
   * The content after pass 1 processing, including:
   * - comments removal
   * - #include expansion
   * - #define expansion
   */
  readonly pass1: readonly string[];
};

export type TemplatePass2 = TemplateBase & {
  /**
   * The content after pass 2 processing, including:
   * - codegen
   */
  readonly generateResult: GenerateResult;
};

/**
 * Represents the final content after all processing.
 * The file content as a string.
 */
export type TemplateBuildResult = string;

export interface TemplateRepository<T> {
  /**
   * The base path of the template files in the repository.
   */
  readonly basePath: string;

  readonly templates: ReadonlyMap<string, T>;
}

// ============================================================================
// Code Generator Types
// ============================================================================

export interface CodeSegment {
  type:
    | "raw" // represents a raw string that should be emitted as is.
    | "code" // represents a code snippet that should be emitted as code.
    | "expression"; // represents an expression that should be emitted as an expression.
  content: string;
}

export interface CodeGenerator {
  // Emit a string as code
  emit(code: CodeSegment[]): string;

  // Generate an expression for a parameter
  param(name: string): string;

  // Generate an expression for a variable
  variable(name: string): string;

  // Generate an expression for a property
  property(obj: string, propertyName: string): string;

  // Generate an expression for a function call
  function(name: string, params: CodeSegment[][]): string;

  // Generate an expression for a method call on an object
  method(obj: string, methodName: string, params: CodeSegment[][]): string;
}

// ============================================================================
// Code Pattern Types
// ============================================================================

export interface CodePattern {
  readonly type: "control" | "param" | "variable" | "function" | "method" | "property";
  readonly pattern: string | RegExp;

  // if present, this pattern will be replaced with the given value
  // if the `replace` is a string, it will be used to replace the whole matched pattern
  // if the `replace` is an array, it will replace each matching group in the pattern if not null
  readonly replace?: string | (string | null)[];
}

// ============================================================================
// Generator Types
// ============================================================================

export interface GenerateResult {
  code: string;
  params: string[];
  variables: string[];
}

export interface Generator {
  generate(filePath: string, repo: TemplateRepository<TemplatePass1>, generator: CodeGenerator): GenerateResult;

  generateDirectory(
    repo: TemplateRepository<TemplatePass1>,
    generator: CodeGenerator
  ): TemplateRepository<TemplatePass2>;
}

// ============================================================================
// Loader Types
// ============================================================================

export interface LoadFromDirectoryOptions {
  /**
   * The file extension to look for when loading files.
   * Defaults to '.wgsl.template'.
   */
  ext?: string;
}

export interface Loader {
  loadFromDirectory(directory: string, options?: LoadFromDirectoryOptions): Promise<TemplateRepository<TemplatePass0>>;
}

// ============================================================================
// Parser Types
// ============================================================================

export interface Parser {
  parse(repo: TemplateRepository<TemplatePass0>): TemplateRepository<TemplatePass1>;
}

// ============================================================================
// Builder Types
// ============================================================================

export interface SourceBuilderOptions {
  /**
   * The extension of template files.
   */
  templateExt: string;

  /**
   * The namespaces to use for the source builder.
   */
  namespaces?: string[];

  /**
   * The prefix to use for include paths.
   */
  includePathPrefix?: string;
}

export interface SourceBuilder {
  // Build the final content of the template repository
  build(
    repo: TemplateRepository<TemplatePass2>,
    options: SourceBuilderOptions
  ): TemplateRepository<TemplateBuildResult>;
}
