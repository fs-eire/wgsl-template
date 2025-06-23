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

export interface ParsedLine {
  line: string;
  codeReference: {
    filePath: string;
    lineNumber: number;
  };
}

export type TemplatePass1 = TemplatePass0 & {
  /**
   * The content after pass 1 processing, including:
   * - comments removal
   * - #include expansion
   * - #define expansion
   */
  readonly pass1: readonly ParsedLine[];
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

export interface CodeSegmentArg {
  type: CodePatternArgType;
  code: CodeSegment[];
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
  function(name: string, args: CodeSegmentArg[]): string;

  // Generate an expression for a method call on an object
  method(obj: string, methodName: string, args: CodeSegmentArg[]): string;
}

// ============================================================================
// Code Pattern Types
// ============================================================================

/**
 * Defines the type of code pattern.
 */
export type CodePatternType = "control" | "param" | "variable" | "function" | "method" | "property";

export type CodePatternVariableType = "shader-variable";
export type CodePatternParamType = "int";

/**
 * Defines the type of argument for a function or method.
 *
 * "expression" - The argument is an expression. Willbe emitted as is.
 * "string" - The argument is a string. Will be emitted as a string literal.
 */
export type CodePatternArgType = "expression" | "string" | "auto";

export interface CodePattern {
  readonly type: CodePatternType;
  readonly pattern: string | RegExp;

  // if present, this pattern will be replaced with the given value
  // if the `replace` is a string, it will be used to replace the whole matched pattern
  // if the `replace` is an array, it will replace each matching group in the pattern if not null
  readonly replace?: string | (string | null)[];

  // if present, will be used to determine the type of the pattern
  // should only be available for "variable", "method", and "property" types
  readonly variableType?: CodePatternVariableType;

  // if present, will be used to determine the type of the parameter
  // should only be available for "param" type
  readonly paramType?: CodePatternParamType;

  // if present, will be used to determine the type of the argument
  // should only be available for "function" and "method" types
  readonly argTypes?: CodePatternArgType[];
}

// ============================================================================
// Generator Types
// ============================================================================

export interface GenerateOptions {
  preserveCodeReference?: boolean;
}

export interface GenerateResult {
  code: string;
  params: Map<string, NonNullable<CodePattern["paramType"]>>; // name -> type
  variables: Map<string, NonNullable<CodePattern["variableType"]>>; // name -> type
  hasMainFunction: boolean;
}

export interface Generator {
  generate(
    filePath: string,
    repo: TemplateRepository<TemplatePass1>,
    generator: CodeGenerator,
    options?: GenerateOptions
  ): GenerateResult;

  generateDirectory(
    repo: TemplateRepository<TemplatePass1>,
    generator: CodeGenerator,
    options?: GenerateOptions
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
