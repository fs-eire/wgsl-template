import type { CodeGenerator, CodeSegment } from "../src/types/code-generator";

export const testCodeGenerator: CodeGenerator = {
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
  property: function (_obj: string, _propertyName: string): string {
    throw new Error("Function not implemented.");
  },
  function: function (_name: string, _params: CodeSegment[][]): string {
    throw new Error("Function not implemented.");
  },
  method: function (_obj: string, _methodName: string, _params: CodeSegment[][]): string {
    throw new Error("Function not implemented.");
  },
};
