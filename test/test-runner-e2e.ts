import * as path from "node:path";
import { inspect } from "node:util";
import { loader } from "../src/loader-impl.js";
import { parser } from "../src/parser-impl.js";
import { generator } from "../src/generator-impl.js";
import { assertEquals } from "./test-utils.js";
import { type TestCase, type TestResult } from "./test-types.js";

export async function runE2ETest(testCase: TestCase, debug?: boolean): Promise<TestResult> {
  // TODO: Implement e2e tests (similar to the original implementation)
  if (!testCase.config.mainTemplate || !testCase.config.generatorOptions) {
    throw new Error("mainTemplate and generatorOptions required for e2e tests");
  }

  // Step 1: Load templates
  const repo = await loader.loadFromDirectory(testCase.directory);

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

  // Step 3: Generate output
  const templateKey = path.basename(testCase.config.mainTemplate);
  const output = generator.generate(templateKey, parsedRepo, testCase.config.generatorOptions);

  // Step 4: Check result
  if (testCase.expectedOutput) {
    assertEquals(output.trim(), testCase.expectedOutput.trim(), `Output mismatch for test case "${testCase.name}"`);
  }

  return {
    name: testCase.name,
    passed: true,
    actualOutput: output,
    expectedOutput: testCase.expectedOutput,
  };
}
