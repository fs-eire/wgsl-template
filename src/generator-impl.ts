import { dynamicCodeGenerator } from "./code-generator-dynamic-impl";
import { staticCodeGenerator } from "./code-generator-static-impl";
import {
  createParamPattern,
  DEFAULT_PATTERNS,
  lookupPattern,
} from "./code-pattern-impl";

import type { CodeGenerator } from "./types/code-generator";
import type { CodePattern } from "./types/code-pattern";
import type {
  Generator,
  GeneratorOptions,
  GeneratorOptionsParam,
  GeneratorOptionsTarget,
} from "./types/generator";
import type { TemplateRepository } from "./types/loader";
import type { TemplatePass1, TemplateOutput } from "./types/template";

function resolveSegmentGenerator(
  generator: GeneratorOptionsTarget
): CodeGenerator {
  switch (generator) {
    case "ort-static":
      return staticCodeGenerator;
    case "ort-dynamic":
      return dynamicCodeGenerator;
    default:
      throw new Error(`Unknown segment generator: ${generator}`);
  }
}

interface FunctionCallState {
  readonly name: string;
  readonly parenthesesState: number;
  readonly params: string[];

  currentParam: string;
}

interface GeneratorState {
  readonly pass1: readonly string[];
  readonly optionParams: GeneratorOptionsParam[];
  readonly codeGenerator: CodeGenerator;

  currentLine: number;
  currentColumn: number;

  preprocessIfStack: ("if" | "elif" | "else" | "endif")[];
  patterns: CodePattern[];

  currentFunctionCall: FunctionCallState[];
  currentParenthesesState: number; // 0: no parentheses, >0: nested parentheses count

  result: string;
}

function matchNextPattern(
  content: string,
  patterns: CodePattern[]
): { pattern: CodePattern; index: number; length: number } | null {
  // Find the pattern that matches earliest in the content
  // example:
  // content is "abcdefg",
  // pattern1 is /cde/, pattern2 is /def/
  // the result should be pattern1 (matches at position 2, before pattern2 at position 3)

  let earliestMatch: {
    pattern: CodePattern;
    index: number;
    length: number;
  } | null = null;

  for (const pattern of patterns) {
    const regex =
      typeof pattern.pattern === "string"
        ? new RegExp(pattern.pattern)
        : pattern.pattern;
    const match = regex.exec(content);
    if (match && match.index !== undefined) {
      // If this is the first match, or if this match occurs earlier than the current earliest
      if (earliestMatch === null || match.index < earliestMatch.index) {
        earliestMatch = {
          pattern,
          index: match.index,
          length: match[0].length,
        };
      }
    }
  }

  return earliestMatch;
}

function generatePreProcessorExpression(
  condition: string,
  codeGenerator: CodeGenerator,
  patterns: CodePattern[]
): string {
  let i = 0;
  let output = "";
  while (i < condition.length) {
    const next = matchNextPattern(condition.slice(i), patterns);
    if (!next) break;

    if (next.index > 0) {
      // Output the text before the matched pattern
      output += condition.slice(i, i + next.index);
    }
    // Process the matched pattern
    const matched = condition.slice(
      i + next.index,
      i + next.index + next.length
    );

    i += next.index + next.length;

    switch (next.pattern.type) {
      case "param":
        output += codeGenerator.emitPreprocessorExpressionParam(matched);
        break;
      case "macro":
        output += codeGenerator.emitPreprocessorExpressionMacro(matched);
        break;
      case "property":
        output += codeGenerator.emitPreprocessorExpressionProperty(matched);
        break;
    }
  }
  if (i < condition.length) {
    // Output any remaining text after the last matched pattern
    output += condition.slice(i);
  }

  return output;
}

export const generator: Generator = {
  generate(
    filePath: string,
    repo: TemplateRepository<TemplatePass1>,
    options: GeneratorOptions
  ): string {
    const pass1 = repo.templates.get(filePath)?.pass1;
    if (!pass1) {
      throw new Error(`Template not found for file: ${filePath}`);
    }

    const generatorState: GeneratorState = {
      pass1,
      optionParams: options.params ?? [],
      codeGenerator: resolveSegmentGenerator(options.target),
      currentLine: 0,
      currentColumn: 0,
      preprocessIfStack: [],
      patterns: [...DEFAULT_PATTERNS],
      currentFunctionCall: [],
      currentParenthesesState: 0,
      result: "",
    };

    generateImpl(generatorState);

    if (generatorState.preprocessIfStack.length > 0) {
      throw new Error(
        `Unclosed preprocessor directive: ${generatorState.preprocessIfStack.join(
          ", "
        )}`
      );
    }
    if (generatorState.currentFunctionCall.length > 0) {
      throw new Error(
        `Unclosed function call: ${generatorState.currentFunctionCall
          .map((call) => call.name)
          .join(", ")}`
      );
    }
    return generatorState.result;
  },
};

