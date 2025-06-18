import type { TemplateRepository } from "./loader";
import type { TemplatePass0, TemplatePass1 } from "./template";

export interface Parser {
  parse(repo: TemplateRepository<TemplatePass0>): TemplateRepository<TemplatePass1>;
}
