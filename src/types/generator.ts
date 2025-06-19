import type { CodeGenerator } from "./code-generator";
import type { TemplateRepository } from "./loader";
import type { TemplateGenerateResult, TemplatePass1 } from "./template";

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
