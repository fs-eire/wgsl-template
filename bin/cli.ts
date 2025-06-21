#!/usr/bin/env node

import * as fs from "fs/promises";
import * as path from "path";
import minimist from "minimist";
import {
  build,
  WgslTemplateError,
  WgslTemplateLoadError,
  WgslTemplateParseError,
  WgslTemplateGenerateError,
  WgslTemplateBuildError,
} from "../src/index.js";
import type { TemplateRepository, TemplatePass0, TemplatePass1, TemplatePass2 } from "../src/types.js";

/**
 * Display source code context around an error line using the appropriate pipeline result
 */
async function displaySourceContext(
  filePath: string,
  lineNumber: number,
  contextLines = 3,
  result?: {
    pass0?: TemplateRepository<TemplatePass0>;
    pass1?: TemplateRepository<TemplatePass1>;
    pass2?: TemplateRepository<TemplatePass2>;
    files?: TemplateRepository<string>;
  },
  errorType?: string,
  debug = false
): Promise<void> {
  try {
    let content: string | undefined;

    // Determine which result to use based on error type
    if (errorType === "load" && result?.pass0) {
      // For loading errors, use pass0 (raw file content)
      const template = result.pass0.templates.get(filePath);
      content = template?.raw.join("\n");
    } else if (errorType === "parse" && result?.pass0) {
      // For parser errors, use pass0 (original content before parsing)
      const template = result.pass0.templates.get(filePath);
      content = template?.raw.join("\n");
    } else if (errorType === "generate" && result?.pass1) {
      // For generator errors, use pass1 (parsed content before generation)
      const template = result.pass1.templates.get(filePath);
      content = template?.pass1.join("\n");
    } else if (errorType === "build" && result?.pass2) {
      // For build errors, use pass2 (generated content before build)
      const template = result.pass2.templates.get(filePath);
      content = template?.generateResult.code;
    }

    // If we don't have content from the pipeline, skip showing context
    if (!content) {
      console.error(`   (Source content not available in pipeline results)`);
      return;
    }

    const lines = content.split(/\r?\n/);

    // In debug mode, show the entire file; otherwise show limited context
    const startLine = debug ? 0 : Math.max(0, lineNumber - contextLines - 1);
    const endLine = debug ? lines.length - 1 : Math.min(lines.length - 1, lineNumber + contextLines - 1);

    console.error(debug ? "\n📍 Complete Source Content:" : "\n📍 Source Context:");

    for (let i = startLine; i <= endLine; i++) {
      const currentLineNumber = i + 1;
      const isErrorLine = currentLineNumber === lineNumber;
      const lineNumberStr = currentLineNumber.toString().padStart(4, " ");

      if (isErrorLine) {
        console.error(`❌ ${lineNumberStr} | ${lines[i]}`);
      } else {
        console.error(`   ${lineNumberStr} | ${lines[i]}`);
      }
    }
  } catch (error) {
    console.error(`   (Unable to display source context: ${error instanceof Error ? error.message : String(error)})`);
  }
}

/**
 * Display enhanced error information with source context
 */
async function displayError(
  error: Error,
  debug: boolean,
  result?: {
    pass0?: TemplateRepository<TemplatePass0>;
    pass1?: TemplateRepository<TemplatePass1>;
    pass2?: TemplateRepository<TemplatePass2>;
    files?: TemplateRepository<string>;
  }
): Promise<void> {
  console.error("❌ Build failed:");

  // Debug: Show error type and properties
  if (debug) {
    console.error(`🔍 Debug: Error type: ${error.constructor.name}`);
    console.error(`🔍 Debug: Error instanceof WgslTemplateError: ${error instanceof WgslTemplateError}`);
    if (error instanceof WgslTemplateError && (error.filePath || error.lineNumber)) {
      console.error(`🔍 Debug: filePath: ${error.filePath}, lineNumber: ${error.lineNumber}`);
    }
  }

  if (error instanceof WgslTemplateLoadError) {
    console.error(`🗂️  Loading Error: ${error.message}`);
    if (error.filePath) {
      console.error(`   File: ${error.filePath}`);
    }
    if (error.lineNumber) {
      console.error(`   Line: ${error.lineNumber}`);
    }

    // Show source context if we have file path and line number
    if (error.filePath && error.lineNumber) {
      await displaySourceContext(error.filePath, error.lineNumber, 3, result, "load", debug);
    }
  } else if (error instanceof WgslTemplateParseError) {
    console.error(`📝 Parse Error: ${error.message}`);
    if (error.filePath) {
      console.error(`   File: ${error.filePath}`);
    }
    if (error.lineNumber) {
      console.error(`   Line: ${error.lineNumber}`);
    }

    // Show source context if we have file path and line number
    if (error.filePath && error.lineNumber) {
      await displaySourceContext(error.filePath, error.lineNumber, 3, result, "parse", debug);
    }
  } else if (error instanceof WgslTemplateGenerateError) {
    console.error(`⚙️  Generation Error: ${error.message}`);
    if (error.filePath) {
      console.error(`   File: ${error.filePath}`);
    }
    if (error.lineNumber) {
      console.error(`   Line: ${error.lineNumber}`);
    }

    // Show source context if we have file path and line number
    if (error.filePath && error.lineNumber) {
      await displaySourceContext(error.filePath, error.lineNumber, 3, result, "generate", debug);
    }
  } else if (error instanceof WgslTemplateBuildError) {
    console.error(`🏗️  Build Error: ${error.message}`);
    if (error.filePath) {
      console.error(`   File: ${error.filePath}`);
    }
  } else if (error instanceof WgslTemplateError) {
    // Generic WGSL template error
    console.error(`🔧 Template Error: ${error.message}`);
    if (error.filePath) {
      console.error(`   File: ${error.filePath}`);
    }
    if (error.lineNumber) {
      console.error(`   Line: ${error.lineNumber}`);
    }

    // Show source context if we have file path and line number
    if (error.filePath && error.lineNumber) {
      await displaySourceContext(error.filePath, error.lineNumber, 3, result, "parse", debug);
    }
  } else {
    // Generic error
    console.error(`💥 Unexpected Error: ${error.message}`);

    // Show stack trace in debug mode
    if (debug) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
  }

  // Show cause chain if available
  if (error.cause instanceof Error) {
    console.error(`\n🔗 Caused by: ${error.cause.message}`);
  }

  console.error("\n💡 For more help:");
  console.error("   • Use --debug for detailed error information");
  console.error("   • Check the documentation for template syntax");
  console.error("   • Verify all file paths and permissions");
}

