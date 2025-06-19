import { dynamicCodeGenerator } from "./code-generator-dynamic-impl.js";
import { staticCodeGenerator } from "./code-generator-static-impl.js";
import type { SourceBuilder } from "./types/builder.js";
import type { CodeGenerator } from "./types/code-generator.js";

export function resolveCodeGenerator(generator: string): CodeGenerator & SourceBuilder {
  switch (generator) {
    case "static-cpp":
      return staticCodeGenerator;
    case "dynamic":
      return dynamicCodeGenerator;
    default:
      throw new Error(`Unknown code generator: ${generator}`);
  }
}
