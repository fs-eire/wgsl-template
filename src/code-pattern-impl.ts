import type { CodePattern } from "./types/code-pattern";

export const DEFAULT_PATTERNS: CodePattern[] = [
  { type: "control", pattern: /\(/ },
  { type: "control", pattern: /\)/ },
  { type: "control", pattern: /,/ },
  { type: "macro", pattern: /\b\$main\b/ },
];

const PATTERN_MAP: Map<string, CodePattern> = new Map([
  [
    "guardAgainstOutOfBoundsWorkgroupSizes",
    {
      type: "function",
      pattern: /\b(guardAgainstOutOfBoundsWorkgroupSizes)\s*\(/d,
      replace: ["shader.GuardAgainstOutOfBoundsWorkgroupSizes"],
    },
  ],
  ["getElementAt", { type: "function", pattern: /\b(getElementAt)\s*\(/d, replace: ["GetElementAt"] }],

  [
    ".offsetToIndices",
    {
      type: "method",
      pattern: /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\.\s*(offsetToIndices)\s*\(/d,
      replace: [null, "OffsetToIndices"],
    },
  ],
  [
    ".setByOffset",
    {
      type: "method",
      pattern: /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\.\s*(setByOffset)\s*\(/d,
      replace: [null, "SetByOffset"],
    },
  ],
  [
    ".rank",
    {
      type: "property",
      pattern: /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\.\s*(rank)\b/d,
      replace: [null, "Rank()"],
    },
  ],

  //TODO: add more patterns as needed
]);

export function lookupPattern(name: string): CodePattern | undefined {
  return PATTERN_MAP.get(name);
}

export function createParamPattern(name: string): CodePattern {
  // Validate that the parameter name is a valid identifier
  // Valid identifiers: start with letter or underscore, followed by letters, digits, or underscores
  const identifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  if (!identifierPattern.test(name)) {
    throw new Error(
      `Invalid parameter identifier: "${name}". Parameter names must start with a letter or underscore and contain only letters, digits, and underscores.`
    );
  }

  return { type: "param", pattern: `\\b${name}\\b` };
}
