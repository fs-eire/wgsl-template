export interface CodeSegment {
  type:
    | "raw" // represents a raw string that should be emitted as is.
    | "code" // represents a code snippet that should be emitted as code.
    | "expression"; // represents an expression that should be emitted as an expression.
  content: string;
}

export interface CodeGenerator {
  // Emit a string as code
  emit(...code: CodeSegment[]): string;

  // Generate an expression for a parameter
  param(name: string): string;

  // Generate an expression for a macro
  macro(name: string): string;

  // Generate an expression for a property
  property(obj: string, propertyName: string): string;

  // Generate an expression for a function call
  function(name: string, params: CodeSegment[][]): string;

  // Generate an expression for a method call on an object
  method(obj: string, methodName: string, params: CodeSegment[][]): string;
}
