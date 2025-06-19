import type { CodeGenerator } from "./code-generator.js";
import type { TemplateRepository } from "./loader.js";
import type { TemplateGenerateResult, TemplatePass1 } from "./template.js";

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
  ): TemplateRepository<TemplateGenerateResult>;
}
