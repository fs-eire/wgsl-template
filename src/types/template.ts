import type { GenerateResult } from "./generator";

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

export type TemplateGenerateResult = TemplateBase & {
  /**
   * The content after pass 2 processing, including:
   * - codegen
   */
  readonly generateResult: GenerateResult;
};

export type TemplateFinalResult = TemplateBase & {
  /**
   * The final content after all processing. The file content as a string.
   * This is the content that will be written to the file.
   */
  readonly fileContent: string;
};
