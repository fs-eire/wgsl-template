import * as fs from "fs/promises";
import * as path from "path";
import {
  WgslTemplateError,
  WgslTemplateLoadError,
  WgslTemplateParseError,
  WgslTemplateGenerateError,
  WgslTemplateBuildError,
} from "../src/index.js";
import type { TemplateRepository, TemplatePass0, TemplatePass1, TemplatePass2 } from "../src/types.js";

/**
 * Common CLI options interface
 */
export interface CliOptions {
  help?: boolean;
  version?: boolean;
  input?: string | string[]; // Now supports multiple inputs
  output?: string;
  generator?: string;
  ext?: string;
  includePrefix?: string;
  preserveCodeRef?: boolean;
  clean?: boolean;
  watch?: boolean;
  debounce?: number;
  verbose?: boolean;
}

/**
 * Display source code context around an error line using the appropriate pipeline result
 */
export async function displaySourceContext(
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
  verbose = false
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

    const lines = content.split(/\r?\n/); // In verbose mode, show the entire file; otherwise show limited context
    const startLine = verbose ? 0 : Math.max(0, lineNumber - contextLines - 1);
    const endLine = verbose ? lines.length - 1 : Math.min(lines.length - 1, lineNumber + contextLines - 1);

    console.error(verbose ? "\n📍 Complete Source Content:" : "\n📍 Source Context:");

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
export async function displayError(
  error: Error,
  verbose: boolean,
  result?: {
    pass0?: TemplateRepository<TemplatePass0>;
    pass1?: TemplateRepository<TemplatePass1>;
    pass2?: TemplateRepository<TemplatePass2>;
    files?: TemplateRepository<string>;
  }
): Promise<void> {
  console.error("❌ Build failed:");
  // Verbose: Show error type and properties
  if (verbose) {
    console.error(`\n🐛 Verbose Information:`);
    console.error(`   Error type: ${error.constructor.name}`);
    console.error(`   Error name: ${error.name}`);
    if (error.stack) {
      console.error(`   Stack trace:\n${error.stack}`);
    }
    console.error(`   Error properties:`);
    for (const [key, value] of Object.entries(error)) {
      if (key !== "name" && key !== "message" && key !== "stack") {
        console.error(`     ${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  // Show specific error information based on error type
  if (error instanceof WgslTemplateLoadError) {
    console.error(`🗂️  Loading Error: ${error.message}`);
    if (error.filePath) {
      console.error(`   File: ${error.filePath}`);
    }
    if (error.lineNumber) {
      console.error(`   Line: ${error.lineNumber}`);
    } // Show source context if we have file path and line number
    if (error.filePath && error.lineNumber) {
      await displaySourceContext(error.filePath, error.lineNumber, 3, result, "load", verbose);
    }
  } else if (error instanceof WgslTemplateParseError) {
    console.error(`📝 Parse Error: ${error.message}`);
    if (error.filePath) {
      console.error(`   File: ${error.filePath}`);
    }
    if (error.lineNumber) {
      console.error(`   Line: ${error.lineNumber}`);
    } // Show source context if we have file path and line number
    if (error.filePath && error.lineNumber) {
      await displaySourceContext(error.filePath, error.lineNumber, 3, result, "parse", verbose);
    }
  } else if (error instanceof WgslTemplateGenerateError) {
    console.error(`⚙️  Generation Error: ${error.message}`);
    if (error.filePath) {
      console.error(`   File: ${error.filePath}`);
    }
    if (error.lineNumber) {
      console.error(`   Line: ${error.lineNumber}`);
    } // Show source context if we have file path and line number
    if (error.filePath && error.lineNumber) {
      await displaySourceContext(error.filePath, error.lineNumber, 3, result, "generate", verbose);
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
  } else {
    // Generic error
    console.error(`💥 Unexpected Error: ${error.message}`);
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return unitIndex === 0 ? `${size} ${units[unitIndex]}` : `${size.toFixed(1)} ${units[unitIndex]}`;
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
export function buildFileTree(files: Map<string, { error?: string; size: number }>): Record<string, TreeNode> {
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
export function displayFileTree(files: Map<string, { error?: string; size: number }>): void {
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

/**
 * Show help message
 */
export function showHelp(): void {
  console.log(`
WGSL Template Generator CLI

Usage:
  npx wgsl-gen [options]

Options:
  --input, -i <dir>[|@<alias>]   Source directory containing WGSL template files (required)
                                 Can be specified multiple times for multiple directories
                                 Optional alias: "dir|@alias" to prefix template names
  --output, -o <dir>             Output directory for generated files (required)
  --generator <n>                Code generator to use (default: "static-cpp-literal")
                                 Available: "dynamic", "static-cpp", "static-cpp-literal"
  --ext <extension>              Template file extension (default: ".wgsl.template")
  --include-prefix, -I <prefix>  Include path prefix for generated headers
  --preserve-code-ref            Preserve code references in generated output
  --clean, -c                    Clean output directory before building
  --watch, -w                    Watch for file changes and rebuild automatically
  --debounce <ms>                Debounce delay for watch mode in milliseconds (default: 300)
  --verbose, -v                  Enable verbose output for detailed error information and file changes
  --help, -h                     Show this help message
  --version                      Show version information

Examples:
  npx wgsl-gen --input ./templates --output ./generated
  npx wgsl-gen --input ./shaders --output ./cpp --generator static-cpp
  npx wgsl-gen -i ./src -o ./build --include-prefix "myproject/"
  npx wgsl-gen -i ./templates -o ./generated --clean --verbose
  npx wgsl-gen -i ./templates -o ./generated --watch --debounce 500
  npx wgsl-gen -i ./common -i ./effects|@fx --output ./generated
  npx wgsl-gen -i ./base -i ./shaders|@shaders -i ./utils|@utils -o ./cpp
  npx wgsl-gen -i "C:\\Projects\\templates" -i "D:\\shared\\effects|@fx" -o ./build
`);
}

/**
 * Show version information
 */
export async function showVersion(): Promise<void> {
  try {
    // Read version from package.json
    const packageJsonPath = path.join(import.meta.dirname, "..", "package.json");
    const content = await fs.readFile(packageJsonPath, "utf8");
    const packageJson = JSON.parse(content);
    console.log(`WGSL Template Generator v${packageJson.version}`);
  } catch {
    console.log("WGSL Template Generator (version unknown)");
  }
}

/**
 * Validate CLI options
 */
export function validateOptions(options: CliOptions): string[] {
  const errors: string[] = [];

  if (!options.input) {
    errors.push("--input option is required");
  }

  if (!options.output) {
    errors.push("--output option is required");
  }
  // Validate watch-specific options
  if (options.debounce !== undefined && !options.watch) {
    errors.push("--debounce option is only valid in watch mode (--watch)");
  }

  if (options.debounce !== undefined && (options.debounce < 0 || !Number.isInteger(options.debounce))) {
    errors.push("--debounce must be a non-negative integer");
  }

  return errors;
}

/**
 * Parse input directories with optional aliases from CLI arguments
 * Format: "dir1" or "dir1|@alias1" or ["dir1", "dir2|@alias2"]
 */
export function parseInputDirectories(input: string | string[]): ({ path: string; alias?: string } | string)[] {
  const inputs = Array.isArray(input) ? input : [input];

  return inputs.map((inputStr) => {
    const pipeIndex = inputStr.indexOf("|");
    if (pipeIndex === -1) {
      // No alias specified
      return inputStr;
    } else {
      // Alias specified
      const dirPath = inputStr.substring(0, pipeIndex);
      const alias = inputStr.substring(pipeIndex + 1);

      if (!alias.startsWith("@")) {
        throw new Error(`Invalid alias format: ${alias}. Aliases must start with '@'. Example: "dir|@alias"`);
      }

      if (dirPath.length === 0) {
        throw new Error(`Invalid input format: ${inputStr}. Directory path cannot be empty. Example: "dir|@alias"`);
      }

      return {
        path: dirPath,
        alias: alias,
      };
    }
  });
}
