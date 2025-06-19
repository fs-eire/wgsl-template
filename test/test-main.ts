import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import minimist from "minimist";

import type { TestCase, TestConfig, TestResult } from "./test-types.js";

// Import test runners
import { runLoaderTest } from "./test-runner-loader.js";
import { runParserTest } from "./test-runner-parser.js";
import { runE2ETest, runE2ETestWithFolders } from "./test-runner-e2e.js";
import { runGeneratorTest } from "./test-runner-generator.js";

// Test case discovery
async function discoverTestCases(testCasesDir: string, includeDisabled: boolean = false): Promise<TestCase[]> {
  const testCases: TestCase[] = [];

  try {
    const entries = await readdir(testCasesDir);

    for (const entry of entries) {
      const testCaseDir = path.join(testCasesDir, entry);
      const entryStat = await stat(testCaseDir);
      if (entryStat.isDirectory()) {
        try {
          const testCase = await loadTestCase(entry, testCaseDir);
          // Check if test is disabled
          if (testCase.config.disabled && !includeDisabled) {
            const reason =
              typeof testCase.config.disabled === "string" ? testCase.config.disabled : "no reason specified";
            console.log(`⏭️  Skipping disabled test "${entry}": ${reason}`);
            continue;
          }

          testCases.push(testCase);
        } catch (error) {
          console.warn(`⚠️  Failed to load test case "${entry}": ${(error as Error).message}`);
        }
      }
    }
  } catch (error) {
    console.error(`Failed to discover test cases: ${(error as Error).message}`);
  }

  return testCases;
}

async function loadTestCase(name: string, directory: string): Promise<TestCase> {
  // Load test configuration
  const configPath = path.join(directory, "test-config.json");
  let config: TestConfig;

  try {
    const configContent = await readFile(configPath, "utf8");
    config = JSON.parse(configContent);
  } catch (error) {
    throw new Error(`Failed to load test config: ${(error as Error).message}`);
  }
  // Discover template files
  const files = await readdir(directory);
  let expectedExt = ".wgsl.template";

  if (config.type === "loader" && config.loaderOptions?.ext) {
    expectedExt = config.loaderOptions.ext;
  } else if (config.type === "e2e" && config.templateExt) {
    expectedExt = config.templateExt;
  }

  const templateFiles = files.filter((file) => file.endsWith(expectedExt));
  // Only require template files for e2e tests (loader and parser tests can be empty)
  if (templateFiles.length === 0 && config.type === "e2e") {
    throw new Error("No template files found");
  }

  return {
    name,
    directory,
    templateFiles,
    config,
  };
}

// Test execution
async function runTestCase(testCase: TestCase, debug?: boolean): Promise<TestResult> {
  try {
    switch (testCase.config.type) {
      case "loader":
        return await runLoaderTest(testCase, debug);
      case "parser":
        return await runParserTest(testCase, debug);
      case "e2e":
        // Check if this is a new-style E2E test with src/gen/expected folders
        const srcDir = path.join(testCase.directory, "src");
        const expectedDir = path.join(testCase.directory, "expected");

        try {
          await stat(srcDir);
          await stat(expectedDir);
          // New folder structure detected, use the new E2E test runner
          await runE2ETestWithFolders(testCase.name, testCase.directory);
          return { name: testCase.name, passed: true };
        } catch {
          // Fall back to old E2E test runner
          return await runE2ETest(testCase, debug);
        }
      case "generator":
        return await runGeneratorTest(testCase, debug);
      default:
        const exhaustiveCheck: never = testCase.config;
        throw new Error(`Unknown test type: ${(exhaustiveCheck as TestConfig).type}`);
    }
  } catch (error) {
    return {
      name: testCase.name,
      passed: false,
      error: (error as Error).message,
    };
  }
}

