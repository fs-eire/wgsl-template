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
   */
  readonly pass1: readonly string[];
};

export type TemplateOutput = TemplateBase & {
  /**
   * The content after pass 2 processing, including:
   * - segment extraction
   * - parameter and property definitions
   */
  readonly output: readonly string[];
};
