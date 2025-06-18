import type { TemplateRepository } from "./loader";
import type { TemplatePass1 } from "./template";

export type GeneratorOptionsTarget = "ort-static" | "ort-dynamic";

export interface GeneratorOptionsParam {
  /**
   * The name of the parameter.
   */
  readonly name: string;
}

export interface GeneratorOptions {
  /**
   * The target language for code generation.
   */
  readonly target: GeneratorOptionsTarget;

  readonly params?: GeneratorOptionsParam[];
}

export interface Generator {
  generate(filePath: string, repo: TemplateRepository<TemplatePass1>, options: GeneratorOptions): string;
}
