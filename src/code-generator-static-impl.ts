import type {
  SourceBuilder,
  CodeGenerator,
  CodeSegment,
  SourceBuilderOptions,
  TemplateRepository,
  TemplatePass2,
  TemplateBuildResult,
} from "./types.js";

const renderParam = (param: CodeSegment[]): string => {
  const render = (segment: CodeSegment): string => {
    switch (segment.type) {
      case "code":
        return JSON.stringify(segment.content);
      default:
        return segment.content;
    }
  };

  if (param.length === 0) {
    return "";
  } else if (param.length === 1) {
    return render(param[0]);
  } else {
    return `absl::StrCat(${param.map(render).join(", ")})`;
  }
};

export class StaticCodeGenerator implements CodeGenerator, SourceBuilder {
  emit(code: CodeSegment[]): string {
    return code
      .map((segment) => {
        switch (segment.type) {
          case "raw":
            return segment.content;
          case "code":
            return `ss << ${JSON.stringify(segment.content)};\n`;
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

  function(name: string, params: CodeSegment[][]): string {
    const code = [name, "("];

    for (let i = 0; i < params.length; i++) {
      code.push(renderParam(params[i]));
      if (i < params.length - 1) {
        code.push(", ");
      }
    }
    code.push(")");
    return code.join("");
  }

  method(obj: string, methodName: string, params: CodeSegment[][]): string {
    const code = [`__var_${obj}.${methodName}`, "("];

    for (let i = 0; i < params.length; i++) {
      code.push(renderParam(params[i]));
      if (i < params.length - 1) {
        code.push(", ");
      }
    }
    code.push(")");
    return code.join("");
  }

  build(
    repo: TemplateRepository<TemplatePass2>,
    _options: SourceBuilderOptions
  ): TemplateRepository<TemplateBuildResult> {
    return {
      basePath: repo.basePath,
      templates: new Map(),
    };
  }
}
