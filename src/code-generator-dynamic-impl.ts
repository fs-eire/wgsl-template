import type { CodeGenerator } from "./types/code-generator";

export const dynamicCodeGenerator: CodeGenerator = {
  emitParam: function (_name: string): string {
    throw new Error("Function not implemented.");
  },
  emitMacro: function (_name: string): string {
    throw new Error("Function not implemented.");
  },
  emitProperty: function (_name: string): string {
    throw new Error("Function not implemented.");
  },
  emitFunction: function (_name: string, _params: string[]): string {
    throw new Error("Function not implemented.");
  },
  emitPreprocessorExpressionParam: function (_name: string): string {
    throw new Error("Function not implemented.");
  },
  emitPreprocessorExpressionMacro: function (_name: string): string {
    throw new Error("Function not implemented.");
  },
  emitPreprocessorExpressionProperty: function (_name: string): string {
    throw new Error("Function not implemented.");
  },
};
