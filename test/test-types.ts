import type { GeneratorOptions } from "../src/types/generator";

// Test framework types
export interface TestCase {
  name: string;
  directory: string;
  templateFiles: string[];
  expectedOutput?: string;
  config: TestConfig;
}

export interface TestConfig {
  type: "loader" | "parser" | "e2e";
  description?: string; // Optional description of what the test does
  disabled?: boolean | string; // Optional: true/false or reason why disabled
  mainTemplate?: string; // for parser and e2e tests
  generatorOptions?: GeneratorOptions; // for e2e tests
  expectedOutputFile?: string; // for e2e tests
  loaderOptions?: {
    // for loader tests
    ext?: string;
  };
  expectedFiles?: Array<{
    // for loader tests
    path: string;
    content: string[];
  }>;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  actualOutput?: string;
  expectedOutput?: string;
}
