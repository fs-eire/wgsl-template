export interface CodePattern {
  readonly type: "control" | "param" | "macro" | "function" | "method" | "property";
  readonly pattern: string | RegExp;

  // if present, this pattern will be replaced with the given value
  // if the `replace` is a string, it will be used to replace the whole matched pattern
  // if the `replace` is an array, it will replace each matching group in the pattern if not null
  readonly replace?: string | (string | null)[];
}
