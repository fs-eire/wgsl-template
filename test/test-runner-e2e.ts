import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { build } from "../src/index.js";
import type { TestCase, TestResult, E2ETestConfig } from "./test-types.js";

export async function runE2ETestWithFolders(testName: string, testDir: string): Promise<void> {
  // Read test configuration
  const configPath = path.join(testDir, "test-config.json");
  const configContent = fs.readFileSync(configPath, "utf8");
  const config: E2ETestConfig = JSON.parse(configContent);

  if (config.type !== "e2e") {
    throw new Error(`Invalid test type: ${config.type}`);
  }

  // Set up paths
  const srcDir = path.join(testDir, "src");
  const genDir = path.join(testDir, "gen");
  const expectedDir = path.join(testDir, "expected");

  // Verify src directory exists
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Source directory does not exist: ${srcDir}`);
  }

  // Clean and create gen directory
  if (fs.existsSync(genDir)) {
    fs.rmSync(genDir, { recursive: true, force: true });
  }
  fs.mkdirSync(genDir, { recursive: true });

  // Run the build function
  await build(srcDir, {
    templateExt: config.templateExt || ".wgsl.template",
    outDir: genDir,
    generator: config.generator,
    namespaces: config.namespaces,
  });

  // Compare generated files with expected files
  await compareDirectories(genDir, expectedDir, testName);
}

async function compareDirectories(genDir: string, expectedDir: string, testName: string): Promise<void> {
  if (!fs.existsSync(expectedDir)) {
    throw new Error(`Expected directory does not exist: ${expectedDir}`);
  }

  // Get all files in both directories
  const genFiles = getAllFiles(genDir, genDir);
  const expectedFiles = getAllFiles(expectedDir, expectedDir);

  // Check that all expected files exist in generated files
  for (const expectedFile of expectedFiles) {
    if (!genFiles.includes(expectedFile)) {
      throw new Error(`${testName}: Missing generated file: ${expectedFile}`);
    }

    // Compare file contents
    const genFilePath = path.join(genDir, expectedFile);
    const expectedFilePath = path.join(expectedDir, expectedFile);

    const genContent = fs.readFileSync(genFilePath, "utf8");
    const expectedContent = fs.readFileSync(expectedFilePath, "utf8");

    if (genContent !== expectedContent) {
      throw new Error(
        `${testName}: File content mismatch: ${expectedFile}\nGenerated:\n${genContent}\nExpected:\n${expectedContent}`
      );
    }
  }

  // Check for unexpected generated files
  for (const genFile of genFiles) {
    if (!expectedFiles.includes(genFile)) {
      console.warn(`${testName}: Unexpected generated file: ${genFile}`);
    }
  }
}

function getAllFiles(dir: string, baseDir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else if (stat.isFile()) {
      const relativePath = path.relative(baseDir, fullPath);
      files.push(relativePath.replace(/\\/g, "/"));
    }
  }

  return files;
}

// Original E2E test function for backward compatibility
export async function runE2ETest(testCase: TestCase, debug?: boolean): Promise<TestResult> {
  // Get test configuration
  const config = testCase.config as E2ETestConfig;

  try {
    if (debug) {
      console.log(`Running E2E test: ${testCase.name}`);
    }

    // Create a temporary output directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wgsl-template-e2e-"));

    try {
      const generator = config.generator || "dynamic";
      const templateExt = config.templateExt || ".wgsl.template";

      if (debug) {
        console.log(`  Input directory: ${testCase.directory}`);
        console.log(`  Output directory: ${tempDir}`);
        console.log(`  Generator: ${generator}`);
        console.log(`  Template extension: ${templateExt}`);
      }

      // Call the build function
      await build(testCase.directory, {
        templateExt,
        outDir: tempDir,
        generator: generator as string,
        namespaces: config.namespaces,
      });

      return {
        name: testCase.name,
        passed: true,
      };
    } finally {
      // Clean up temporary directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    }
  } catch (error) {
    if (config.expectsError) {
      const expectedError = config.expectsError;
      const actualError = (error as Error).message;

      if (typeof expectedError === "string" && !actualError.includes(expectedError)) {
        return {
          name: testCase.name,
          passed: false,
          error: `Expected error message to contain "${expectedError}", but got: ${actualError}`,
        };
      }

      return {
        name: testCase.name,
        passed: true,
      };
    }

    return {
      name: testCase.name,
      passed: false,
      error: `E2E test failed: ${(error as Error).message}`,
    };
  }
}