// Command line argument parsing
function parseCommandLineArgs(): { testCase?: string; help?: boolean; debug?: boolean } {
  const argv = minimist(process.argv.slice(2), {
    string: ["case", "c"],
    boolean: ["help", "h", "debug", "d"],
    alias: {
      c: "case",
      h: "help",
      d: "debug",
    },
  });

  return {
    testCase: argv.case || argv.c,
    help: argv.help || argv.h,
    debug: argv.debug || argv.d,
  };
}

// Test runner
async function runAllTests(specificTestCase?: string, debug?: boolean): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Find project root by looking for package.json
  let projectRoot = __dirname;
  while (projectRoot !== path.dirname(projectRoot)) {
    try {
      await readFile(path.join(projectRoot, "package.json"), "utf8");
      break; // Found package.json
    } catch {
      projectRoot = path.dirname(projectRoot);
    }
  }

  const testCasesDir = path.join(projectRoot, "test", "testcases");

  console.log("🔍 Discovering test cases...");
  let testCases = await discoverTestCases(testCasesDir);
  if (specificTestCase) {
    // First try to find the test case (including disabled ones)
    const allTestCases = await discoverTestCases(testCasesDir, true);
    const foundTestCase = allTestCases.find((tc) => tc.name === specificTestCase);

    if (!foundTestCase) {
      console.log(`❌ Test case "${specificTestCase}" not found!`);
      console.log("Available test cases:");
      allTestCases.forEach((tc) => {
        const disabledInfo = tc.config.disabled
          ? ` (disabled: ${typeof tc.config.disabled === "string" ? tc.config.disabled : "no reason"})`
          : "";
        console.log(`  - ${tc.name}${disabledInfo}`);
      });
      process.exit(1);
    }

    // Check if the found test case is disabled
    if (foundTestCase.config.disabled) {
      const reason =
        typeof foundTestCase.config.disabled === "string" ? foundTestCase.config.disabled : "no reason specified";
      console.log(`❌ Cannot run disabled test case "${specificTestCase}": ${reason}`);
      process.exit(1);
    }

    testCases = [foundTestCase];
    console.log(`🎯 Running specific test case: ${specificTestCase}`);
  }

  if (testCases.length === 0) {
    console.log("❌ No test cases found!");
    return;
  }

  console.log(`📋 Found ${testCases.length} test case(s)\n`);

  const results: TestResult[] = [];
  for (const testCase of testCases) {
    console.log(`🧪 Running test: ${testCase.name}`);
    if (testCase.config.description) {
      console.log(`   📄 ${testCase.config.description}`);
    }
    const result = await runTestCase(testCase, debug);
    results.push(result);

    if (result.passed) {
      console.log(`✅ ${testCase.name} - PASSED`);
    } else {
      console.log(`❌ ${testCase.name} - FAILED`);
      console.log(`   Error: ${result.error}`);
    }
    console.log();
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const failedResults = results.filter((r) => !r.passed);

  console.log(`\n📊 Test Summary:`);
  console.log(`✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
  }
  console.log(`📋 Total:  ${results.length}`);

  if (failed > 0) {
    console.log(`\n🔥 Failed Tests Summary:`);
    failedResults.forEach((result, index) => {
      console.log(`${index + 1}. ${result.name} - ${result.error}`);
    });
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { testCase, help, debug } = parseCommandLineArgs();

  if (help) {
    console.log(`
Usage: npm test [-- [options]]
       npx ts-node test/test-main.ts [options]

Options:
  --case, -c <name>    Run only the specified test case
  --debug, -d          Print detailed repository information using util.inspect
  --help, -h           Show this help message

Examples:
  npm test                           # Run all test cases
  npm test -- --case parser-basic   # Run only parser-basic test case
  npm test -- -c loader-empty       # Run only loader-empty test case
`);
    process.exit(0);
  }

  runAllTests(testCase, debug).catch((error) => {
    console.error("💥 Test runner failed:", error);
    process.exit(1);
  });
} else {
  console.log("This module is intended to be run as a script, not imported.");
  console.log(import.meta.url);
  console.log(process.argv[1]);
}
