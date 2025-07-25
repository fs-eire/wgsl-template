import { createHash } from "node:crypto";
import { WgslTemplateBuildError } from "./errors.js";
import type {
  SourceBuilder,
  CodeGenerator,
  CodeSegment,
  SourceBuilderOptions,
  TemplateRepository,
  TemplatePass2,
  TemplateBuildResult,
  CodeSegmentArg,
} from "./types.js";

export class StaticCodeGenerator implements CodeGenerator, SourceBuilder {
  #stringTable: Map<string, number> | null = null;

  constructor(useStringTable = true) {
    if (useStringTable) {
      this.#stringTable = new Map<string, number>();
    }
  }

  #renderString(str: string): string {
    if (this.#stringTable) {
      let id = this.#stringTable.get(str);
      if (id === undefined) {
        id = this.#stringTable.size;
        this.#stringTable.set(str, id);
      }
      return `__str_${id}`;
    } else {
      return JSON.stringify(str);
    }
  }

  #renderArg(arg: CodeSegmentArg): string {
    const render = (segment: CodeSegment): string => {
      switch (segment.type) {
        case "code":
          return this.#renderString(segment.content);
        default: // expression
          return segment.content;
      }
    };

    if (arg.code.length === 0) {
      return "";
    } else if (arg.code.length === 1) {
      if (arg.type === "string" && arg.code[0].type === "expression") {
        return `wgsl_detail::pass_as_string(${arg.code[0].content})`;
      } else if (arg.type !== "expression" && arg.code[0].type === "code") {
        return this.#renderString(arg.code[0].content);
      } else {
        return arg.code[0].content;
      }
    } else {
      if (arg.type !== "expression") {
        return `absl::StrCat(${arg.code.map(render).join(", ")})`;
      } else {
        return arg.code.map((segment) => segment.content).join("");
      }
    }
  }

  emit(code: CodeSegment[]): string {
    return code
      .map((segment) => {
        switch (segment.type) {
          case "raw":
            return segment.content;
          case "code":
            return `ss << ${this.#renderString(segment.content)};\n`;
          case "expression":
            return `ss << ${segment.content};\n`;
        }
      })
      .join("");
  }

  param(name: string): string {
    return `__param_${name}`;
  }

  variable(name: string): string {
    return `__var_${name}`;
  }

  property(obj: string, propertyName: string): string {
    return `__var_${obj}.${propertyName}`;
  }

  function(name: string, args: CodeSegmentArg[]): string {
    const code = [name, "("];

    for (let i = 0; i < args.length; i++) {
      code.push(this.#renderArg(args[i]));
      if (i < args.length - 1) {
        code.push(", ");
      }
    }
    code.push(")");
    return code.join("");
  }

  method(obj: string, methodName: string, args: CodeSegmentArg[]): string {
    const code = [`__var_${obj}.${methodName}`, "("];

    for (let i = 0; i < args.length; i++) {
      code.push(this.#renderArg(args[i]));
      if (i < args.length - 1) {
        code.push(", ");
      }
    }
    code.push(")");
    return code.join("");
  }

  #buildGenerateIndex(repo: TemplateRepository<TemplatePass2>): string {
    const indexContent = [];
    indexContent.push("// This file is auto-generated by wgsl-gen. Do not edit manually.");
    indexContent.push("");
    //indexContent.push("#pragma once");
    indexContent.push("#ifndef INCLUDED_BY_WGSL_GEN_HEADER");
    indexContent.push('#error "This file is expected to be included by wgsl-gen header. Do not include it directly."');
    indexContent.push("#endif");
    indexContent.push("");
    for (const [name, template] of repo.templates) {
      indexContent.push(`//`);
      indexContent.push(`// Template: ${name}`);
      indexContent.push(`//`);
      indexContent.push("");
      indexContent.push(`template <>`);
      indexContent.push(`struct TemplateParameter<${JSON.stringify(name)}> {`);
      indexContent.push("  using type = struct {");

      // define params
      for (const paramName of template.generateResult.params.keys()) {
        indexContent.push(`    int param_${paramName};`);
      }

      // define variables
      for (const variableName of template.generateResult.variables.keys()) {
        indexContent.push(`    const ShaderVariableHelper* var_${variableName};`);
      }

      indexContent.push("  };");
      indexContent.push("};");
      indexContent.push("");
      indexContent.push(`template <>`);
      indexContent.push(
        `Status ApplyTemplate<${JSON.stringify(name)}>(ShaderHelper& shader_helper, TemplateParameter<${JSON.stringify(
          name
        )}>::type params);`
      );
      indexContent.push("");
    }

    return indexContent.join("\n");
  }

  #buildGenerateStringTable(): string {
    if (!this.#stringTable) {
      throw new WgslTemplateBuildError("String table is not enabled", "output-validation-failed");
    }

    const stringTableContent = [];
    stringTableContent.push("// This file is auto-generated by wgsl-gen. Do not edit manually.");
    stringTableContent.push("");
    stringTableContent.push("#pragma once");
    stringTableContent.push("#ifndef INCLUDED_BY_WGSL_GEN_IMPL");
    stringTableContent.push(
      '#error "This file is expected to be included by wgsl-gen impl. Do not include it directly."'
    );
    stringTableContent.push("#endif");
    stringTableContent.push("");
    stringTableContent.push("// String table constants");

    // Sort strings by their ID to ensure consistent output
    const sortedStrings = Array.from(this.#stringTable.entries()).sort((a, b) => a[1] - b[1]);

    for (const [str, id] of sortedStrings) {
      stringTableContent.push(`constexpr const char* __str_${id} = ${JSON.stringify(str)};`);
    }

    stringTableContent.push("");

    return stringTableContent.join("\n");
  }

  #buildGenerateIndexImpl(
    repo: TemplateRepository<TemplatePass2>,
    templateImplementationHash: Map<string, string>,
    includePathPrefix: string,
    templateExt: string
  ): string {
    const implContent = [];
    implContent.push(`// This file is auto-generated by wgsl-gen. Do not edit manually.

#pragma once
#ifndef INCLUDED_BY_WGSL_GEN_IMPL
#error "This file is expected to be included by wgsl-gen impl. Do not include it directly."
#endif

// Helper functions or macros

#pragma push_macro("MainFunctionStart")
#undef MainFunctionStart
#define MainFunctionStart() { [[maybe_unused]] auto& ss = shader_helper.MainFunctionBody();
#pragma push_macro("MainFunctionEnd")
#undef MainFunctionEnd
#define MainFunctionEnd() }

// Helper templates

namespace wgsl_detail {
template <typename T, typename = std::enable_if_t<std::is_integral_v<T>>>
std::string pass_as_string(T&& v) {
  return std::to_string(std::forward<T>(v));
}
template <typename...>
std::string_view pass_as_string(std::string_view sv) {
  return sv;
}
template <typename T>
std::string pass_as_string(T&& v) {
  return std::forward<T>(v);
}
}  // namespace wgsl_detail
`);

    if (this.#stringTable) {
      const hash = templateImplementationHash.get("string_table.h");
      implContent.push(`#include "${includePathPrefix}/string_table.h"  // ${hash}`);
    }
    implContent.push("");
    implContent.push("// Include template implementations");
    implContent.push("");

    for (const name of repo.templates.keys()) {
      if (!name.endsWith(templateExt)) {
        throw new Error(`Template name "${name}" does not end with the expected extension "${templateExt}"`);
      }
      const baseName = name.slice(0, -templateExt.length);
      const hash = templateImplementationHash.get(name);
      implContent.push(`#include "${includePathPrefix}generated/${baseName}.h"  // ${hash}`);
    }

    implContent.push("");
    implContent.push('#pragma pop_macro("MainFunctionStart")');
    implContent.push('#pragma pop_macro("MainFunctionEnd")');

    return implContent.join("\n");
  }

  #buildTemplateImplementation(filePath: string, template: TemplatePass2): string {
    const implContent = [];
    implContent.push("// This file is auto-generated by wgsl-gen. Do not edit manually.");
    implContent.push("");
    implContent.push("#pragma once");
    implContent.push("");
    implContent.push("// Template implementation");
    implContent.push(`// Source: ${filePath}`);
    implContent.push("");

    const paramsIsNotUsed = template.generateResult.params.size === 0 && template.generateResult.variables.size === 0;

    // Generate the template function implementation
    implContent.push(`template <>`);
    implContent.push(
      `Status ApplyTemplate<${JSON.stringify(filePath)}>(ShaderHelper& shader_helper, TemplateParameter<${JSON.stringify(
        filePath
      )}>::type ${paramsIsNotUsed ? "" : "params"}) {`
    );
    implContent.push("  [[maybe_unused]] auto& ss = shader_helper.AdditionalImplementation();");
    implContent.push("");

    // Add parameter assignments for easier access
    if (template.generateResult.params.size > 0) {
      implContent.push("  // Extract parameters");
      for (const [paramName /* , paramType */] of template.generateResult.params) {
        implContent.push(`  auto& ${this.param(paramName)} = params.param_${paramName};`);
      }
      implContent.push("");
    }

    // Add variable assignments for easier access
    if (template.generateResult.variables.size > 0) {
      implContent.push("  // Extract variables");
      for (const [variableName /* , paramType */] of template.generateResult.variables) {
        implContent.push(`  auto& ${this.variable(variableName)} = *params.var_${variableName};`);
      }
      implContent.push("");
    }

    // Generate the actual template code
    implContent.push(template.generateResult.code);

    implContent.push("");
    implContent.push("  return Status::OK();");
    implContent.push("}");

    return implContent.join("\n");
  }

  build(
    repo: TemplateRepository<TemplatePass2>,
    options: SourceBuilderOptions
  ): TemplateRepository<TemplateBuildResult> {
    const result = new Map<string, TemplateBuildResult>();
    const templateImplementationHash = new Map<string, string>();

    // STEP.1. Generate each template implementation
    for (const [name, template] of repo.templates) {
      if (!name.endsWith(options.templateExt)) {
        throw new Error(`Template name "${name}" does not end with the expected extension "${options.templateExt}"`);
      }
      const baseName = name.slice(0, -options.templateExt.length);
      const content = this.#buildTemplateImplementation(name, template);
      result.set(`generated/${baseName}.h`, content);
      templateImplementationHash.set(name, createHash("sha256").update(content).digest("hex"));
    }

    // STEP.2. Generate the string table if needed
    if (this.#stringTable) {
      const content = this.#buildGenerateStringTable();
      result.set("string_table.h", content);
      templateImplementationHash.set("string_table.h", createHash("sha256").update(content).digest("hex"));
    }

    // STEP.3. Generate implementation index_impl.h
    result.set(
      "index_impl.h",
      this.#buildGenerateIndexImpl(
        repo,
        templateImplementationHash,
        options.includePathPrefix ?? "",
        options.templateExt
      )
    );

    // STEP.4. Generate the index.h
    result.set("index.h", this.#buildGenerateIndex(repo));

    return {
      basePath: repo.basePath,
      templates: result,
    };
  }
}
