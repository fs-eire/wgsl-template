import * as fs from "fs/promises";
import * as path from "path";
import { resolveCodeGenerator } from "./code-generator-impl.js";
import { generator } from "./generator-impl.js";
import { loader } from "./loader-impl.js";
import { parser } from "./parser-impl.js";
import { WgslTemplateBuildError } from "./errors.js";
import type { TemplateRepository, TemplatePass0, TemplatePass1, TemplatePass2 } from "./types.js";

// Export error types
export * from "./errors.js";

// Export types
export type {
  TemplateRepository,
  TemplatePass0,
  TemplatePass1,
  TemplatePass2,
  LoadFromDirectoryOptions,
} from "./types.js";

// Export loader functions
export { loader } from "./loader-impl.js";

/**
 * Options for the build process.
 */
export interface BuildOptions {
  /**
   * Multiple source directories containing the source templates.
   * Can be strings (directory paths) or objects with path and optional alias.
   * When using aliases, template names will be prefixed with the alias.
   */
  sourceDirs: ({ path: string; alias?: string } | string)[];

  /**
   * The output directory where the generated files will be written.
   */
  outDir: string;
  /**
   * The file extension of the template files.
   */
  templateExt: string;
  /**
   * * The code generator to use for generating the output files.
   */
  generator: string;

  /**
   * The prefix to use for include paths in the generated files.
   *
   * This is used to ensure that the generated code can find included files correctly.
   *
   * If the prefix is `"myproject/a/"`, then an include path like
   * `#include "b/shader.wgsl"`
   * will be transformed to
   * `#include "myproject/a/b/shader.wgsl"`
   */
  includePathPrefix?: string;

  /**
   * Whether to preserve code references in the generated output.
   *
   * If true, comments will be added to the generated code indicating the original template file and line number.
   * This can be useful for debugging and tracing back to the source templates.
   *
   * Default is false.
   */
  preserveCodeReference?: boolean;
}

/**
 * Represents the result of a build operation.
 */
export interface BuildResult {
  /**
   * The status of the build operation.
   * - "success" if the build completed successfully.
   * - "build-error" if there was an error during the build process.
   * - "file-write-error" if there was an error writing files to the output directory.
   */
  status: "success" | "build-error" | "file-write-error";

  /**
   * The error object if the build failed.
   */
  error?: Error;

  result: {
    pass0?: TemplateRepository<TemplatePass0>;
    pass1?: TemplateRepository<TemplatePass1>;
    pass2?: TemplateRepository<TemplatePass2>;
    files?: TemplateRepository<string>;
  };
}

export const build = async (options: BuildOptions): Promise<BuildResult> => {
  let pass0: TemplateRepository<TemplatePass0> | undefined;
  let pass1: TemplateRepository<TemplatePass1> | undefined;
  let pass2: TemplateRepository<TemplatePass2> | undefined;
  let files: TemplateRepository<string> | undefined;

  try {
    // Validate that sourceDirs is provided
    if (!options.sourceDirs || options.sourceDirs.length === 0) {
      throw new WgslTemplateBuildError("sourceDirs must be provided and cannot be empty", "invalid-options", {});
    }

    // Load templates using the multi-directory loader
    pass0 = await loader.loadFromDirectories(options.sourceDirs, { ext: options.templateExt });

    pass1 = parser.parse(pass0);

    const codeGenerator = resolveCodeGenerator(options.generator);
    pass2 = generator.generateDirectory(pass1, codeGenerator, {
      preserveCodeReference: options.preserveCodeReference,
    });

    const files = codeGenerator.build(pass2, {
      templateExt: options.templateExt,
      includePathPrefix: options.includePathPrefix,
    });

    // Write files to the output directory
    const basePath = path.resolve(options.outDir);

    for (const [filePath, result] of files.templates) {
      try {
        const fullPath = path.resolve(basePath, filePath);

        // Security check: ensure the resolved path is within the output directory
        if (!fullPath.startsWith(basePath + path.sep) && fullPath !== basePath) {
          throw new WgslTemplateBuildError(
            `Security violation: attempted to write file outside output directory: ${filePath}`,
            "path-security-violation",
            { filePath }
          );
        }

        const dirName = path.dirname(fullPath);

        // Create the directory if it doesn't exist
        await fs.mkdir(dirName, { recursive: true });

        // Only write the file if content has changed
        let shouldWrite = true;
        try {
          const existingContent = await fs.readFile(fullPath, "utf8");
          shouldWrite = existingContent !== result;
        } catch {
          // File doesn't exist or can't be read, so we should write it
          shouldWrite = true;
        }

        if (shouldWrite) {
          await fs.writeFile(fullPath, result, "utf8");
        }

        // Record successful file write
        await fs.stat(fullPath);
      } catch (error) {
        return {
          status: "file-write-error",
          error: error instanceof Error ? error : new Error(String(error)),
          result: {
            pass0,
            pass1,
            pass2,
            files,
          },
        };
      }
    }

    return {
      status: "success",
      result: { pass0, pass1, pass2, files },
    };
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    return {
      status: "build-error",
      error: errorObj,
      result: {
        pass0,
        pass1,
        pass2,
        files,
      },
    };
  }
};
