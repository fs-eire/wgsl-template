import type { CodePattern } from "./types/code-pattern";

export const DEFAULT_PATTERNS: CodePattern[] = [
  { type: "control", pattern: /\(/ },
  { type: "control", pattern: /\)/ },
  { type: "macro", pattern: /\b\$main\b/ },
];

const PATTERN_MAP: Map<string, CodePattern> = new Map([
  [
    "guardAgainstOutOfBoundsWorkgroupSizes",
    { type: "macro", pattern: /\bguardAgainstOutOfBoundsWorkgroupSizes\b/ },
  ],
  ["getElementAt", { type: "macro", pattern: /\bgetElementAt\b/ }],

  [
    ".offsetToIndices",
    {
      type: "method",
      pattern: /\b[_a-zA-Z][_a-zA-Z0-9]*\s*\.\s*offsetToIndices\s*\(/,
    },
  ],
  [
    ".setByOffset",
    {
      type: "method",
      pattern: /\b[_a-zA-Z][_a-zA-Z0-9]*\s*\.\s*setByOffset\s*\(/,
    },
  ],
  [
    ".rank",
    {
      type: "property",
      pattern: /\b[_a-zA-Z][_a-zA-Z0-9]*\s*\.\s*rank\b/,
    },
  ],

  //TODO: add more patterns as needed
]);

export function lookupPattern(name: string): CodePattern | undefined {
  return PATTERN_MAP.get(name);
}

export function createParamPattern(name: string): CodePattern {
  return { type: "param", pattern: `\\b${name}\\b` };
}
