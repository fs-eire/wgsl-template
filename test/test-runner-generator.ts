import * as path from "node:path";
import { readFile } from "node:fs/promises";
import { inspect } from "node:util";
import { loader } from "../src/loader-impl.js";
import { parser } from "../src/parser-impl.js";
import { generator } from "../src/generator-impl.js";
import { resolveCodeGenerator } from "../src/code-generator-impl.js";
import type { TestCase, TestResult } from "./test-types.js";
import { testCodeGenerator } from "./test-code-generator.js";

export async function runGeneratorTest(testCase: TestCase, debug?: boolean): Promise<TestResult> {
  if (!testCase.config.entries || !testCase.config.target) {
    throw new Error("entries and target are required for generator tests");
  }

  // Step 1: Run loader
  const repo = await loader.loadFromDirectory(testCase.directory);

  if (debug) {
    console.log(`   🐛 Debug - Loaded repository:`);
    console.log(inspect(repo, { depth: null, colors: true }));
  }

  // Step 2: Run parser
  const parsedRepo = parser.parse(repo);

  if (debug) {
    console.log(`   🐛 Debug - Parsed repository:`);
    console.log(inspect(parsedRepo, { depth: null, colors: true }));
  }

  // Resolve the code generator from the target
  const codeGenerator =
    testCase.config.target === "test" ? testCodeGenerator : resolveCodeGenerator(testCase.config.target);

  try {
    // Step 3: Run generator for each entry
    for (const entry of testCase.config.entries) {
      // Generate the actual output
      const actualOutput = generator.generate(entry, parsedRepo, codeGenerator);

      // If we expected an error but got here without throwing, that's a failure
      if (testCase.config.expectsError) {
        return {
          name: testCase.name,
          passed: false,
          error: `Expected an error to be thrown, but the generation completed successfully`,
        };
      }

      // Load expected output from .gen file
      const expectedFilePath = path.join(testCase.directory, `${entry}.gen`);
      let expectedOutput: string;

      try {
        expectedOutput = await readFile(expectedFilePath, "utf8");
      } catch (error) {
        throw new Error(`Expected output file not found: ${expectedFilePath}. Error: ${(error as Error).message}`);
      }

      if (debug) {
        console.log(`   🐛 Debug - Entry "${entry}":`);
        console.log(`   Expected file: ${expectedFilePath}`);
        console.log(`   Actual output length: ${actualOutput.length}`);
        console.log(`   Expected output length: ${expectedOutput.length}`);
      }

      // Compare actual vs expected output line by line
      try {
        // Split content into lines and filter out empty lines
        const actualLines = actualOutput.split(/\r?\n/).filter((line) => line.trim() !== "");
        const expectedLines = expectedOutput.split(/\r?\n/).filter((line) => line.trim() !== "");

        if (debug) {
          console.log(`   🐛 Debug - Line comparison:`);
          console.log(`   Actual lines count: ${actualLines.length}`);
          console.log(`   Expected lines count: ${expectedLines.length}`);
        }

        // Check line count first
        if (actualLines.length !== expectedLines.length) {
          throw new Error(
            `Line count mismatch: expected ${expectedLines.length} lines, got ${actualLines.length} lines`
          );
        }

        // Compare each line
        for (let i = 0; i < actualLines.length; i++) {
          const actualLine = actualLines[i].trim();
          const expectedLine = expectedLines[i].trim();

          if (actualLine !== expectedLine) {
            throw new Error(
              `Line ${i + 1} mismatch:\n` + `  Expected: "${expectedLine}"\n` + `  Actual:   "${actualLine}"`
            );
          }
        }

        if (debug) {
          console.log(`   ✅ All ${actualLines.length} lines match`);
        }
      } catch (error) {
        const errorMessage = `Entry "${entry}": ${(error as Error).message}`;

        if (debug) {
          console.log(`   🐛 Debug - Test failed, outputting full results:`);
          console.log(`================== ACTUAL OUTPUT ==================`);
          console.log(actualOutput);
          console.log(`================== EXPECTED OUTPUT ==================`);
          console.log(expectedOutput);
          console.log(`================== END OF OUTPUT COMPARISON ==================`);
        }

        return {
          name: testCase.name,
          passed: false,
          error: errorMessage,
        };
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
