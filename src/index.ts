import * as fs from "fs/promises";
import * as path from "path";
import { resolveCodeGenerator } from "./code-generator-impl.js";
import { generator } from "./generator-impl.js";
import { loader } from "./loader-impl.js";
import { parser } from "./parser-impl.js";

/**
 * Options for the build process.
 */
export interface BuildOptions {
  /**
   * The source root directory containing the source templates.
   */
  sourceDir: string;
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
   * The error message if the build failed.
   */
  error?: string;

  /**
   * A map of files that were processed during the build.
   *
   * Only available if the build was successful.
   */
  files?: Map<
    string,
    {
      /**
       * Error message if any error occurred while writting the file.
       */
      error?: string;
      /**
       * File size in bytes.
       */
      size: number;
    }
  >;
}

export const build = async (options: BuildOptions): Promise<BuildResult> => {
  try {
    const pass0 = await loader.loadFromDirectory(options.sourceDir, { ext: options.templateExt });
    const pass1 = parser.parse(pass0);

    const codeGenerator = resolveCodeGenerator(options.generator);
    const generated = generator.generateDirectory(pass1, codeGenerator);

    const finalResult = codeGenerator.build(generated, {
      templateExt: options.templateExt,
      includePathPrefix: options.includePathPrefix,
    });

    // Write files to the output directory
    const basePath = path.resolve(options.outDir);
    const files = new Map<string, { error?: string; size: number }>();

    for (const [filePath, result] of finalResult.templates) {
      try {
        const fullPath = path.resolve(basePath, filePath);

        // Security check: ensure the resolved path is within the output directory
        if (!fullPath.startsWith(basePath + path.sep) && fullPath !== basePath) {
          throw new Error(`Security violation: attempted to write file outside output directory: ${filePath}`);
        }

        const dirName = path.dirname(fullPath);

        // Create the directory if it doesn't exist
        await fs.mkdir(dirName, { recursive: true });

        // Write the file
        await fs.writeFile(fullPath, result, "utf8");

        // Record successful file write
        const stats = await fs.stat(fullPath);
        files.set(filePath, { size: stats.size });
      } catch (error) {
        // Record file write error
        files.set(filePath, {
          error: error instanceof Error ? error.message : String(error),
          size: 0,
        });
      }
    }

    // Check if any files had errors
    const hasErrors = Array.from(files.values()).some((file) => file.error);

    return {
      status: hasErrors ? "file-write-error" : "success",
      files,
    };
  } catch (error) {
    return {
      status: "build-error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
