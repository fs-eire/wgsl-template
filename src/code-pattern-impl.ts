import type { CodePattern } from "./types.js";

//
// The default patterns for code generation that are automatically included
//
export const DEFAULT_PATTERNS: CodePattern[] = [
  { type: "control", pattern: /\(/ },
  { type: "control", pattern: /\)/ },
  { type: "control", pattern: /,/ },
  { type: "variable", pattern: /(?<![a-zA-Z0-9_])(\$MAIN)\b/d, replace: ["MAIN"] },
];

//
// Built-in patterns for common code transformations
//
const BUILT_IN_PATTERNS: [string, CodePattern][] = [
  [
    "guardAgainstOutOfBoundsWorkgroupSizes",
    {
      type: "function",
      pattern: /\b(guardAgainstOutOfBoundsWorkgroupSizes)\s*\(/d,
      replace: ["shader.GuardAgainstOutOfBoundsWorkgroupSizes"],
    },
  ],
  ["getElementAt", { type: "function", pattern: /\b(getElementAt)\s*\(/d, replace: ["GetElementAt"] }],
];

//
// Indices Helper Patterns
//
export const INDICES_HELPER_PATTERNS: [string, CodePattern][] = [
  [
    ".rank",
    {
      type: "property",
      pattern: /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\.\s*(rank)\b/d,
      replace: [null, "Rank()"],
    },
  ],
  [
    ".numComponents",
    {
      type: "property",
      pattern: /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\.\s*(numComponents)\b/d,
      replace: [null, "NumComponents()"],
    },
  ],
  [
    ".offsetToIndices",
    {
      type: "method",
      pattern: /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\.\s*(offsetToIndices)\s*\(/d,
      replace: [null, "OffsetToIndices"],
    },
  ],
  [
    ".indicesToOffset",
    {
      type: "method",
      pattern: /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\.\s*(indicesToOffset)\s*\(/d,
      replace: [null, "IndicesToOffset"],
    },
  ],
  [
    ".indicesSet",
    {
      type: "method",
      pattern: /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\.\s*(indicesSet)\s*\(/d,
      replace: [null, "IndicesSet"],
    },
  ],
  [
    ".indicesGet",
    {
      type: "method",
      pattern: /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\.\s*(indicesGet)\s*\(/d,
      replace: [null, "IndicesGet"],
    },
  ],
  [
    ".set",
    {
      type: "method",
      pattern: /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\.\s*(set)\s*\(/d,
      replace: [null, "Set"],
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
    ".setByIndices",
    {
      type: "method",
      pattern: /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\.\s*(setByIndices)\s*\(/d,
      replace: [null, "SetByIndices"],
    },
  ],
  [
    ".get",
    {
      type: "method",
      pattern: /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\.\s*(get)\s*\(/d,
      replace: [null, "Get"],
    },
  ],
  [
    ".getByOffset",
    {
      type: "method",
      pattern: /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\.\s*(getByOffset)\s*\(/d,
      replace: [null, "GetByOffset"],
    },
  ],
  [
    ".getByIndices",
    {
      type: "method",
      pattern: /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\.\s*(getByIndices)\s*\(/d,
      replace: [null, "GetByIndices"],
    },
  ],
];

const PATTERN_MAP = new Map<string, CodePattern>([
  ...BUILT_IN_PATTERNS,
  ...INDICES_HELPER_PATTERNS,
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
