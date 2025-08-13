import { createParamPattern, DEFAULT_PATTERNS, lookupPattern } from "./code-pattern-impl.js";
import { WgslTemplateGenerateError } from "./errors.js";

import type {
  CodeGenerator,
  CodeSegment,
  CodeSegmentArg,
  CodePattern,
  CodePatternArgType,
  Generator,
  GenerateResult,
  TemplateRepository,
  TemplatePass2,
  TemplatePass1,
  GenerateOptions,
  ParsedLine,
} from "./types.js";

interface FunctionCallState {
  readonly caller?: string; // Optional caller name, if this is a method call
  readonly name: string;
  readonly parenthesesState: number;
  readonly params: CodeSegment[][];
  readonly argTypes?: readonly CodePatternArgType[]; // Types for each argument

  currentParam: CodeSegment[];
}

interface GeneratorState {
  readonly repo: TemplateRepository<TemplatePass1>;
  readonly pass1: readonly ParsedLine[];
  readonly codeGenerator: CodeGenerator;

  filePath: string;
  currentLine: number;
  currentColumn: number;

  preprocessIfStack: [
    type: "if" | "elif" | "else" | "endif",
    initialParenthesesState: number,
    initialBracketState: number,
    previousBlockParenthesesState: number | null,
    previousBlockBracketState: number | null,
  ][];
  patterns: CodePattern[];

  currentFunctionCall: FunctionCallState[];
  currentParenthesesState: number; // 0: no parentheses, >0: nested parentheses count
  mainFunction: "not-started" | "started" | "ended"; // tracks the main function context
  currentBracketState: number; // 0: no brackets, >0: nested brackets count

  result: CodeSegment[];
  usedParams: Map<string, NonNullable<CodePattern["paramType"]>>; // name -> type
  usedVariables: Map<string, NonNullable<CodePattern["variableType"]>>; // name -> type
}

/**
 * Merges adjacent segments of the same type (raw or code) to reduce the number of segments.
 * This optimization helps reduce the final emit output size.
 */
function mergeAdjacentSegments(segments: CodeSegment[]): CodeSegment[] {
  return segments.reduce((acc: CodeSegment[], segment: CodeSegment) => {
    if (
      acc.length > 0 &&
      acc[acc.length - 1].type === segment.type &&
      (segment.type === "raw" || segment.type === "code")
    ) {
      // Merge adjacent raw or code segments
      acc[acc.length - 1].content += segment.content;
    } else {
      // Otherwise, just push the segment
      acc.push(segment);
    }
    return acc;
  }, []);
}

function matchNextPattern(
  content: string,
  patterns: CodePattern[]
): {
  pattern: CodePattern;
  index: number;
  length: number;
  indices?: RegExpIndicesArray;
} | null {
  // Find the pattern that matches earliest in the content
  // example:
  // content is "abcdefg",
  // pattern1 is /cde/, pattern2 is /def/
  // the result should be pattern1 (matches at position 2, before pattern2 at position 3)

  let earliestMatch: {
    pattern: CodePattern;
    index: number;
    length: number;
    indices?: RegExpIndicesArray;
  } | null = null;

  for (const pattern of patterns) {
    const regex = typeof pattern.pattern === "string" ? new RegExp(pattern.pattern, "d") : pattern.pattern;
    const match = regex.exec(content);
    if (match && match.index !== undefined) {
      // If this is the first match, or if this match occurs earlier than the current earliest
      if (earliestMatch === null || match.index < earliestMatch.index) {
        earliestMatch = {
          pattern,
          index: match.index,
          length: match[0].length,
          indices: match.indices,
        };
      }
    }
  }

  return earliestMatch;
}

