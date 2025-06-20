import type {
  SourceBuilder,
  CodeGenerator,
  CodeSegment,
  SourceBuilderOptions,
  TemplateRepository,
  TemplatePass2,
  TemplateBuildResult,
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

  #renderParam(param: CodeSegment[]): string {
    const render = (segment: CodeSegment): string => {
      switch (segment.type) {
        case "code":
          return this.#renderString(segment.content);
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

  function(name: string, params: CodeSegment[][]): string {
    const code = [name, "("];

    for (let i = 0; i < params.length; i++) {
      code.push(this.#renderParam(params[i]));
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
      code.push(this.#renderParam(params[i]));
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