/**
 * Format file size in a human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Tree node structure for file display
 */
type TreeNode =
  | {
      type: "file";
      size: number;
      error?: string;
    }
  | {
      type: "directory";
      children: Record<string, TreeNode>;
    };

/**
 * Build a file tree structure from a flat map of files
 */
function buildFileTree(files: Map<string, { error?: string; size: number }>): Record<string, TreeNode> {
  const tree: Record<string, TreeNode> = {};

  for (const [filePath, fileInfo] of files) {
    const parts = filePath.split(/[/\\]/);
    let current = tree;

    // Create directories
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = { type: "directory", children: {} };
      }
      if (current[part].type === "directory") {
        current = current[part].children;
      }
    }

    // Add file
    const fileName = parts[parts.length - 1];
    current[fileName] = {
      type: "file",
      size: fileInfo.size,
      error: fileInfo.error,
    };
  }

  return tree;
}

/**
 * Display a file tree with sizes and errors
 */
function displayFileTree(files: Map<string, { error?: string; size: number }>): void {
  const tree = buildFileTree(files);

  function printTree(node: TreeNode | Record<string, TreeNode>, prefix = "", isLast = true, name = ""): void {
    if (typeof node === "object" && "type" in node) {
      if (node.type === "file") {
        const sizeStr = formatFileSize(node.size);
        const errorStr = node.error ? ` ❌ ${node.error}` : "";
        console.log(`${prefix}${isLast ? "└── " : "├── "}📄 ${name} (${sizeStr})${errorStr}`);
        return;
      } else if (node.type === "directory") {
        if (name) {
          console.log(`${prefix}${isLast ? "└── " : "├── "}📁 ${name}/`);
        }
        const entries = Object.entries(node.children);
        entries.forEach(([key, value], index) => {
          const isLastEntry = index === entries.length - 1;
          const newPrefix = name ? prefix + (isLast ? "    " : "│   ") : prefix;
          printTree(value, newPrefix, isLastEntry, key);
        });
        return;
      }
    }

    // Handle root level
    const entries = Object.entries(node as Record<string, TreeNode>);
    entries.forEach(([key, value], index) => {
      const isLastEntry = index === entries.length - 1;
      printTree(value, prefix, isLastEntry, key);
    });
  }

  printTree(tree);
}

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
  --debug, -d                    Enable debug output for detailed error information
  --help, -h                     Show this help message
  --version, -v                  Show version information

Examples:
  npx wgsl-gen --input ./templates --output ./generated
  npx wgsl-gen --input ./shaders --output ./cpp --generator static-cpp
  npx wgsl-gen -i ./src -o ./build --include-prefix "myproject/"
  npx wgsl-gen -i ./templates -o ./generated --clean --debug
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
      d: "debug",
    },
    string: ["input", "output", "generator", "ext", "include-prefix"],
    boolean: ["help", "version", "clean", "debug"],
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
    debug: argv.debug,
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

    // Start timing
    const startTime = Date.now();

    // Run the build
    const result = await build({
      sourceDir: srcPath,
      outDir: outPath,
      templateExt,
      generator,
      includePathPrefix: options.includePrefix,
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
        await displayError(result.error, options.debug, result.result);
      } else {
        // Fallback to basic error message display
        console.error("❌ Build failed:");
        console.error(result.error || "Unknown error");
      }
      process.exit(1);
    }
  } catch (error) {
    await displayError(error instanceof Error ? error : new Error(String(error)), options.debug);
    process.exit(1);
  }
}

main().catch(async (error) => {
  await displayError(error instanceof Error ? error : new Error(String(error)), false);
  process.exit(1);
});
