import type { CodeGenerator, CodeSegment } from "./types/code-generator";

export const dynamicCodeGenerator: CodeGenerator = {
  emit: function (_code: CodeSegment[]): string {
    throw new Error("Function not implemented.");
  },
  param: function (_name: string): string {
    throw new Error("Function not implemented.");
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
