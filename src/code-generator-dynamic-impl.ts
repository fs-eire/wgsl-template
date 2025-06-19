import type { CodeGenerator, CodeSegment } from "../src/types/code-generator";

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

export const dynamicCodeGenerator: CodeGenerator = {
  emit: function (code: CodeSegment[]): string {
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
  },
  param: function (name: string): string {
    return `param[${JSON.stringify(name)}]`;
  },
  macro: function (_name: string): string {
    throw new Error("Function not implemented.");
  },
  property: function (obj: string, propertyName: string): string {
    return `variable[${JSON.stringify(obj)}].${propertyName}`;
  },
  function: function (name: string, params: CodeSegment[][]): string {
    const code = [name, "("];

    for (let i = 0; i < params.length; i++) {
      code.push(renderParam(params[i]));
      if (i < params.length - 1) {
        code.push(", ");
      }
    }
    code.push(")");
    return code.join("");
  },
  method: function (obj: string, methodName: string, params: CodeSegment[][]): string {
    const code = [`variable[${JSON.stringify(obj)}]`, ".", methodName, "("];

    for (let i = 0; i < params.length; i++) {
      code.push(renderParam(params[i]));
      if (i < params.length - 1) {
        code.push(", ");
      }
    }
    code.push(")");
    return code.join("");
  },
};
