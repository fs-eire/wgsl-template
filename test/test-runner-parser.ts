import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { inspect } from "node:util";
import { loader } from "../src/loader-impl.js";
import { parser } from "../src/parser-impl.js";
import { assertEquals } from "./test-utils.js";
import type { TestCase, TestResult } from "./test-types.js";

export async function runParserTest(testCase: TestCase, debug?: boolean): Promise<TestResult> {
  try {
    // Step 1: Load templates
    const repo = await loader.loadFromDirectory(testCase.directory, testCase.config.loaderOptions);

    if (debug) {
      console.log(`   🐛 Debug - Loaded repository:`);
      console.log(inspect(repo, { depth: null, colors: true }));
    }

    // Step 2: Parse templates
    const parsedRepo = parser.parse(repo);

    if (debug) {
      console.log(`   🐛 Debug - Parsed repository:`);
      console.log(inspect(parsedRepo, { depth: null, colors: true }));
    }

    // If this test expects an error but we got here without throwing, that's a failure
    if (testCase.config.expectsError) {
      return {
        name: testCase.name,
        passed: false,
        error: `Expected an error to be thrown, but the test completed successfully`,
      };
    }

    // Step 3: For each template file, validate that a corresponding .pass1 file exists and matches
    for (const [templateKey, template] of parsedRepo.templates) {
      const expectedResultPath = path.join(testCase.directory, `${templateKey}.pass1`);

      // Check if the expected result file exists
      let expectedContent: string;
      try {
        expectedContent = await readFile(expectedResultPath, "utf8");
      } catch (error) {
        throw new Error(
          `Expected result file not found: ${expectedResultPath} (template key: ${templateKey}). Error: ${(error as Error).message}`
        );
      }

      // Parse expected content into lines (normalize line endings)
      const expectedLines = expectedContent.split(/\r?\n/);
      const actualLines = Array.from(template.pass1);

      // Compare line by line
      if (actualLines.length !== expectedLines.length) {
        throw new Error(
          `Line count mismatch for ${templateKey}: expected ${expectedLines.length}, got ${actualLines.length}`
        );
      }

      for (let i = 0; i < actualLines.length; i++) {
        assertEquals(String(actualLines[i]), expectedLines[i], `Line ${i + 1} mismatch in ${templateKey}`);
      }
    }

    return {
      name: testCase.name,
      passed: true,
    };
  } catch (error) {
    // If we expected an error, check if this is the expected behavior
    if (testCase.config.expectsError) {
      const errorMessage = (error as Error).message;

      if (debug) {
        console.log(`🐛 Debug: Expected error caught:`);
        console.log(`   Error type: ${(error as Error).constructor.name}`);
        console.log(`   Error message: ${errorMessage}`);
        if ((error as Error).stack) {
          console.log(`   Stack trace: ${(error as Error).stack}`);
        }
      }

      // If expectsError is a string, check if the error message contains the expected pattern
      if (typeof testCase.config.expectsError === "string") {
        if (errorMessage.includes(testCase.config.expectsError)) {
          return {
            name: testCase.name,
            passed: true,
          };
        } else {
          return {
            name: testCase.name,
            passed: false,
            error: `Expected error message to contain "${testCase.config.expectsError}", but got: ${errorMessage}`,
          };
        }
      } else {
        // expectsError is true, so any error is acceptable
        return {
          name: testCase.name,
          passed: true,
        };
      }
    }

    // If we didn't expect an error, this is a failure
    return {
      name: testCase.name,
      passed: false,
      error: (error as Error).message,
    };
  }
}
