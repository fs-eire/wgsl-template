import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { inspect } from "node:util";
import { loader } from "../src/loader-impl";
import { parser } from "../src/parser-impl";
import { assertEquals } from "./test-utils";
import { type TestCase, type TestResult } from "./test-types";

export async function runParserTest(testCase: TestCase, debug?: boolean): Promise<TestResult> {
  // Step 1: Load templates
  const repo = await loader.loadFromDirectory(
    testCase.directory,
    testCase.config.loaderOptions
  );

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

  // Step 3: For each template file, validate that a corresponding .pass1 file exists and matches
  for (const [templateKey, template] of parsedRepo.templates) {
    const expectedResultPath = path.join(testCase.directory, `${templateKey}.pass1`);
    
    // Check if the expected result file exists
    let expectedContent: string;
    try {
      expectedContent = await readFile(expectedResultPath, "utf8");
    } catch (error) {
      throw new Error(`Expected result file not found: ${expectedResultPath} (template key: ${templateKey})`);
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
      assertEquals(
        String(actualLines[i]),
        expectedLines[i],
        `Line ${i + 1} mismatch in ${templateKey}`
      );
    }
  }

  return {
    name: testCase.name,
    passed: true,
  };
}
