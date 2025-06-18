import type { TemplateBase, TemplatePass0 } from "./template";

export interface TemplateRepository<T extends TemplateBase> {
  /**
   * The base path of the template files in the repository.
   */
  readonly basePath: string;

  readonly templates: ReadonlyMap<string, T>;
}

export interface LoadFromDirectoryOptions {
  /**
   * The file extension to look for when loading files.
   * Defaults to '.wgsl.template'.
   */
  ext?: string;
}

export interface Loader {
  loadFromDirectory(directory: string, options?: LoadFromDirectoryOptions): Promise<TemplateRepository<TemplatePass0>>;
}
