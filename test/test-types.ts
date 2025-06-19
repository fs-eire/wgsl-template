// Test framework types
export interface TestCase {
  name: string;
  directory: string;
  templateFiles: string[];
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
  expectedFiles?: Array<{
    path: string;
    content: string[];
  }>;
}

// Parser test configuration
export interface ParserTestConfig extends BaseTestConfig {
  type: "parser";
  expectsError?: boolean | string; // true if test should throw an error, or expected error message pattern
}

// E2E test configuration
export interface E2ETestConfig extends BaseTestConfig {
  type: "e2e";
  templateExt?: string;
  generator: string;
  namespaces?: string[];
  params?: Record<string, string | number | boolean>; // Parameters to pass to the generator
  expectsError?: boolean | string; // true if test should throw an error, or expected error message pattern
}

// Generator test configuration
export interface GeneratorTestConfig extends BaseTestConfig {
  type: "generator";
  // Generator tests use object with template file paths as keys
  entries: Record<
    string,
    {
      targets: Record<
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
export type TestConfig = LoaderTestConfig | ParserTestConfig | E2ETestConfig | GeneratorTestConfig;

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  actualOutput?: string;
  expectedOutput?: string;
}
