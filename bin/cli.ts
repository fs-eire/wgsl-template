#!/usr/bin/env node

import * as fs from "fs/promises";
import * as path from "path";
import minimist from "minimist";
import { build } from "../src/index.js";

function showHelp() {
  console.log(`
WGSL Template Generator CLI

Usage:
  npx wgsl-gen [options]

Options:
  --input, -i <dir>              Source directory containing WGSL template files (required)
  --output, -o <dir>             Output directory for generated files (required)
  --generator <name>             Code generator to use (default: "static-cpp-literal")
                                 Available: "dynamic", "static-cpp", "static-cpp-literal"
  --ext <extension>              Template file extension (default: ".wgsl.template")
  --include-prefix, -I <prefix>  Include path prefix for generated headers
  --clean, -c                    Clean output directory before building
  --help, -h                     Show this help message
  --version, -v                  Show version information

Examples:
  npx wgsl-gen --input ./templates --output ./generated
  npx wgsl-gen --input ./shaders --output ./cpp --generator static-cpp
  npx wgsl-gen -i ./src -o ./build --include-prefix "myproject"
  npx wgsl-gen -i ./templates -o ./generated --clean
`);
}

function showVersion() {
  // Read version from package.json
  const packageJsonPath = path.join(import.meta.dirname, "..", "..", "package.json");
  fs.readFile(packageJsonPath, "utf8")
    .then((content) => {
      const packageJson = JSON.parse(content);
      console.log(`WGSL Template Generator v${packageJson.version}`);
    })
    .catch(() => {
      console.log("WGSL Template Generator (version unknown)");
    });
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    alias: {
      h: "help",
      v: "version",
      i: "input",
      o: "output",
      g: "generator",
      e: "ext",
      I: "include-prefix",
      c: "clean",
    },
    string: ["input", "output", "generator", "ext", "include-prefix"],
    boolean: ["help", "version", "clean"],
  });

  const options = {
    help: argv.help,
    version: argv.version,
    input: argv.input,
    output: argv.output,
    generator: argv.generator,
    ext: argv.ext,
    includePrefix: argv["include-prefix"],
    clean: argv.clean,
  };

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.version) {
    showVersion();
    process.exit(0);
  }

  // Validate required options
  if (!options.input) {
    console.error("Error: --input option is required");
    console.error("Use --help for usage information");
    process.exit(1);
  }

  if (!options.output) {
    console.error("Error: --output option is required");
    console.error("Use --help for usage information");
    process.exit(1);
  }

  // Set defaults
  const generator = options.generator || "static-cpp-literal";
  const templateExt = options.ext || ".wgsl.template";

  try {
    // Check if source directory exists
    const srcPath = path.resolve(options.input);
    const outPath = path.resolve(options.output);

    try {
      await fs.access(srcPath);
    } catch {
      console.error(`Error: Source directory "${srcPath}" does not exist`);
      process.exit(1);
    }

    // Check if output path is an existing file (not allowed regardless of clean flag)
    try {
      const outStat = await fs.stat(outPath);
      if (outStat.isFile()) {
        console.error(`Error: Output path "${outPath}" is an existing file`);
        console.error("Output path must be a directory");
        process.exit(1);
      }
    } catch {
      // Path doesn't exist, that's fine
    }

    // Clean output directory if --clean is specified
    if (options.clean) {
      try {
        const outStat = await fs.stat(outPath);
        if (outStat.isDirectory()) {
          console.log(`Cleaning output directory: ${outPath}`);
          await fs.rm(outPath, { recursive: true });
        }
      } catch {
        // Directory doesn't exist, nothing to clean
      }
    }

    console.log(`Building WGSL templates...`);
    console.log(`  Source: ${srcPath}`);
    console.log(`  Output: ${outPath}`);
    console.log(`  Generator: ${generator}`);
    console.log(`  Template extension: ${templateExt}`);
    if (options.includePrefix) {
      console.log(`  Include prefix: ${options.includePrefix}`);
    }
    if (options.clean) {
      console.log(`  Clean directory: enabled`);
    }

    // Run the build
    const result = await build({
      sourceDir: srcPath,
      outDir: outPath,
      templateExt,
      generator,
      includePathPrefix: options.includePrefix,
    });

    if (result.status === "success") {
      console.log("✅ Build completed successfully!");
      if (result.files) {
        console.log(`📁 Generated ${result.files.size} file(s)`);
      }
    } else {
      console.error("❌ Build failed:");
      console.error(result.error || "Unknown error");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Build failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Unexpected error:");
  console.error(error);
  process.exit(1);
});
