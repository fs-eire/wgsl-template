export interface CodeGenerator {
  emitParam(name: string): string;
  emitMacro(name: string): string;
  emitProperty(name: string): string;
  emitFunction(name: string, params: string[]): string;
  emitPreprocessorExpressionParam(name: string): string;
  emitPreprocessorExpressionMacro(name: string): string;
  emitPreprocessorExpressionProperty(name: string): string;
}