function generateImpl(generatorState: GeneratorState, options: GenerateOptions) {
  const { pass1, codeGenerator, preprocessIfStack, patterns, currentFunctionCall } = generatorState;

  let currentLine = generatorState.currentLine;
  let currentColumn = generatorState.currentColumn;
  let currentParenthesesState = generatorState.currentParenthesesState;
  let currentBracketState = generatorState.currentBracketState;

  let currentPreProcessorExpression: CodeSegment[] | null = null;

  const output = (type: "raw" | "code" | "expression", content: string) => {
    const segment: CodeSegment = { type, content };
    if (currentPreProcessorExpression !== null) {
      if (type === "raw") {
        throw new WgslTemplateGenerateError(
          `Raw content inside preprocessor expression at line ${currentLine + 1}, column ${currentColumn}`,
          "code-generation-failed",
          { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
        );
      } else if (type === "code" && content === "\n") {
        // If we are inside a preprocessor expression, EOL means we are done with this expression
      } else {
        segment.type = "raw"; // Convert to raw if we are inside a preprocessor expression
        currentPreProcessorExpression.push(segment);
      }
    } else {
      if (currentFunctionCall.length > 0) {
        if (type === "raw") {
          throw new WgslTemplateGenerateError(
            `Raw content inside function call at line ${currentLine + 1}, column ${currentColumn}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }
        // If we are inside a function call, append to the current parameter
        currentFunctionCall[currentFunctionCall.length - 1].currentParam.push(segment);
      } else {
        generatorState.result.push(segment);
      }
    }
  };

  let previousLineWasEmpty = true;
  for (let i = 0; i < pass1.length; i++) {
    const line = pass1[i].line;
    currentLine = i;
    currentColumn = 0;

    const processCurrentLine = () => {
      while (currentColumn < line.length) {
        const restLine = line.slice(currentColumn);
        const next = matchNextPattern(restLine, patterns);
        if (!next) break;

        const indices = next.indices;
        if (next.index > 0) {
          // Output the text before the matched pattern
          output("code", line.slice(currentColumn, currentColumn + next.index));
        }
        // Process the matched pattern
        const matched = line.slice(currentColumn + next.index, currentColumn + next.index + next.length);

        currentColumn += next.index + next.length;

        let caller: string | undefined;
        let name = matched;
        switch (next.pattern.type) {
          case "control":
            if (matched === "(") {
              currentParenthesesState++;
              output("code", "(");
            } else if (matched === ",") {
              if (
                currentFunctionCall.length > 0 &&
                currentFunctionCall[currentFunctionCall.length - 1].parenthesesState + 1 === currentParenthesesState
              ) {
                // End of current parameter, push it to params array
                const call = currentFunctionCall[currentFunctionCall.length - 1];
                if (call.currentParam.length === 0) {
                  throw new WgslTemplateGenerateError(
                    `Empty parameter at line ${currentLine + 1}, column ${currentColumn}`,
                    "parameter-missing",
                    { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
                  );
                }
                call.params.push(call.currentParam);
                call.currentParam = []; // Reset current parameter
              } else {
                // Just output the comma
                output("code", ",");
              }
            } else if (matched === ")") {
              currentParenthesesState--;
              if (currentParenthesesState < 0) {
                throw new WgslTemplateGenerateError(
                  `Unmatched closing parenthesis at line ${currentLine + 1}, column ${currentColumn}`,
                  "code-generation-failed",
                  { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
                );
              }
              if (
                currentFunctionCall.length > 0 &&
                currentFunctionCall[currentFunctionCall.length - 1].parenthesesState === currentParenthesesState
              ) {
                // End of function call
                const call = currentFunctionCall.pop();
                if (call) {
                  if (call.currentParam.length > 0) {
                    call.params.push(call.currentParam);
                  }
                  const params = call.params.map((p) => mergeAdjacentSegments(p));
                  // Clean up empty code segments in parameters
                  for (const param of params) {
                    if (param.at(-1)?.type === "code") {
                      if (param.at(-1)!.content.trim() === "") {
                        param.pop();
                      } else {
                        param.at(-1)!.content = param.at(-1)!.content.trimEnd();
                      }
                    }
                    if (param.at(0)?.type === "code") {
                      if (param.at(0)!.content.trim() === "") {
                        param.shift();
                      } else {
                        param.at(0)!.content = param.at(0)!.content.trimStart();
                      }
                    }
                  }

                  const codeSegmentArgs: CodeSegmentArg[] = params.map((param, index) => ({
                    type: call.argTypes?.[index] ?? "auto",
                    code: param,
                  }));

                  output(
                    "expression",
                    call.caller
                      ? codeGenerator.method(call.caller, call.name, codeSegmentArgs)
                      : codeGenerator.function(call.name, codeSegmentArgs)
                  );
                }
              } else {
                output("code", ")");
              }
            } else if (matched === "{") {
              currentBracketState++;
              output("code", "{");
            } else if (matched === "}") {
              currentBracketState--;
              if (currentBracketState < 0) {
                throw new WgslTemplateGenerateError(
                  `Unmatched closing bracket at line ${currentLine + 1}, column ${currentColumn}`,
                  "code-generation-failed",
                  { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
                );
              }
              if (currentBracketState === 0 && generatorState.mainFunction === "started") {
                // End of main function context
                output("raw", "MainFunctionEnd();\n");
                generatorState.mainFunction = "ended";
              } else {
                output("code", "}");
              }
            } else if (matched.includes("$MAIN")) {
              // Special case for $MAIN, which indicates the main function context
              if (generatorState.mainFunction !== "not-started") {
                throw new WgslTemplateGenerateError(
                  `Multiple main function start ($MAIN) detected at line ${currentLine + 1}, column ${currentColumn}`,
                  "code-generation-failed",
                  { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
                );
              }
              if (currentFunctionCall.length > 0) {
                throw new WgslTemplateGenerateError(
                  `$MAIN directive inside function call at line ${currentLine + 1}, column ${currentColumn}`,
                  "code-generation-failed",
                  { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
                );
              }
              if (currentParenthesesState !== 0) {
                throw new WgslTemplateGenerateError(
                  `$MAIN directive inside parentheses at line ${currentLine + 1}, column ${currentColumn}`,
                  "code-generation-failed",
                  { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
                );
              }
              if (currentBracketState !== 0) {
                throw new WgslTemplateGenerateError(
                  `$MAIN directive inside brackets at line ${currentLine + 1}, column ${currentColumn}`,
                  "code-generation-failed",
                  { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
                );
              }
              if (currentPreProcessorExpression !== null) {
                throw new WgslTemplateGenerateError(
                  `$MAIN directive inside preprocessor expression at line ${currentLine + 1}, column ${currentColumn}`,
                  "code-generation-failed",
                  { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
                );
              }

              generatorState.mainFunction = "started";
              output("raw", "MainFunctionStart();\n");
              currentBracketState = 1; // Start a new bracket context for the main function
            }
            break;
          case "param":
            generatorState.usedParams.set(matched, next.pattern.paramType || "int");
            output("expression", codeGenerator.param(matched));
            break;
          case "variable":
            let variableName = matched;
            if (next.pattern.replace && Array.isArray(next.pattern.replace) && next.pattern.replace[0]) {
              variableName = next.pattern.replace[0];
            }
            generatorState.usedVariables.set(variableName, next.pattern.variableType || "shader-variable");
            output("expression", codeGenerator.variable(variableName));
            break;
          case "method":
            if (next.pattern.replace && Array.isArray(next.pattern.replace) && next.pattern.replace[0]) {
              caller = next.pattern.replace[0];
            } else {
              caller = restLine.slice(indices![1][0], indices![1][1]);
            }
            // Track the object variable for method calls
            generatorState.usedVariables.set(caller, next.pattern.variableType || "shader-variable");
          case "function":
            // Handle function/method patterns
            if (next.pattern.replace && Array.isArray(next.pattern.replace) && next.pattern.replace[caller ? 1 : 0]) {
              name = next.pattern.replace[caller ? 1 : 0]!;
            } else {
              name = restLine.slice(indices![caller ? 2 : 1][0], indices![caller ? 2 : 1][1]);
            }

            currentFunctionCall.push({
              name,
              parenthesesState: currentParenthesesState,
              params: [],
              currentParam: [],
              caller,
              argTypes: next.pattern.argTypes,
            });

            currentParenthesesState++;
            break;
          case "property":
            if (next.pattern.replace && Array.isArray(next.pattern.replace) && next.pattern.replace[0]) {
              caller = next.pattern.replace[0];
            } else {
              caller = restLine.slice(indices![1][0], indices![1][1]);
            }
            // Track the object variable for property access
            generatorState.usedVariables.set(caller, next.pattern.variableType || "shader-variable");
            if (next.pattern.replace && Array.isArray(next.pattern.replace) && next.pattern.replace[1]) {
              name = next.pattern.replace[1]!;
            } else {
              name = restLine.slice(indices![2][0], indices![2][1]);
            }

            output("expression", codeGenerator.property(caller, name));
            break;
        }
      }
      if (currentColumn < line.length) {
        // Output any remaining text after the last matched pattern
        output("code", line.slice(currentColumn));
      }
      output("code", "\n");
    };

    if (options.preserveCodeReference) {
      const maxLineNumber = pass1.length;
      const lineNumberWidth = String(maxLineNumber).length;
      const paddedLineNumber = String(currentLine + 1).padStart(lineNumberWidth, " ");
      const sourcePath = pass1[i].codeReference.filePath;
      const sourceLine = generatorState.repo.templates.get(sourcePath)!.raw[pass1[i].codeReference.lineNumber - 1];
      output("raw", `// ${paddedLineNumber} | ${sourceLine}\n`);
    }

    if (line === "") {
      if (i === pass1.length - 1) {
        // If this is the last line and it's empty, we can skip it
        continue;
      }

      if (previousLineWasEmpty) {
        // If we are ignoring empty lines, skip this line
        continue;
      }

      // When previous line was not empty, will output the current empty line but reset the flag
      previousLineWasEmpty = true;
    } else {
      previousLineWasEmpty = false;
    }

    if (line.startsWith("#")) {
      if (line.startsWith("#use ")) {
        const uses = line
          .slice(5)
          .split(" ")
          .filter((s) => s.trim())
          .map((s) => s.trim());
        for (const use of uses) {
          const pattern = lookupPattern(use);
          if (!pattern) {
            throw new WgslTemplateGenerateError(
              `Unknown use: ${use} at line ${currentLine + 1}`,
              "code-pattern-not-found",
              { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
            );
          }
          patterns.push(pattern);
        }
      } else if (line.startsWith("#param ")) {
        const params = line
          .slice(7)
          .split(" ")
          .filter((s) => s.trim())
          .map((s) => s.trim());

        // Check if no parameters were provided
        if (params.length === 0) {
          throw new WgslTemplateGenerateError(
            `No parameters specified in #param directive at line ${currentLine + 1}`,
            "parameter-missing",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }

        for (const param of params) {
          const pattern = createParamPattern(param);
          // Allow duplicates if same (including same implied type), but error on type mismatch when types are specified.
          const existing = patterns.find(
            (p) => p.type === "param" && p.pattern.toString() === pattern.pattern.toString()
          );
          if (!existing) {
            patterns.push(pattern);
          } else {
            const existingType = existing.paramType || "int";
            const newType = pattern.paramType || "int";
            if (existingType !== newType) {
              throw new WgslTemplateGenerateError(
                `Duplicate param with different type: ${param} at line ${currentLine + 1}`,
                "parameter-type-mismatch",
                { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
              );
            }
            // otherwise silently ignore duplicate
          }
        }
      } else if (line.startsWith("#if ")) {
        if (currentFunctionCall.length > 0) {
          throw new WgslTemplateGenerateError(
            `Preprocessor directive inside function call at line ${currentLine + 1}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }

        // Check if there's a condition after #if
        const condition = line.slice(4).trim();
        if (condition.length === 0) {
          throw new WgslTemplateGenerateError(
            `Empty condition in #if directive at line ${currentLine + 1}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }

        currentColumn = 4;
        preprocessIfStack.push(["if", currentParenthesesState, currentBracketState, null, null]);
        output("raw", "if (");
        currentPreProcessorExpression = [];
        const cachedParenthesesState = currentParenthesesState;
        currentParenthesesState = 0; // Reset parentheses state for preprocessor expressions
        processCurrentLine();
        if (currentParenthesesState !== 0) {
          throw new WgslTemplateGenerateError(
            `Unmatched parentheses in preprocessor expression at line ${currentLine + 1}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }
        currentParenthesesState = cachedParenthesesState; // Restore parentheses state
        if (currentFunctionCall.length > 0) {
          throw new WgslTemplateGenerateError(
            `Incomplete function call at line ${currentLine + 1}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }
        generatorState.result.push(...currentPreProcessorExpression);
        currentPreProcessorExpression = null;
        output("raw", ") {\n");
      } else if (line.startsWith("#elif ")) {
        if (
          preprocessIfStack.length === 0 ||
          (preprocessIfStack[preprocessIfStack.length - 1][0] !== "if" &&
            preprocessIfStack[preprocessIfStack.length - 1][0] !== "elif")
        ) {
          throw new WgslTemplateGenerateError(`#elif mismatch at line ${currentLine + 1}`, "code-generation-failed", {
            lineNumber: currentLine + 1,
          });
        }
        if (currentFunctionCall.length > 0) {
          throw new WgslTemplateGenerateError(
            `Preprocessor directive inside function call at line ${currentLine + 1}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }

        // check parentheses and brackets state
        const previousBlockParenthesesState = preprocessIfStack[preprocessIfStack.length - 1][3];
        if (previousBlockParenthesesState !== null && currentParenthesesState !== previousBlockParenthesesState) {
          throw new WgslTemplateGenerateError(
            `Parentheses state mismatch in #elif directive at line ${currentLine + 1}, expected ${previousBlockParenthesesState}, got ${currentParenthesesState}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }
        const previousBlockBracketState = preprocessIfStack[preprocessIfStack.length - 1][4];
        if (previousBlockBracketState !== null && currentBracketState !== previousBlockBracketState) {
          throw new WgslTemplateGenerateError(
            `Bracket state mismatch in #elif directive at line ${currentLine + 1}, expected ${previousBlockBracketState}, got ${currentBracketState}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }
        preprocessIfStack[preprocessIfStack.length - 1][3] = currentParenthesesState; // Update the parentheses state for the current block
        preprocessIfStack[preprocessIfStack.length - 1][4] = currentBracketState; // Update the bracket state for the current block
        currentParenthesesState = preprocessIfStack[preprocessIfStack.length - 1][1]; // Reset parentheses state to the initial state of the current block
        currentBracketState = preprocessIfStack[preprocessIfStack.length - 1][2]; // Reset bracket state to the initial state of the current block

        // Check if there's a condition after #elif
        const condition = line.slice(6).trim();
        if (condition.length === 0) {
          throw new WgslTemplateGenerateError(
            `Empty condition in #elif directive at line ${currentLine + 1}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }

        currentColumn = 6;
        preprocessIfStack[preprocessIfStack.length - 1][0] = "elif";
        output("raw", "} else if (");
        currentPreProcessorExpression = [];
        const cachedParenthesesState = currentParenthesesState;
        currentParenthesesState = 0; // Reset parentheses state for preprocessor expressions
        processCurrentLine();
        if (currentParenthesesState !== 0) {
          throw new WgslTemplateGenerateError(
            `Unmatched parentheses in preprocessor expression at line ${currentLine + 1}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }
        currentParenthesesState = cachedParenthesesState; // Restore parentheses state
        if (currentFunctionCall.length > 0) {
          throw new WgslTemplateGenerateError(
            `Incomplete function call at line ${currentLine + 1}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }
        generatorState.result.push(...currentPreProcessorExpression);
        currentPreProcessorExpression = null;
        output("raw", ") {\n");
      } else if (line.startsWith("#else")) {
        if (
          preprocessIfStack.length === 0 ||
          (preprocessIfStack[preprocessIfStack.length - 1][0] !== "if" &&
            preprocessIfStack[preprocessIfStack.length - 1][0] !== "elif")
        ) {
          throw new WgslTemplateGenerateError(`#else mismatch at line ${currentLine + 1}`, "code-generation-failed", {
            lineNumber: currentLine + 1,
          });
        }
        if (currentFunctionCall.length > 0) {
          throw new WgslTemplateGenerateError(
            `Preprocessor directive inside function call at line ${currentLine + 1}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }

        // check parentheses and brackets state
        const previousBlockParenthesesState = preprocessIfStack[preprocessIfStack.length - 1][3];
        if (previousBlockParenthesesState !== null && currentParenthesesState !== previousBlockParenthesesState) {
          throw new WgslTemplateGenerateError(
            `Parentheses state mismatch in #elif directive at line ${currentLine + 1}, expected ${previousBlockParenthesesState}, got ${currentParenthesesState}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }
        const previousBlockBracketState = preprocessIfStack[preprocessIfStack.length - 1][4];
        if (previousBlockBracketState !== null && currentBracketState !== previousBlockBracketState) {
          throw new WgslTemplateGenerateError(
            `Bracket state mismatch in #elif directive at line ${currentLine + 1}, expected ${previousBlockBracketState}, got ${currentBracketState}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }
        preprocessIfStack[preprocessIfStack.length - 1][3] = currentParenthesesState; // Update the parentheses state for the current block
        preprocessIfStack[preprocessIfStack.length - 1][4] = currentBracketState; // Update the bracket state for the current block
        currentParenthesesState = preprocessIfStack[preprocessIfStack.length - 1][1]; // Reset parentheses state to the initial state of the current block
        currentBracketState = preprocessIfStack[preprocessIfStack.length - 1][2]; // Reset bracket state to the initial state of the current block

        if (line.substring(5).trim() !== "") {
          throw new WgslTemplateGenerateError(
            `Unexpected content after #else at line ${currentLine + 1}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }
        preprocessIfStack[preprocessIfStack.length - 1][0] = "else";
        output("raw", "} else {\n");
      } else if (line.startsWith("#endif")) {
        if (preprocessIfStack.length === 0) {
          throw new WgslTemplateGenerateError(`#endif mismatch at line ${currentLine + 1}`, "code-generation-failed", {
            lineNumber: currentLine + 1,
          });
        }
        if (currentFunctionCall.length > 0) {
          throw new WgslTemplateGenerateError(
            `Preprocessor directive inside function call at line ${currentLine + 1}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }

        // check parentheses and brackets state
        const previousBlockParenthesesState = preprocessIfStack[preprocessIfStack.length - 1][3];
        if (previousBlockParenthesesState !== null && currentParenthesesState !== previousBlockParenthesesState) {
          throw new WgslTemplateGenerateError(
            `Parentheses state mismatch in #elif directive at line ${currentLine + 1}, expected ${previousBlockParenthesesState}, got ${currentParenthesesState}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }
        const previousBlockBracketState = preprocessIfStack[preprocessIfStack.length - 1][4];
        if (previousBlockBracketState !== null && currentBracketState !== previousBlockBracketState) {
          throw new WgslTemplateGenerateError(
            `Bracket state mismatch in #elif directive at line ${currentLine + 1}, expected ${previousBlockBracketState}, got ${currentBracketState}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }

        if (line.substring(6).trim() !== "") {
          throw new WgslTemplateGenerateError(
            `Unexpected content after #endif at line ${currentLine + 1}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }
        output("raw", "}\n");
        preprocessIfStack.pop();
      } else {
        if (["#use", "#param", "#if", "#elif"].includes(line)) {
          throw new WgslTemplateGenerateError(
            `Missing content after preprocessor directive at line ${currentLine + 1}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        } else {
          // Handle unknown preprocessor directive
          throw new WgslTemplateGenerateError(
            `Unknown preprocessor directive: ${line} at line ${currentLine + 1}`,
            "code-generation-failed",
            { filePath: generatorState.filePath, lineNumber: currentLine + 1 }
          );
        }
      }
      previousLineWasEmpty = true; // Reset the empty line flag after processing a preprocessor directive
    } else {
      processCurrentLine();
    }
  }
}

const generate = (
  filePath: string,
  repo: TemplateRepository<TemplatePass1>,
  codeGenerator: CodeGenerator,
  options?: GenerateOptions
): GenerateResult => {
  const pass1 = repo.templates.get(filePath)?.pass1;
  if (!pass1) {
    throw new WgslTemplateGenerateError(`Template not found for file: ${filePath}`, "generator-not-found", {
      filePath,
    });
  }

  const generatorState: GeneratorState = {
    repo,
    pass1,
    codeGenerator,
    filePath,
    currentLine: 0,
    currentColumn: 0,
    preprocessIfStack: [],
    patterns: [...DEFAULT_PATTERNS],
    currentFunctionCall: [],
    currentParenthesesState: 0,
    mainFunction: "not-started",
    currentBracketState: 0,
    result: [],
    usedParams: new Map(),
    usedVariables: new Map(),
  };

  generateImpl(generatorState, options || {});

  if (generatorState.preprocessIfStack.length > 0) {
    throw new WgslTemplateGenerateError(
      `Unclosed preprocessor directive: ${generatorState.preprocessIfStack.join(", ")}`,
      "code-generation-failed"
    );
  }
  if (generatorState.currentFunctionCall.length > 0) {
    throw new WgslTemplateGenerateError(
      `Unclosed function call: ${generatorState.currentFunctionCall.map((call) => call.name).join(", ")}`,
      "code-generation-failed"
    );
  }
  if (generatorState.currentParenthesesState !== 0) {
    throw new WgslTemplateGenerateError(`Unmatched parentheses at the end of processing`, "code-generation-failed");
  }
  if (generatorState.currentBracketState !== 0) {
    throw new WgslTemplateGenerateError(`Unmatched brackets at the end of processing`, "code-generation-failed");
  }
  if (generatorState.mainFunction === "started") {
    throw new WgslTemplateGenerateError(
      `Main function context started but not ended at the end of processing`,
      "code-generation-failed"
    );
  }

  // merge results
  // if 2 segments are "raw" or "code" and they are adjacent, merge them into one segment
  generatorState.result = mergeAdjacentSegments(generatorState.result);

  // Sort params and variables by keys before returning
  const sortedParamKeys = Array.from(generatorState.usedParams.keys()).sort();
  const sortedVariableKeys = Array.from(generatorState.usedVariables.keys()).sort();

  const sortedParams = new Map(sortedParamKeys.map((key) => [key, generatorState.usedParams.get(key)!]));
  const sortedVariables = new Map(sortedVariableKeys.map((key) => [key, generatorState.usedVariables.get(key)!]));

  return {
    code: codeGenerator.emit(generatorState.result),
    params: sortedParams,
    variables: sortedVariables,
    hasMainFunction: generatorState.mainFunction === "ended",
  };
};

export const generator: Generator = {
  generate,

  generateDirectory(repo, codeGenerator, options): TemplateRepository<TemplatePass2> {
    const result = new Map<string, TemplatePass2>();

    for (const [filePath, template] of repo.templates) {
      const generateResult = generate(filePath, repo, codeGenerator, options);
      result.set(filePath, {
        filePath: template.filePath,
        generateResult,
      });
    }

    return {
      basePath: repo.basePath,
      templates: result,
    };
  },
};
