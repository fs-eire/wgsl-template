import { createParamPattern, DEFAULT_PATTERNS, lookupPattern } from "./code-pattern-impl.js";

import type { CodeGenerator, CodeSegment } from "./types/code-generator.js";
import type { CodePattern } from "./types/code-pattern.js";
import type { Generator } from "./types/generator.js";
import type { TemplateRepository } from "./types/loader.js";
import type { TemplatePass1 } from "./types/template.js";

interface FunctionCallState {
  readonly caller?: string; // Optional caller name, if this is a method call
  readonly name: string;
  readonly parenthesesState: number;
  readonly params: CodeSegment[][];

  currentParam: CodeSegment[];
}

interface GeneratorState {
  readonly pass1: readonly string[];
  readonly codeGenerator: CodeGenerator;

  currentLine: number;
  currentColumn: number;

  preprocessIfStack: ("if" | "elif" | "else" | "endif")[];
  patterns: CodePattern[];

  currentFunctionCall: FunctionCallState[];
  currentParenthesesState: number; // 0: no parentheses, >0: nested parentheses count

  result: CodeSegment[];
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

export const generator: Generator = {
  generate(filePath: string, repo: TemplateRepository<TemplatePass1>, codeGenerator: CodeGenerator): string {
    const pass1 = repo.templates.get(filePath)?.pass1;
    if (!pass1) {
      throw new Error(`Template not found for file: ${filePath}`);
    }

    const generatorState: GeneratorState = {
      pass1,
      codeGenerator,
      currentLine: 0,
      currentColumn: 0,
      preprocessIfStack: [],
      patterns: [...DEFAULT_PATTERNS],
      currentFunctionCall: [],
      currentParenthesesState: 0,
      result: [],
    };

    generateImpl(generatorState);

    if (generatorState.preprocessIfStack.length > 0) {
      throw new Error(`Unclosed preprocessor directive: ${generatorState.preprocessIfStack.join(", ")}`);
    }
    if (generatorState.currentFunctionCall.length > 0) {
      throw new Error(
        `Unclosed function call: ${generatorState.currentFunctionCall.map((call) => call.name).join(", ")}`
      );
    }

    // merge results
    // if 2 segments are "raw" or "code" and they are adjacent, merge them into one segment
    generatorState.result = mergeAdjacentSegments(generatorState.result);

    return codeGenerator.emit(generatorState.result);
  },
};

function generateImpl(generatorState: GeneratorState) {
  const { pass1, codeGenerator, preprocessIfStack, patterns, currentFunctionCall } = generatorState;

  let currentLine = generatorState.currentLine;
  let currentColumn = generatorState.currentColumn;
  let currentParenthesesState = generatorState.currentParenthesesState;

  let currentPreProcessorExpression: CodeSegment[] | null = null;

  const output = (type: "raw" | "code" | "expression", content: string) => {
    const segment: CodeSegment = { type, content };
    if (currentPreProcessorExpression !== null) {
      if (type === "raw") {
        throw new Error(
          `Raw content inside preprocessor expression at line ${currentLine + 1}, column ${currentColumn}`
        );
      } else if (type === "code" && content === "\n") {
        // If we are inside a preprocessor expression, EOL means we are done with this expression
      } else {
        segment.type = "raw"; // Convert to raw if we are inside a preprocessor expression
        currentPreProcessorExpression.push(segment);
      }
    } else {
      if (currentFunctionCall.length > 0) {
        // If we are inside a function call, append to the current parameter
        currentFunctionCall[currentFunctionCall.length - 1].currentParam.push(segment);
      } else {
        generatorState.result.push(segment);
      }
    }
  };

  for (let i = 0; i < pass1.length; i++) {
    const line = pass1[i];
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
                  throw new Error(`Empty parameter at line ${currentLine + 1}, column ${currentColumn}`);
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
                throw new Error(`Unmatched closing parenthesis at line ${currentLine + 1}, column ${currentColumn}`);
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
                  output(
                    "expression",
                    call.caller
                      ? codeGenerator.method(call.caller, call.name, params)
                      : codeGenerator.function(call.name, params)
                  );
                }
              } else {
                output("code", ")");
              }
            }
            break;
          case "param":
            output("expression", codeGenerator.param(matched));
            break;
          case "variable":
            let variableName = matched;
            if (next.pattern.replace && Array.isArray(next.pattern.replace) && next.pattern.replace[0]) {
              variableName = next.pattern.replace[0];
            }
            output("expression", codeGenerator.variable(variableName));
            break;
          case "method":
            if (next.pattern.replace && Array.isArray(next.pattern.replace) && next.pattern.replace[0]) {
              caller = next.pattern.replace[0];
            } else {
              caller = restLine.slice(indices![1][0], indices![1][1]);
            }
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
            });

            currentParenthesesState++;
            break;
          case "property":
            if (next.pattern.replace && Array.isArray(next.pattern.replace) && next.pattern.replace[0]) {
              caller = next.pattern.replace[0];
            } else {
              caller = restLine.slice(indices![1][0], indices![1][1]);
            }
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
            throw new Error(`Unknown use: ${use} at line ${currentLine + 1}`);
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
          throw new Error(`No parameters specified in #param directive at line ${currentLine + 1}`);
        }

        for (const param of params) {
          const pattern = createParamPattern(param);
          if (
            patterns.filter((p) => p.type === "param").some((p) => p.pattern.toString() === pattern.pattern.toString())
          ) {
            throw new Error(`Duplicate param: ${param} at line ${currentLine + 1}`);
          }
          patterns.push(pattern);
        }
      } else if (line.startsWith("#if ")) {
        if (currentFunctionCall.length > 0) {
          throw new Error(`Preprocessor directive inside function call at line ${currentLine + 1}`);
        }

        // Check if there's a condition after #if
        const condition = line.slice(4).trim();
        if (condition.length === 0) {
          throw new Error(`Empty condition in #if directive at line ${currentLine + 1}`);
        }

        currentColumn = 4;
        preprocessIfStack.push("if");
        output("raw", "if (");
        currentPreProcessorExpression = [];
        const cachedParenthesesState = currentParenthesesState;
        currentParenthesesState = 0; // Reset parentheses state for preprocessor expressions
        processCurrentLine();
        if (currentParenthesesState !== 0) {
          throw new Error(`Unmatched parentheses in preprocessor expression at line ${currentLine + 1}`);
        }
        currentParenthesesState = cachedParenthesesState; // Restore parentheses state
        if (currentFunctionCall.length > 0) {
          throw new Error(`Incomplete function call at line ${currentLine + 1}`);
        }
        generatorState.result.push(...currentPreProcessorExpression);
        currentPreProcessorExpression = null;
        output("raw", ") {\n");
      } else if (line.startsWith("#elif ")) {
        if (
          preprocessIfStack.length === 0 ||
          (preprocessIfStack[preprocessIfStack.length - 1] !== "if" &&
            preprocessIfStack[preprocessIfStack.length - 1] !== "elif")
        ) {
          throw new Error(`#elif mismatch at line ${currentLine + 1}`);
        }
        if (currentFunctionCall.length > 0) {
          throw new Error(`Preprocessor directive inside function call at line ${currentLine + 1}`);
        }

        // Check if there's a condition after #elif
        const condition = line.slice(6).trim();
        if (condition.length === 0) {
          throw new Error(`Empty condition in #elif directive at line ${currentLine + 1}`);
        }

        currentColumn = 6;
        preprocessIfStack[preprocessIfStack.length - 1] = "elif";
        output("raw", "} else if (");
        currentPreProcessorExpression = [];
        const cachedParenthesesState = currentParenthesesState;
        currentParenthesesState = 0; // Reset parentheses state for preprocessor expressions
        processCurrentLine();
        if (currentParenthesesState !== 0) {
          throw new Error(`Unmatched parentheses in preprocessor expression at line ${currentLine + 1}`);
        }
        currentParenthesesState = cachedParenthesesState; // Restore parentheses state
        if (currentFunctionCall.length > 0) {
          throw new Error(`Incomplete function call at line ${currentLine + 1}`);
        }
        generatorState.result.push(...currentPreProcessorExpression);
        currentPreProcessorExpression = null;
        output("raw", ") {\n");
      } else if (line.startsWith("#else")) {
        if (
          preprocessIfStack.length === 0 ||
          (preprocessIfStack[preprocessIfStack.length - 1] !== "if" &&
            preprocessIfStack[preprocessIfStack.length - 1] !== "elif")
        ) {
          throw new Error(`#else mismatch at line ${currentLine + 1}`);
        }
        if (currentFunctionCall.length > 0) {
          throw new Error(`Preprocessor directive inside function call at line ${currentLine + 1}`);
        }
        if (line.substring(5).trim() !== "") {
          throw new Error(`Unexpected content after #else at line ${currentLine + 1}`);
        }
        preprocessIfStack[preprocessIfStack.length - 1] = "else";
        output("raw", "} else {\n");
      } else if (line.startsWith("#endif")) {
        if (preprocessIfStack.length === 0) {
          throw new Error(`#endif mismatch at line ${currentLine + 1}`);
        }
        if (currentFunctionCall.length > 0) {
          throw new Error(`Preprocessor directive inside function call at line ${currentLine + 1}`);
        }
        if (line.substring(6).trim() !== "") {
          throw new Error(`Unexpected content after #endif at line ${currentLine + 1}`);
        }
        output("raw", "}\n");
        preprocessIfStack.pop();
      } else {
        if (["#use", "#param", "#if", "#elif"].includes(line)) {
          throw new Error(`Missing content after preprocessor directive at line ${currentLine + 1}`);
        } else {
          // Handle unknown preprocessor directive
          throw new Error(`Unknown preprocessor directive: ${line} at line ${currentLine + 1}`);
        }
      }
    } else {
      processCurrentLine();
    }
  }
}
