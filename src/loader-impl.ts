import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";

import type { Loader, LoadFromDirectoryOptions, TemplatePass0, TemplateRepository } from "./types.js";
import { WgslTemplateLoadError } from "./errors.js";

/**
 * Recursively scans a directory and its subdirectories for template files with alias support.
 *
 * @param directory The directory to scan
 * @param basePath The base directory path for calculating relative paths
 * @param ext The file extension to look for
 * @param templates The map to store loaded templates
 * @param alias Optional alias to prepend to template names
 */
async function loadTemplatesRecursivelyWithAlias(
  directory: string,
  basePath: string,
  ext: string,
  templates: Map<string, TemplatePass0>,
  alias?: string
): Promise<void> {
  try {
    const entries = await readdir(directory);

    for (const entry of entries) {
      const fullPath = path.join(directory, entry);
      const resolvedPath = path.resolve(fullPath);

      // Security check: ensure the resolved path is within the base directory
      const resolvedBasePath = path.resolve(basePath);
      if (!resolvedPath.startsWith(resolvedBasePath + path.sep) && resolvedPath !== resolvedBasePath) {
        console.warn(`Skipping file outside base directory: ${fullPath}`);
        continue;
      }

      const entryStat = await stat(fullPath);

      if (entryStat.isDirectory()) {
        // Recursively process subdirectories
        await loadTemplatesRecursivelyWithAlias(fullPath, basePath, ext, templates, alias);
      } else if (entryStat.isFile() && entry.endsWith(ext)) {
        // Load template file with alias
        await loadTemplateFileWithAlias(fullPath, basePath, templates, alias);
      }
      // Skip symbolic links and other special file types for security
    }
  } catch (error) {
    throw new WgslTemplateLoadError(
      `Error scanning directory ${directory}: ${(error as Error).message}`,
      "scan-directory",
      { cause: error as Error }
    );
  }
}

/**
 * Loads a single template file with alias support and adds it to the templates map.
 *
 * @param filePath The path to the template file
 * @param basePath The base directory path for calculating relative paths
 * @param templates The map to store the loaded template
 * @param alias Optional alias to prepend to template name
 */
async function loadTemplateFileWithAlias(
  filePath: string,
  basePath: string,
  templates: Map<string, TemplatePass0>,
  alias?: string
): Promise<void> {
  try {
    const resolvedFilePath = path.resolve(filePath);
    const resolvedBasePath = path.resolve(basePath);

    // Security check: ensure the file is within the base directory
    if (!resolvedFilePath.startsWith(resolvedBasePath + path.sep) && resolvedFilePath !== resolvedBasePath) {
      throw new WgslTemplateLoadError(
        `Security violation: attempted to read file outside base directory: ${filePath}`,
        "read-file",
        { filePath }
      );
    }

    const content = await readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    // Calculate relative path from base directory
    const relativePath = path.relative(basePath, filePath);
    // always use UNIX-style paths for consistency
    let templateName = relativePath.replace(/\\/g, "/");

    // Prepend alias if provided
    if (alias) {
      templateName = `${alias}/${templateName}`;
    }

    // Check for filename conflicts
    if (templates.has(templateName)) {
      throw new WgslTemplateLoadError(`Template name conflict: ${templateName} already exists`, "template-conflict", {
        filePath,
      });
    }

    const template: TemplatePass0 = {
      filePath: resolvedFilePath,
      raw: lines,
    };

    templates.set(templateName, template);
  } catch (error) {
    if (error instanceof WgslTemplateLoadError) {
      throw error;
    }
    throw new WgslTemplateLoadError(
      `Error loading template file ${filePath}: ${(error as Error).message}`,
      "read-file",
      { filePath, cause: error as Error }
    );
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
    // Use loadFromDirectories as it handles the same functionality
    return this.loadFromDirectories([directory], options);
  },

  /**
   * Loads template files from multiple directories using Node.js filesystem APIs.
   * Supports optional aliases to prevent filename conflicts.
   *
   * @param directories Array of directory paths or objects with path and alias
   * @param options Optional configuration for loading templates
   * @returns A promise that resolves to a TemplateRepository containing all loaded templates
   */
  async loadFromDirectories(
    directories: ({ path: string; alias?: string } | string)[],
    options?: LoadFromDirectoryOptions
  ): Promise<TemplateRepository<TemplatePass0>> {
    const ext = options?.ext ?? ".wgsl.template";
    const templates = new Map<string, TemplatePass0>();
    const resolvedBasePaths: string[] = [];

    for (const dir of directories) {
      const dirPath = typeof dir === "string" ? dir : dir.path;
      const alias = typeof dir === "string" ? undefined : dir.alias;

      // Ensure the directory exists
      try {
        const dirStat = await stat(dirPath);
        if (!dirStat.isDirectory()) {
          throw new WgslTemplateLoadError(`Path ${dirPath} is not a directory`, "scan-directory");
        }
      } catch (error) {
        throw new WgslTemplateLoadError(
          `Cannot access directory ${dirPath}: ${(error as Error).message}`,
          "scan-directory",
          { cause: error as Error }
        );
      }

      // Recursively load template files with alias support
      await loadTemplatesRecursivelyWithAlias(dirPath, dirPath, ext, templates, alias);
      resolvedBasePaths.push(path.resolve(dirPath));
    }

    // Use the first directory as the base path for simplicity
    const basePath = resolvedBasePaths.length === 1 ? resolvedBasePaths[0] : resolvedBasePaths[0]; // For multiple directories, use the first one as base

    return {
      basePath,
      templates: templates as ReadonlyMap<string, TemplatePass0>,
    };
  },
};
