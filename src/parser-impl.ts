import type { Parser, TemplateRepository, TemplatePass1, TemplatePass0, ParsedLine } from "./types.js";
import { WgslTemplateParseError } from "./errors.js";

type ParseState = Map<
  string,
  {
    lines: readonly ParsedLine[];
    includeProcessed: boolean;
  }
>;

/**
 * Parses raw content of a template file and remove comments.
 *
 * This function removes both single-line and multi-line comments
 * while preserving the original line structure. Empty lines after comment removal
 * are preserved to maintain line numbers for error reporting.
 */
function parseComments(filePath: string, raw: readonly string[]): string[] {
  const rawWithoutComments: string[] = [];
  let inMultiLineComment = false;

  for (const line of raw) {
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
        else if (i < line.length - 1 && line[i] === "/" && line[i + 1] === "*") {
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

  if (inMultiLineComment) {
    throw new WgslTemplateParseError("Unterminated multi-line comment detected in template", "comment-removal", {
      filePath,
    });
  }

  return rawWithoutComments;
}

/**
 * Parses #include preprocessor directives.
 *
 * @param includeStack represents the stack of currently processed includes
 * @param parseState a map that stores the state of each file being parsed
 */
function parsePreprocessorIncludeDirectives(includeStack: string[], parseState: ParseState): void {
  const lines: ParsedLine[] = [];

  const currentFile = includeStack[includeStack.length - 1];
  const currentState = parseState.get(currentFile);

  if (!currentState) {
    throw new WgslTemplateParseError(`File "${currentFile}" not found in parse state`, "include-resolution", {
      filePath: currentFile,
    });
  }

  if (currentState.includeProcessed) {
    // If the current file has already been processed, return its lines
    return;
  }

  for (let lineNumber = 0; lineNumber < currentState.lines.length; lineNumber++) {
    const parsedLine = currentState.lines[lineNumber];
    const line = parsedLine.line;
    // Process each line and extract include directives
    const includeMatch = line.match(/^#include\s+(.+)$/);
    if (includeMatch) {
      const includeParam = includeMatch[1].trim();
      if (!(includeParam.startsWith('"') && includeParam.endsWith('"'))) {
        throw new WgslTemplateParseError(
          `Invalid #include directive in file ${currentFile} at line ${
            lineNumber + 1
          }: file path must be enclosed in double quotes`,
          "syntax-error",
          { filePath: currentFile, lineNumber: lineNumber + 1 }
        );
      }
      const includePath = includeParam.slice(1, -1); // Remove quotes
      if (includeStack.includes(includePath)) {
        throw new WgslTemplateParseError(
          `Circular #include detected in file ${currentFile} at line ${
            lineNumber + 1
          }: ${includePath} is already included`,
          "include-circular",
          { filePath: currentFile, lineNumber: lineNumber + 1 }
        );
      }
      if (!parseState.has(includePath)) {
        throw new WgslTemplateParseError(
          `File "${includePath}" not found in parse state for #include directive in file "${currentFile}" at line ${
            lineNumber + 1
          }`,
          "include-not-found",
          { filePath: currentFile, lineNumber: lineNumber + 1 }
        );
      }
      includeStack.push(includePath);
      parsePreprocessorIncludeDirectives(includeStack, parseState);
      lines.push(...parseState.get(includePath)!.lines);
      includeStack.pop();
    } else {
      // If no include directive, just add the original line to the result
      // (preserve comments in the output)
      lines.push(parsedLine);
    }
  }

  currentState.includeProcessed = true;
  currentState.lines = lines;
}

/**
 * Parses #define macro directives and applies macro substitutions.
 *
 * @param lines Array of lines to process
 * @param fileName Name of the file being processed (for error reporting)
 * @returns Array of lines with macros defined and substituted
 */
function parseMacroDirectives(lines: ParsedLine[], fileName: string): ParsedLine[] {
  const macros = new Map<string, string>();
  const processedLines: ParsedLine[] = [];

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const parsedLine = lines[lineNumber];
    let line = parsedLine.line;

    // Check for malformed #define directives
    if (line.trim().startsWith("#define ")) {
      const defineMatch = line.match(/^#define\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(.+)$/);
      if (!defineMatch) {
        // Check specific error cases
        const emptyValueMatch = line.match(/^#define\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
        if (emptyValueMatch) {
          throw new WgslTemplateParseError(
            `Invalid macro definition in file ${fileName} at line ${
              lineNumber + 1
            }: macro "${emptyValueMatch[1]}" has no value`,
            "syntax-error",
            { filePath: fileName, lineNumber: lineNumber + 1 }
          );
        }

        const invalidNameMatch = line.match(/^#define\s+(\S+)(?:\s+(.+))?$/);
        if (invalidNameMatch) {
          throw new WgslTemplateParseError(
            `Invalid macro definition in file ${fileName} at line ${
              lineNumber + 1
            }: invalid macro name "${invalidNameMatch[1]}" (must start with letter or underscore, contain only letters, numbers, and underscores)`,
            "syntax-error",
            { filePath: fileName, lineNumber: lineNumber + 1 }
          );
        }

        throw new WgslTemplateParseError(
          `Invalid macro definition in file ${fileName} at line ${lineNumber + 1}: malformed #define directive`,
          "syntax-error",
          { filePath: fileName, lineNumber: lineNumber + 1 }
        );
      }

      // Valid #define directive
      const macroName = defineMatch[1];
      const macroValue = defineMatch[2].trim();

      // Check for whitespace-only value
      if (macroValue === "") {
        throw new WgslTemplateParseError(
          `Invalid macro definition in file ${fileName} at line ${
            lineNumber + 1
          }: macro "${macroName}" has empty value (whitespace only)`,
          "syntax-error",
          { filePath: fileName, lineNumber: lineNumber + 1 }
        );
      }

      // Check for duplicate macro definition
      if (macros.has(macroName)) {
        throw new WgslTemplateParseError(
          `Duplicate macro definition in file ${fileName} at line ${lineNumber + 1}: "${macroName}" is already defined`,
          "define-expansion",
          { filePath: fileName, lineNumber: lineNumber + 1 }
        );
      }

      // Check for direct circular reference (macro referencing itself)
      const directCircularRegex = new RegExp(`\\b${macroName}\\b`);
      if (directCircularRegex.test(macroValue)) {
        throw new WgslTemplateParseError(
          `Circular macro reference in file ${fileName} at line ${
            lineNumber + 1
          }: macro "${macroName}" references itself`,
          "define-expansion",
          { filePath: fileName, lineNumber: lineNumber + 1 }
        );
      }

      // Apply existing macro substitutions to the new macro value
      // Track which macros we're expanding to detect circular references
      let expandedValue = macroValue;
      for (const [existingMacroName, existingMacroValue] of macros) {
        const regex = new RegExp(`\\b${existingMacroName}\\b`, "g");
        if (regex.test(expandedValue)) {
          // Check if the existing macro value contains the current macro name (circular reference)
          const circularRegex = new RegExp(`\\b${macroName}\\b`);
          if (circularRegex.test(existingMacroValue)) {
            throw new WgslTemplateParseError(
              `Circular macro reference in file ${fileName} at line ${
                lineNumber + 1
              }: macro "${macroName}" creates circular dependency with "${existingMacroName}"`,
              "define-expansion",
              { filePath: fileName, lineNumber: lineNumber + 1 }
            );
          }
          expandedValue = expandedValue.replace(regex, existingMacroValue);
        }
      }

      macros.set(macroName, expandedValue);

      // Clear the line since it's a macro definition
      line = "";
    } else {
      // Apply macro substitutions to the current line
      for (const [macroName, macroValue] of macros) {
        // Use word boundaries to ensure we only replace whole identifiers
        const regex = new RegExp(`\\b${macroName}\\b`, "g");
        line = line.replace(regex, macroValue);
      }
    }

    processedLines.push({
      line,
      codeReference: parsedLine.codeReference,
    });
  }

  return processedLines;
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
   */ parse(repo: TemplateRepository<TemplatePass0>): TemplateRepository<TemplatePass1> {
    const pass1Repo = new Map<string, TemplatePass1>();

    const parseState: ParseState = new Map();

    // STEP.1. Parse comments.
    for (const [templateKey, template] of repo.templates) {
      const parsedLines = parseComments(templateKey, template.raw);

      parseState.set(templateKey, {
        lines: parsedLines.map((line, index) => ({
          line,
          codeReference: {
            filePath: templateKey,
            lineNumber: index + 1, // Line numbers are 1-based
          },
        })),
        includeProcessed: false,
      });
    }

    // STEP.2. Parse #include preprocessor directives.
    for (const [templateKey, template] of repo.templates) {
      parsePreprocessorIncludeDirectives([templateKey], parseState);

      pass1Repo.set(templateKey, {
        filePath: template.filePath,
        raw: template.raw,
        pass1: parseState.get(templateKey)!.lines,
      });
    }

    // STEP.3. Parse #define macro directives and apply substitutions.
    for (const [templateKey, template] of pass1Repo) {
      const processedLines = parseMacroDirectives([...template.pass1], templateKey);
      pass1Repo.set(templateKey, {
        filePath: template.filePath,
        raw: template.raw,
        pass1: processedLines,
      });
    }

    return {
      basePath: repo.basePath,
      templates: pass1Repo,
    };
  },
};
