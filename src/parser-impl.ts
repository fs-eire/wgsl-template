import type { Parser } from "./types/parser";
import type { TemplateRepository } from "./types/loader";
import type { TemplatePass1, TemplatePass0 } from "./types/template";

/**
 * Parses raw content of a template file and remove comments.
 *
 * This function removes both single-line and multi-line comments
 * while preserving the original line structure. Empty lines after comment removal
 * are preserved to maintain line numbers for error reporting.
 */
function parseComments(raw: readonly string[]): string[] {
  const rawWithoutComments: string[] = [];
  let inMultiLineComment = false;

  for (let lineNumber = 0; lineNumber < raw.length; lineNumber++) {
    const line = raw[lineNumber];
    let processedLine = "";
    let i = 0;

    while (i < line.length) {
      if (inMultiLineComment) {
        // Look for end of multi-line comment
        if (i < line.length - 1 && line[i] === "*" && line[i + 1] === "/") {
          inMultiLineComment = false;
          i += 2; // Skip '*/'
        } else {
          i++;
        }
      } else {
        // Check for start of single-line comment
        if (i < line.length - 1 && line[i] === "/" && line[i + 1] === "/") {
          // Rest of line is a comment, stop processing
          break;
        }
        // Check for start of multi-line comment
        else if (
          i < line.length - 1 &&
          line[i] === "/" &&
          line[i + 1] === "*"
        ) {
          inMultiLineComment = true;
          i += 2; // Skip '/*'
        } else {
          // Regular character, add to processed line
          processedLine += line[i];
          i++;
        }
      }
    }

    // Always add the line (even if empty) to preserve line numbers
    rawWithoutComments.push(processedLine.trimEnd());
  }

  return rawWithoutComments;
}

/**
 * Parses #include preprocessor directives.
 *
 * @param includeStack represents the stack of currently processed includes
 * @param parseState a map that stores the state of each file being parsed
 */
function parsePreprocessorIncludeDirectives(
  includeStack: string[],
  parseState: Map<
    string,
    {
      lines: string[];
      includeProcessed: boolean;
    }
  >
): void {
  const lines: string[] = [];

  const currentFile = includeStack[includeStack.length - 1];
  const currentState = parseState.get(currentFile);

  if (!currentState) {
    throw new Error(`File ${currentFile} not found in parse state`);
  }

  if (currentState.includeProcessed) {
    // If the current file has already been processed, return its lines
    return;
  }

  for (
    let lineNumber = 0;
    lineNumber < currentState.lines.length;
    lineNumber++
  ) {
    const line = currentState.lines[lineNumber];
    // Process each line and extract include directives
    const includeMatch = line.match(/^#include\s+(.+)$/);
    if (includeMatch) {
      const includeParam = includeMatch[1].trim();
      if (!(includeParam.startsWith('"') && includeParam.endsWith('"'))) {
        throw new Error(
          `Invalid #include directive in file ${currentFile} at line ${
            lineNumber + 1
          }: file path must be enclosed in double quotes`
        );
      }
      const includePath = includeParam.slice(1, -1); // Remove quotes
      if (includeStack.includes(includePath)) {
        throw new Error(
          `Circular #include detected in file ${currentFile} at line ${
            lineNumber + 1
          }: ${includePath} is already included`
        );
      }
      if (!parseState.has(includePath)) {
        throw new Error(
          `File ${includePath} not found in parse state for #include directive in file ${currentFile} at line ${
            lineNumber + 1
          }`
        );
      }
      includeStack.push(includePath);
      parsePreprocessorIncludeDirectives(includeStack, parseState);
      lines.push(...parseState.get(includePath)!.lines);
      includeStack.pop();
    } else {
      // If no include directive, just add the line to the result
      lines.push(line);
    }
  }

  currentState.includeProcessed = true;
  currentState.lines = lines;
}

/**
 * TemplateParser is an implementation of the Parser interface that parses
 * WGSL template files and converts raw content into structured segments.
 * It identifies preprocessor directives, comments, and raw text segments.
 */
export const parser: Parser = {
  /**
   * Parses a template file and converts its raw content into structured segments.
   *
   * @param filePath The path to the template file to parse
   * @param repo The repository containing raw template data
   * @returns A new repository with parsed segments added to the specified template
   */ parse(
    repo: TemplateRepository<TemplatePass0>
  ): TemplateRepository<TemplatePass1> {
    const pass1Repo: Map<string, TemplatePass1> = new Map();

    const parseState: Map<
      string,
      {
        lines: string[];
        includeProcessed: boolean;
      }
    > = new Map();

    // STEP.1. Parse comments. Segments now contains:
    //         - Raw segments
    //         - Comment segments
    for (const [templateKey, template] of repo.templates) {
      const rawWithoutComments = parseComments(template.raw);

      parseState.set(templateKey, {
        lines: rawWithoutComments,
        includeProcessed: false,
      });
    }

    // STEP.2. Parse #include preprocessor directives.
    for (const [templateKey, template] of repo.templates) {
      parsePreprocessorIncludeDirectives([templateKey], parseState);

      pass1Repo.set(templateKey, {
        filePath: template.filePath,
        pass1: parseState.get(templateKey)!.lines,
      });
    }

    return {
      basePath: repo.basePath,
      templates: pass1Repo,
    };
  },
};