function generateImpl({
  pass1,
  optionParams,
  codeGenerator,
  currentLine,
  currentColumn,
  preprocessIfStack,
  patterns,
  currentFunctionCall,
  currentParenthesesState,
  result,
}: GeneratorState) {
  const output = (s: string) => {
    if (currentFunctionCall.length > 0) {
      currentFunctionCall[currentFunctionCall.length - 1].currentParam += s;
    } else {
      result += s;
    }
  };

  for (let i = 0; i < pass1.length; i++) {
    const line = pass1[i];
    currentLine = i;
    currentColumn = 0;

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
        for (const param of params) {
          const pattern = createParamPattern(param);
          if (
            patterns
              .filter((p) => p.type === "param")
              .some((p) => p.pattern.toString() === pattern.pattern.toString())
          ) {
            throw new Error(
              `Duplicate param: ${param} at line ${currentLine + 1}`
            );
          }
          patterns.push(pattern);
        }
      } else if (line.startsWith("#if ")) {
        if (currentFunctionCall.length > 0) {
          throw new Error(
            `Preprocessor directive inside function call at line ${
              currentLine + 1
            }`
          );
        }
        const condition = line.slice(4).trim();
        const expression = generatePreProcessorExpression(
          condition,
          codeGenerator,
          patterns
        );
        preprocessIfStack.push("if");
        output("if (");
        output(codeGenerator.emitPreprocessorExpressionMacro(expression));
        output(") {\n");
      } else if (line.startsWith("#elif ")) {
        if (
          preprocessIfStack.length === 0 ||
          (preprocessIfStack[preprocessIfStack.length - 1] !== "if" &&
            preprocessIfStack[preprocessIfStack.length - 1] !== "elif")
        ) {
          throw new Error(`#elif mismatch at line ${currentLine + 1}`);
        }
        if (currentFunctionCall.length > 0) {
          throw new Error(
            `Preprocessor directive inside function call at line ${
              currentLine + 1
            }`
          );
        }
        preprocessIfStack[preprocessIfStack.length - 1] = "elif";
        const condition = line.slice(6).trim();
        const expression = generatePreProcessorExpression(
          condition,
          codeGenerator,
          patterns
        );
        output("} else if (");
        output(codeGenerator.emitPreprocessorExpressionMacro(expression));
        output(") {\n");
      } else if (line.startsWith("#else")) {
        if (
          preprocessIfStack.length === 0 ||
          (preprocessIfStack[preprocessIfStack.length - 1] !== "if" &&
            preprocessIfStack[preprocessIfStack.length - 1] !== "elif")
        ) {
          throw new Error(`#else mismatch at line ${currentLine + 1}`);
        }
        if (currentFunctionCall.length > 0) {
          throw new Error(
            `Preprocessor directive inside function call at line ${
              currentLine + 1
            }`
          );
        }
        preprocessIfStack[preprocessIfStack.length - 1] = "else";
        output("} else {\n");
      } else if (line.startsWith("#endif")) {
        if (preprocessIfStack.length === 0) {
          throw new Error(`#endif mismatch at line ${currentLine + 1}`);
        }
        if (currentFunctionCall.length > 0) {
          throw new Error(
            `Preprocessor directive inside function call at line ${
              currentLine + 1
            }`
          );
        }
        output("}\n");
        preprocessIfStack.pop();
      }
    } else {
      while (currentColumn < line.length) {
        const next = matchNextPattern(line.slice(currentColumn), patterns);
        if (!next) break;

        if (next.index > 0) {
          // Output the text before the matched pattern
          output(line.slice(currentColumn, currentColumn + next.index));
        }
        // Process the matched pattern
        const matched = line.slice(
          currentColumn + next.index,
          currentColumn + next.index + next.length
        );

        currentColumn += next.index + next.length;

        switch (next.pattern.type) {
          case "control":
            if (matched === "(") {
              currentParenthesesState++;
            } else if (matched === ")") {
              currentParenthesesState--;
              if (currentParenthesesState < 0) {
                throw new Error(
                  `Unmatched closing parenthesis at line ${
                    currentLine + 1
                  }, column ${currentColumn}`
                );
              }
              if (
                currentFunctionCall.length > 0 &&
                currentFunctionCall[currentFunctionCall.length - 1]
                  .parenthesesState === currentParenthesesState
              ) {
                // End of function call
                const call = currentFunctionCall.pop();
                if (call) {
                  if (call.currentParam.trim()) {
                    call.params.push(call.currentParam);
                  }
                  output(codeGenerator.emitFunction(call.name, call.params));
                }
              }
            }
            break;
          case "param":
            output(codeGenerator.emitParam(matched));
            break;
          case "macro":
            output(codeGenerator.emitMacro(matched));
            break;
          case "function":
          case "method":
            // Handle function/method patterns
            currentFunctionCall.push({
              name: matched,
              parenthesesState: currentParenthesesState,
              params: [],
              currentParam: "",
            });

            currentParenthesesState++;
            currentColumn++; // Skip the opening parenthesis
            break;
          case "property":
            output(codeGenerator.emitProperty(matched));
            break;
        }
      }
      if (currentColumn < line.length) {
        // Output any remaining text after the last matched pattern
        output(line.slice(currentColumn));
      }
    }
  }
}
