import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";

import type { Loader, LoadFromDirectoryOptions, TemplateRepository } from "./types/loader";
import type { TemplatePass0 } from "./types/template";

/**
 * Recursively scans a directory and its subdirectories for template files.
 *
 * @param directory The directory to scan
 * @param basePath The base directory path for calculating relative paths
 * @param ext The file extension to look for
 * @param templates The map to store loaded templates
 */
async function loadTemplatesRecursively(
  directory: string,
  basePath: string,
  ext: string,
  templates: Map<string, TemplatePass0>
): Promise<void> {
  try {
    const entries = await readdir(directory);

    for (const entry of entries) {
      const fullPath = path.join(directory, entry);
      const entryStat = await stat(fullPath);

      if (entryStat.isDirectory()) {
        // Recursively process subdirectories
        await loadTemplatesRecursively(fullPath, basePath, ext, templates);
      } else if (entryStat.isFile() && entry.endsWith(ext)) {
        // Load template file
        await loadTemplateFile(fullPath, basePath, templates);
      }
    }
  } catch (error) {
    throw new Error(`Error scanning directory ${directory}: ${(error as Error).message}`);
  }
}
/**
 * Loads a single template file and adds it to the templates map.
 *
 * @param filePath The path to the template file
 * @param basePath The base directory path for calculating relative paths
 * @param templates The map to store the loaded template
 */
async function loadTemplateFile(
  filePath: string,
  basePath: string,
  templates: Map<string, TemplatePass0>
): Promise<void> {
  try {
    const content = await readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    // Calculate relative path from base directory
    const relativePath = path.relative(basePath, filePath);
    // always use UNIX-style paths for consistency
    const templateName = relativePath.replace(/\\/g, "/");

    const template: TemplatePass0 = {
      filePath: path.resolve(filePath),
      raw: lines,
    };

    templates.set(templateName, template);
  } catch (error) {
    throw new Error(`Error loading template file ${filePath}: ${(error as Error).message}`);
  }
}

/**
 * NodeLoader is an implementation of the Loader interface that uses Node.js APIs
 * to load template files from the filesystem. It provides methods to scan directories
 * for template files and load their contents into memory.
 */
export const loader: Loader = {
  /**
   * Loads template files from a directory using Node.js filesystem APIs.
   *
   * @param directory The directory path to scan for template files
   * @param options Optional configuration for loading templates
   * @returns A promise that resolves to a TemplateRepository containing loaded templates
   */
  async loadFromDirectory(
    directory: string,
    options?: LoadFromDirectoryOptions
  ): Promise<TemplateRepository<TemplatePass0>> {
    const ext = options?.ext ?? ".wgsl.template";
    const templates = new Map<string, TemplatePass0>();

    // Ensure the directory exists
    try {
      const dirStat = await stat(directory);
      if (!dirStat.isDirectory()) {
        throw new Error(`Path ${directory} is not a directory`);
      }
    } catch (error) {
      throw new Error(`Cannot access directory ${directory}: ${(error as Error).message}`);
    } // Recursively load template files
    await loadTemplatesRecursively(directory, directory, ext, templates);

    return {
      basePath: path.resolve(directory),
      templates: templates as ReadonlyMap<string, TemplatePass0>,
    };
  },
};
