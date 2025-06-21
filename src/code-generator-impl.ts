import { DynamicCodeGenerator } from "./code-generator-dynamic-impl.js";
import { StaticCodeGenerator } from "./code-generator-static-impl.js";
import { WgslTemplateGenerateError } from "./errors.js";
import type { SourceBuilder, CodeGenerator } from "./types.js";

export function resolveCodeGenerator(generator: string): CodeGenerator & SourceBuilder {
  switch (generator) {
    case "static-cpp":
      return new StaticCodeGenerator(true);
    case "static-cpp-literal":
      return new StaticCodeGenerator(false);
    case "dynamic":
      return new DynamicCodeGenerator();
    default:
      throw new WgslTemplateGenerateError(`Unknown code generator: ${generator}`, "generator-not-found");
  }
}
