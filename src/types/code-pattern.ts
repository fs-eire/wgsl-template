export interface CodePattern {
  readonly type: "control" | "param" | "macro" | "function" | "method" | "property";
  readonly pattern: string | RegExp;
}
