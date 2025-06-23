// Test framework types
export interface TestCase {
  name: string;
  directory: string;
  expectedOutput?: string;
  config: TestConfig;
}

// Base test configuration
export interface BaseTestConfig {
  description?: string; // Optional description of what the test does
  disabled?: boolean | string; // Optional: true/false or reason why disabled
}

// Loader test configuration
export interface LoaderTestConfig extends BaseTestConfig {
  type: "loader";
  expectsError?: boolean | string; // true if test should throw an error, or expected error message pattern
  loaderOptions?: {
    ext?: string;
  };
  expectedFiles?: {
    path: string;
    content: string[];
  }[];
}

// Parser test configuration
export interface ParserTestConfig extends BaseTestConfig {
  type: "parser";
  expectsError?: boolean | string; // true if test should throw an error, or expected error message pattern
}

// Build test configuration (formerly E2E)
export interface BuildTestConfig extends BaseTestConfig {
  type: "build";
  templateExt?: string;
  generators: Record<
    string,
    {
      expectsError?: boolean | string; // true if test should throw an error, or expected error message pattern
    }
  >;
}

// Generator test configuration
export interface GeneratorTestConfig extends BaseTestConfig {
  type: "generator";
  preserveCodeReference?: boolean; // Whether to preserve code references in generated output
  // Generator tests use object with template file paths as keys
  entries: Record<
    string,
    {
      generators: Record<
        string,
        {
          expectsError?: boolean | string;
          expectedParams?: string[];
          expectedVariables?: string[];
        }
      >;
    }
  >;
}

// Union type for all test configurations
export type TestConfig = LoaderTestConfig | ParserTestConfig | BuildTestConfig | GeneratorTestConfig;

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  actualOutput?: string;
  expectedOutput?: string;
}
