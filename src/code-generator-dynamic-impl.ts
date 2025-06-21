import type {
  CodeGenerator,
  CodeSegment,
  SourceBuilder,
  SourceBuilderOptions,
  TemplateRepository,
  TemplatePass2,
  TemplateBuildResult,
  CodeSegmentArg,
} from "./types.js";

const renderArg = (arg: CodeSegmentArg): string => {
  const render = (segment: CodeSegment): string => {
    switch (segment.type) {
      case "code":
        return segment.content;
      default: // expression
        return `\${${segment.content}}`;
    }
  };

  if (arg.code.length === 0) {
    return "";
  } else if (arg.code.length === 1) {
    if (arg.type === "string" && arg.code[0].type === "expression") {
      return `\`\${${arg.code[0].content}}\``;
    } else if (arg.type !== "expression" && arg.code[0].type === "code") {
      return JSON.stringify(arg.code[0].content);
    } else {
      return arg.code[0].content;
    }
  } else {
    if (arg.type !== "expression") {
      return `\`${arg.code.map(render).join("")}\``;
    } else {
      return arg.code.map((segment) => segment.content).join("");
    }
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
  function(name: string, args: CodeSegmentArg[]): string {
    const code = [name, "("];

    for (let i = 0; i < args.length; i++) {
      code.push(renderArg(args[i]));
      if (i < args.length - 1) {
        code.push(", ");
      }
    }
    code.push(")");
    return code.join("");
  }
  method(obj: string, methodName: string, args: CodeSegmentArg[]): string {
    const code = [`variable[${JSON.stringify(obj)}]`, ".", methodName, "("];

    for (let i = 0; i < args.length; i++) {
      code.push(renderArg(args[i]));
      if (i < args.length - 1) {
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
