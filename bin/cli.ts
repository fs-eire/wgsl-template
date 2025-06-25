#!/usr/bin/env node

import minimist from "minimist";
import { build } from "../src/index.js";
import { displayError, displayFileTree, showHelp, showVersion, validateOptions, type CliOptions } from "./cli-utils.js";
import { TemplateWatcher } from "./watcher.js";
import * as fs from "fs/promises";
import * as path from "path";

async function main() {
  const argv = minimist(process.argv.slice(2), {
    alias: {
      h: "help",
      i: "input",
      o: "output",
      g: "generator",
      e: "ext",
      I: "include-prefix",
      c: "clean",
      w: "watch",
      v: "verbose",
    },
    string: ["input", "output", "generator", "ext", "include-prefix", "debounce"],
    boolean: ["help", "version", "clean", "preserve-code-ref", "watch", "verbose"],
  });

  const options: CliOptions = {
    help: argv.help,
    version: argv.version,
    input: argv.input,
    output: argv.output,
    generator: argv.generator,
    ext: argv.ext,
    includePrefix: argv["include-prefix"],
    preserveCodeRef: argv["preserve-code-ref"],
    clean: argv.clean,
    watch: argv.watch,
    debounce: argv.debounce ? parseInt(argv.debounce, 10) : undefined,
    verbose: argv.verbose,
  };

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.version) {
    await showVersion();
    process.exit(0);
  }

  // Validate options
  const validationErrors = validateOptions(options);
  if (validationErrors.length > 0) {
    for (const error of validationErrors) {
      console.error(`Error: ${error}`);
    }
    console.error("Use --help for usage information");
    process.exit(1);
  }

  // Set defaults
  const generator = options.generator || "static-cpp-literal";
  const templateExt = options.ext || ".wgsl.template";
  const debounce = options.debounce || 300;

  try {
    // Check if source directory exists
    const srcPath = path.resolve(options.input!);
    const outPath = path.resolve(options.output!);

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

    // Handle watch mode
    if (options.watch) {
      const watcher = new TemplateWatcher({
        sourceDir: srcPath,
        outDir: outPath,
        templateExt,
        generator,
        includePathPrefix: options.includePrefix,
        preserveCodeReference: options.preserveCodeRef,
        debounce,
        verbose: options.verbose || false,
      });

      // Set up graceful shutdown
      process.on("SIGINT", async () => {
        console.log("\n🛑 Received interrupt signal...");
        await watcher.stop();
        process.exit(0);
      });

      process.on("SIGTERM", async () => {
        console.log("\n🛑 Received termination signal...");
        await watcher.stop();
        process.exit(0);
      });

      await watcher.start();
      return; // Keep the process running
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
    if (options.preserveCodeRef) {
      console.log(`  Preserve code references: enabled`);
    }
    if (options.clean) {
      console.log(`  Clean directory: enabled`);
    }

    // Start timing
    const startTime = Date.now();

    // Run the build
    const result = await build({
      sourceDir: srcPath,
      outDir: outPath,
      templateExt,
      generator,
      includePathPrefix: options.includePrefix,
      preserveCodeReference: options.preserveCodeRef,
    });

    // Calculate generation time
    const generationTimeMs = Date.now() - startTime;

    if (result.status === "success") {
      console.log("✅ Build completed successfully!");
      if (result.result?.files) {
        const timeStr = ` in ${generationTimeMs}ms`;
        console.log(`📁 Generated ${result.result.files.templates.size} file(s)${timeStr}:`);

        // Convert TemplateRepository<string> to the format expected by displayFileTree
        const fileMap = new Map<string, { error?: string; size: number }>();
        for (const [filePath, content] of result.result.files.templates) {
          fileMap.set(filePath, {
            size: Buffer.byteLength(content, "utf8"),
          });
        }
        displayFileTree(fileMap);
      }
    } else {
      // Build result contains an error
      if (result.error instanceof Error) {
        // Use the enhanced error display
        await displayError(result.error, options.verbose || false, result.result);
      } else {
        // Fallback to basic error message display
        console.error("❌ Build failed:");
        console.error(result.error || "Unknown error");
      }
      process.exit(1);
    }
  } catch (error) {
    await displayError(error instanceof Error ? error : new Error(String(error)), options.verbose || false);
    process.exit(1);
  }
}

main().catch(async (error) => {
  await displayError(error instanceof Error ? error : new Error(String(error)), false);
  process.exit(1);
});
