// Test framework types
export interface TestCase {
  name: string;
  directory: string;
  templateFiles: string[];
  expectedOutput?: string;
  config: TestConfig;
}

export interface TestConfig {
  type: "loader" | "parser" | "e2e" | "generator";
  description?: string; // Optional description of what the test does
  disabled?: boolean | string; // Optional: true/false or reason why disabled

  // For loader and parser tests: true if test should throw an error, or expected error message pattern
  expectsError?: boolean | string;

  // For loader tests
  loaderOptions?: {
    ext?: string;
  };
  // For loader tests
  expectedFiles?: Array<{
    path: string;
    content: string[];
  }>;

  // For e2e tests
  params?: Record<string, string | number | boolean>; // Parameters to pass to the generator

  // For e2e and generator tests - object with template file paths as keys
  entries?: Record<
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

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  actualOutput?: string;
  expectedOutput?: string;
}
