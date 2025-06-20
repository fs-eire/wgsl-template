import * as fs from "fs";
import * as path from "path";
import { build } from "../src/index.js";
import type { TestCase, TestResult, BuildTestConfig } from "./test-types.js";

export async function runBuildTest(testCase: TestCase, debug?: boolean): Promise<TestResult> {
  const config = testCase.config as BuildTestConfig;

  if (config.type !== "build") {
    throw new Error(`Invalid test type: ${config.type}`);
  }

  if (!config.generators || Object.keys(config.generators).length === 0) {
    throw new Error(`Build test "${testCase.name}" is missing required "generators" property`);
  }

  if (debug) {
    console.log(`Running build test: ${testCase.name}`);
  }

  // Set up paths - only support new folder structure
  const srcDir = path.join(testCase.directory, "src");
  const expectedDir = path.join(testCase.directory, "expected");

  // Verify src directory exists
  if (!fs.existsSync(srcDir)) {
    throw new Error(
      `Source directory does not exist: ${srcDir}. Build tests must use src/gen/expected folder structure.`
    );
  }

  // Verify expected directory exists
  if (!fs.existsSync(expectedDir)) {
    throw new Error(
      `Expected directory does not exist: ${expectedDir}. Build tests must use src/gen/expected folder structure.`
    );
  }

  // Process each generator
  for (const [generatorName, generatorConfig] of Object.entries(config.generators)) {
    const genDir = path.join(testCase.directory, "gen", generatorName);

    try {
      // Clean and create gen directory for this generator
      if (fs.existsSync(genDir)) {
        fs.rmSync(genDir, { recursive: true, force: true });
      }
      fs.mkdirSync(genDir, { recursive: true });

      if (debug) {
        console.log(`  Source directory: ${srcDir}`);
        console.log(`  Output directory: ${genDir}`);
        console.log(`  Expected directory: ${expectedDir}`);
        console.log(`  Generator: ${generatorName}`);
        console.log(`  Template extension: ${config.templateExt || ".wgsl.template"}`);
      }

      // Run the build function for this generator
      await build(srcDir, {
        templateExt: config.templateExt || ".wgsl.template",
        outDir: genDir,
        generator: generatorName,
        namespaces: config.namespaces,
      });

      // If this generator expects an error but we got here without throwing, that's a failure
      if (generatorConfig.expectsError) {
        return {
          name: testCase.name,
          passed: false,
          error: `Generator "${generatorName}": Expected an error to be thrown, but the build completed successfully`,
        };
      }

      // Compare generated files with expected files for this generator
      const expectedGenDir = path.join(expectedDir, generatorName);
      if (!fs.existsSync(expectedGenDir)) {
        throw new Error(`Expected directory for generator "${generatorName}" does not exist: ${expectedGenDir}`);
      }

      await compareDirectories(genDir, expectedGenDir, `${testCase.name} (${generatorName})`);
    } catch (error) {
      if (generatorConfig.expectsError) {
        const expectedError = generatorConfig.expectsError;
        const actualError = (error as Error).message;

        if (typeof expectedError === "string" && !actualError.includes(expectedError)) {
          return {
            name: testCase.name,
            passed: false,
            error: `Generator "${generatorName}": Expected error message to contain "${expectedError}", but got: ${actualError}`,
          };
        }

        // Expected error was caught, continue to next generator
        if (debug) {
          console.log(`  ✅ Expected error caught for generator "${generatorName}"`);
        }
        continue;
      }

      return {
        name: testCase.name,
        passed: false,
        error: `Generator "${generatorName}": Build test failed: ${(error as Error).message}`,
      };
    }
  }

  return {
    name: testCase.name,
    passed: true,
  };
}

async function compareDirectories(genDir: string, expectedDir: string, testName: string): Promise<void> {
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
