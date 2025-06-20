import type {
  CodeGenerator,
  CodeSegment,
  SourceBuilder,
  SourceBuilderOptions,
  TemplateRepository,
  TemplatePass2,
  TemplateBuildResult,
} from "./types.js";

const renderParam = (param: CodeSegment[]): string => {
  const render = (segment: CodeSegment): string => {
    switch (segment.type) {
      case "code":
        return segment.content;
      default:
        return `\${${segment.content}}`;
    }
  };

  if (param.length === 0) {
    return "";
  } else if (param.length === 1) {
    switch (param[0].type) {
      case "code":
        return JSON.stringify(param[0].content);
      default:
        return param[0].content;
    }
  } else {
    return `\`${param.map(render).join("")}\``;
  }
};

export class DynamicCodeGenerator implements CodeGenerator, SourceBuilder {
  emit(code: CodeSegment[]): string {
    return code
      .map((segment) => {
        switch (segment.type) {
          case "raw":
            return segment.content;
          case "code":
            // split code segments into lines and emit each line
            let emitStr = "";
            let text = segment.content;
            while (text) {
              const lineBreakIndex = text.indexOf("\n");
              if (lineBreakIndex === -1) {
                // If no line break, emit the whole text
                emitStr += `emit(${JSON.stringify(text)});\n`;
                break;
              }
              const line = text.slice(0, lineBreakIndex + 1);
              text = text.slice(lineBreakIndex + 1);
              emitStr += `emit(${JSON.stringify(line)});\n`;
            }
            return emitStr;
          case "expression":
            return `emit(${segment.content});\n`;
        }
      })
      .join("");
  }
  param(name: string): string {
    return `param[${JSON.stringify(name)}]`;
  }
  variable(_name: string): string {
    return `variable[${JSON.stringify(_name)}]`;
  }
  property(obj: string, propertyName: string): string {
    return `variable[${JSON.stringify(obj)}].${propertyName}`;
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
    const code = [`variable[${JSON.stringify(obj)}]`, ".", methodName, "("];

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
