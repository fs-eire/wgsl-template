import type { CodeGenerator } from "./code-generator";
import type { TemplateRepository } from "./loader";
import type { TemplatePass1 } from "./template";

export interface Generator {
  generate(filePath: string, repo: TemplateRepository<TemplatePass1>, generator: CodeGenerator): string;
}
