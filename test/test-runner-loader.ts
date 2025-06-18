import { loader } from "../src/loader-impl";
import { assertEquals } from "./test-utils";
import { type TestCase, type TestResult } from "./test-types";
import { inspect } from "node:util";

export async function runLoaderTest(testCase: TestCase, debug?: boolean): Promise<TestResult> {
  // Step 1: Load templates using the loader with custom options
  const repo = await loader.loadFromDirectory(testCase.directory, testCase.config.loaderOptions);

  if (debug) {
    console.log(`   🐛 Debug - Loaded repository:`);
    console.log(inspect(repo, { depth: null, colors: true }));
  }

  // Step 2: Compare with expected files
  const expectedFiles = testCase.config.expectedFiles;
  if (expectedFiles) {
    for (const expectedFile of expectedFiles) {
      const template = repo.templates.get(expectedFile.path);
      if (!template) {
        throw new Error(`Template not found: ${expectedFile.path}`);
      }

      // Compare raw content with expected content
      const actualLines = Array.from(template.raw);
      const expectedLines = expectedFile.content;

      // Compare line by line
      if (actualLines.length !== expectedLines.length) {
        throw new Error(
          `Line count mismatch for ${expectedFile.path}: expected ${expectedLines.length}, got ${actualLines.length}`
        );
      }

      for (let i = 0; i < actualLines.length; i++) {
        assertEquals(actualLines[i], expectedLines[i], `Line ${i + 1} mismatch in ${expectedFile.path}`);
      }
    }
  }

  return {
    name: testCase.name,
    passed: true,
  };
}
