import type { TemplateRepository } from "./loader.js";
import type { TemplatePass0, TemplatePass1 } from "./template.js";

export interface Parser {
  parse(repo: TemplateRepository<TemplatePass0>): TemplateRepository<TemplatePass1>;
}
