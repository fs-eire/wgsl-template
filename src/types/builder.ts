import type { TemplateRepository } from "./loader.js";
import type { TemplateGenerateResult, TemplateFinalResult } from "./template.js";

export interface SourceBuilderOptions {
  /**
   * The extension of template files.
   */
  templateExt: string;

  /**
   * The namespaces to use for the source builder.
   */
  namespaces?: string[];
}

export interface SourceBuilder {
  // Build the final content of the template repository
  build(
    repo: TemplateRepository<TemplateGenerateResult>,
    options: SourceBuilderOptions
  ): TemplateRepository<TemplateFinalResult>;
}
