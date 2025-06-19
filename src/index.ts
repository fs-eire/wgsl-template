import * as fs from "fs";
import * as path from "path";
import { resolveCodeGenerator } from "./code-generator-impl";
import { generator } from "./generator-impl";
import { loader } from "./loader-impl";
import { parser } from "./parser-impl";

export interface TemplateLoadOptions {
  templateExt: string;
  outDir: string;
  generator: string;
  namespaces?: string[];
}

export const build = async (directory: string, options: TemplateLoadOptions): Promise<void> => {
  const pass0 = await loader.loadFromDirectory(directory, { ext: options.templateExt });
  const pass1 = parser.parse(pass0);

  const codeGenerator = resolveCodeGenerator(options.generator);
  const generated = generator.generateDirectory(pass1, codeGenerator);

  const finalResult = codeGenerator.build(generated, {
    templateExt: options.templateExt,
    namespaces: options.namespaces,
  });

  // Write files to the output directory
  const basePath = path.resolve(options.outDir);

  for (const [filePath, result] of finalResult.templates) {
    const fullPath = path.resolve(basePath, filePath);

    // Security check: ensure the resolved path is within the output directory
    if (!fullPath.startsWith(basePath + path.sep) && fullPath !== basePath) {
      throw new Error(`Security violation: attempted to write file outside output directory: ${filePath}`);
    }

    const dirName = path.dirname(fullPath);

    // Create the directory if it doesn't exist
    fs.mkdirSync(dirName, { recursive: true });

    // Write the file
    fs.writeFileSync(fullPath, result.fileContent);
  }
};
