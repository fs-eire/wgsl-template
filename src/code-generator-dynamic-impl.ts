import type { CodeGenerator } from "./types/code-generator";

export const dynamicCodeGenerator: CodeGenerator = {
  emitParam: function (name: string): string {
    throw new Error("Function not implemented.");
  },
  emitMacro: function (name: string): string {
    throw new Error("Function not implemented.");
  },
  emitProperty: function (name: string): string {
    throw new Error("Function not implemented.");
  },
  emitFunction: function (name: string, params: string[]): string {
    throw new Error("Function not implemented.");
  },
  emitPreprocessorExpressionParam: function (name: string): string {
    throw new Error("Function not implemented.");
  },
  emitPreprocessorExpressionMacro: function (name: string): string {
    throw new Error("Function not implemented.");
  },
  emitPreprocessorExpressionProperty: function (name: string): string {
    throw new Error("Function not implemented.");
  },
};
