import { loader } from "../src/loader-impl.js";
import { assertEquals } from "./test-utils.js";
import type { TestCase, TestResult, LoaderTestConfig, LoaderDirectoriesTestConfig } from "./test-types.js";
import { inspect } from "node:util";
import path from "node:path";

export async function runLoaderTest(testCase: TestCase, debug?: boolean): Promise<TestResult> {
  const config = testCase.config as LoaderTestConfig;

  // Step 1: Load templates using the loader with custom options
  const repo = await loader.loadFromDirectory(testCase.directory, config.loaderOptions);

  if (debug) {
    console.log(`   🐛 Debug - Loaded repository:`);
    console.log(inspect(repo, { depth: null, colors: true }));
  }

  // Step 2: Compare with expected files
  const expectedFiles = config.expectedFiles;
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

export async function runLoaderDirectoriesTest(testCase: TestCase, debug?: boolean): Promise<TestResult> {
  const config = testCase.config as LoaderDirectoriesTestConfig;

  try {
    // Step 1: Load templates using the loader with custom options from multiple directories
    const directories = config.directories.map((dir) => {
      if (typeof dir === "string") {
        return path.resolve(testCase.directory, dir);
      } else {
        return {
          path: path.resolve(testCase.directory, dir.path),
          alias: dir.alias,
        };
      }
    });

    const repo = await loader.loadFromDirectories(directories, config.loaderOptions);

    if (debug) {
      console.log(`   🐛 Debug - Loaded repository from directories:`);
      console.log(inspect(repo, { depth: null, colors: true }));
    }

    // If we expected an error but didn't get one, this is a failure
    if (config.expectsError) {
      return {
        name: testCase.name,
        passed: false,
        error: `Expected an error but the operation succeeded`,
      };
    }

    // Step 2: Compare with expected files
    const expectedFiles = config.expectedFiles;
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
  } catch (error) {
    // If we expected an error, check if this is the expected behavior
    if (config.expectsError) {
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
      if (typeof config.expectsError === "string") {
        if (errorMessage.includes(config.expectsError)) {
          return {
            name: testCase.name,
            passed: true,
          };
        } else {
          return {
            name: testCase.name,
            passed: false,
            error: `Expected error message to contain "${config.expectsError}", but got: ${errorMessage}`,
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
