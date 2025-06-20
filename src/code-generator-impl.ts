import { DynamicCodeGenerator } from "./code-generator-dynamic-impl.js";
import { StaticCodeGenerator } from "./code-generator-static-impl.js";
import type { SourceBuilder, CodeGenerator } from "./types.js";

export function resolveCodeGenerator(generator: string): CodeGenerator & SourceBuilder {
  switch (generator) {
    case "static-cpp":
      return new StaticCodeGenerator();
    case "dynamic":
      return new DynamicCodeGenerator();
    default:
      throw new Error(`Unknown code generator: ${generator}`);
  }
}
