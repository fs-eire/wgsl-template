import * as path from "node:path";
import { readFile } from "node:fs/promises";
import { inspect } from "node:util";
import { loader } from "../src/loader-impl.js";
import { parser } from "../src/parser-impl.js";
import { generator } from "../src/generator-impl.js";
import { resolveCodeGenerator } from "../src/code-generator-impl.js";
import type { TestCase, TestResult, GeneratorTestConfig } from "./test-types.js";

export async function runGeneratorTest(testCase: TestCase, debug?: boolean): Promise<TestResult> {
  const config = testCase.config as GeneratorTestConfig;

  if (typeof config.entries !== "object") {
    throw new Error("entries must be an object with template file paths as keys");
  }

  const entriesToProcess: {
    templatePath: string;
    generator: string;
    expectsError?: boolean | string;
    expectedParams?: string[];
    expectedVariables?: string[];
  }[] = [];

  // Flatten the entries with their generators
  for (const [templatePath, entryConfig] of Object.entries(config.entries)) {
    if (!entryConfig.generators || Object.keys(entryConfig.generators).length === 0) {
      throw new Error(`Entry "${templatePath}" is missing required "generators" property`);
    }

    for (const [generatorName, generatorConfig] of Object.entries(entryConfig.generators)) {
      entriesToProcess.push({
        templatePath,
        generator: generatorName,
        expectsError: generatorConfig.expectsError,
        expectedParams: generatorConfig.expectedParams,
        expectedVariables: generatorConfig.expectedVariables,
      });
    }
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

  try {
    // Step 3: Create generator instances once per test case
    const generatorInstances = new Map<string, ReturnType<typeof resolveCodeGenerator>>();

    // Collect unique generators from all entries
    const uniqueGenerators = new Set<string>();
    for (const entryConfig of entriesToProcess) {
      uniqueGenerators.add(entryConfig.generator);
    }

    // Create generator instances
    for (const generatorName of uniqueGenerators) {
      const codeGenerator = resolveCodeGenerator(generatorName);
      generatorInstances.set(generatorName, codeGenerator);

      if (debug) {
        console.log(`   🔧 Created generator instance: ${generatorName}`);
      }
    }

    if (debug) {
      console.log(
        `   🔄 Reusing ${generatorInstances.size} generator instance(s) across ${entriesToProcess.length} entries`
      );
    }

    // Step 4: Run generator for each entry
    for (const entryConfig of entriesToProcess) {
      // Get the pre-created generator instance
      const codeGenerator = generatorInstances.get(entryConfig.generator)!;

      try {
        // Generate the actual output
        const generateResult = generator.generate(entryConfig.templatePath, parsedRepo, codeGenerator, {
          preserveCodeReference: config.preserveCodeReference,
        });
        const actualOutput = generateResult.code;

        // If we expected an error but got here without throwing, that's a failure
        if (entryConfig.expectsError) {
          return {
            name: testCase.name,
            passed: false,
            error: `Entry "${entryConfig.templatePath}" (generator: ${entryConfig.generator}): Expected an error to be thrown, but the generation completed successfully`,
          };
        }

        // Load expected output from target-specific .gen file
        const expectedFilePath = path.join(
          testCase.directory,
          `${entryConfig.templatePath}.${entryConfig.generator}.gen`
        );
        let expectedOutput: string;

        try {
          expectedOutput = await readFile(expectedFilePath, "utf8");
        } catch (error) {
          throw new Error(`Expected output file not found: ${expectedFilePath}. Error: ${(error as Error).message}`);
        }

        if (debug) {
          console.log(`   🐛 Debug - Entry "${entryConfig.templatePath}" (generator: ${entryConfig.generator}):`);
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
            console.log(
              `   ✅ All ${actualLines.length} lines match for entry "${entryConfig.templatePath}" (generator: ${entryConfig.generator})`
            );
          }

          // Check expected params if specified
          if (entryConfig.expectedParams) {
            const actualParams = Array.from(generateResult.params.keys());
            const expectedParams = entryConfig.expectedParams.sort();

            if (JSON.stringify(actualParams) !== JSON.stringify(expectedParams)) {
              throw new Error(
                `Parameters mismatch:\n` +
                  `  Expected: [${expectedParams.join(", ")}]\n` +
                  `  Actual:   [${actualParams.join(", ")}]`
              );
            }

            if (debug) {
              console.log(`   ✅ Parameters match: [${actualParams.join(", ")}]`);
            }
          }

          // Check expected variables if specified
          if (entryConfig.expectedVariables) {
            const actualVariables = Array.from(generateResult.variables.keys());
            const expectedVariables = entryConfig.expectedVariables.sort();

            if (JSON.stringify(actualVariables) !== JSON.stringify(expectedVariables)) {
              throw new Error(
                `Variables mismatch:\n` +
                  `  Expected: [${expectedVariables.join(", ")}]\n` +
                  `  Actual:   [${actualVariables.join(", ")}]`
              );
            }

            if (debug) {
              console.log(`   ✅ Variables match: [${actualVariables.join(", ")}]`);
            }
          }
        } catch (error) {
          const errorMessage = `Entry "${entryConfig.templatePath}" (generator: ${entryConfig.generator}): ${(error as Error).message}`;

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
      } catch (error) {
        // If we expected an error for this specific entry, check if this is the expected behavior
        if (entryConfig.expectsError) {
          const errorMessage = (error as Error).message;

          if (debug) {
            console.log(
              `🐛 Debug: Expected error caught for entry "${entryConfig.templatePath}" (generator: ${entryConfig.generator}):`
            );
            console.log(`   Error type: ${(error as Error).constructor.name}`);
            console.log(`   Error message: ${errorMessage}`);
            if ((error as Error).stack) {
              console.log(`   Stack trace: ${(error as Error).stack}`);
            }
          }

          // If expectsError is a string, check if the error message contains the expected pattern
          if (typeof entryConfig.expectsError === "string") {
            if (errorMessage.includes(entryConfig.expectsError)) {
              if (debug) {
                console.log(
                  `   ✅ Error message matches expected pattern for entry "${entryConfig.templatePath}" (generator: ${entryConfig.generator})`
                );
              }
              // Continue to next entry - this one passed
              continue;
            } else {
              return {
                name: testCase.name,
                passed: false,
                error: `Entry "${entryConfig.templatePath}" (generator: ${entryConfig.generator}): Expected error message to contain "${entryConfig.expectsError}", but got: ${errorMessage}`,
              };
            }
          } else {
            // expectsError is true, so any error is acceptable for this entry
            if (debug) {
              console.log(
                `   ✅ Any error was expected and received for entry "${entryConfig.templatePath}" (generator: ${entryConfig.generator})`
              );
            }
            // Continue to next entry - this one passed
            continue;
          }
        }

        // If we didn't expect an error for this entry, this is a failure
        return {
          name: testCase.name,
          passed: false,
          error: `Entry "${entryConfig.templatePath}" (generator: ${entryConfig.generator}): ${(error as Error).message}`,
        };
      }
    }

    // All entries processed successfully
    return {
      name: testCase.name,
      passed: true,
    };
  } catch (error) {
    // Catch any unexpected errors during processing
    return {
      name: testCase.name,
      passed: false,
      error: `Unexpected error: ${(error as Error).message}`,
    };
  }
}
