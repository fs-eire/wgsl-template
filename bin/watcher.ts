import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { build, type BuildOptions } from "../src/index.js";
import { Debouncer } from "./debouncer.js";

/**
 * Options for the file watcher
 */
export interface WatchOptions extends BuildOptions {
  /**
   * Debounce delay in milliseconds for batching file changes
   */
  debounce: number;

  /**
   * Whether to show verbose file change events
   */
  verbose: boolean;
}

/**
 * File system watcher for WGSL template files
 */
export class TemplateWatcher {
  private readonly options: WatchOptions;
  private readonly debouncer: Debouncer;
  private readonly watchers: fsSync.FSWatcher[] = [];
  private isBuilding = false;

  constructor(options: WatchOptions) {
    this.options = options;
    this.debouncer = new Debouncer(options.debounce);
  }

  /**
   * Start watching the source directories for changes
   */
  async start(): Promise<void> {
    // Verify all source directories exist and get their absolute paths
    const absoluteSourceDirs: string[] = [];
    for (const dir of this.options.sourceDirs) {
      const dirPath = typeof dir === "string" ? dir : dir.path;
      const resolvedPath = path.resolve(dirPath);
      try {
        await fs.access(resolvedPath);
        absoluteSourceDirs.push(resolvedPath);
      } catch {
        throw new Error(`Source directory "${resolvedPath}" does not exist`);
      }
    }

    console.log(`🔍 Starting watch mode...`);
    console.log(`  Sources: ${absoluteSourceDirs.join(", ")}`);
    console.log(`  Output: ${path.resolve(this.options.outDir)}`);
    console.log(`  Template extension: ${this.options.templateExt}`);
    console.log(`  Debounce delay: ${this.options.debounce}ms`);

    // Perform initial build
    console.log(`\n⚡ Running initial build...`);
    await this.runBuild();

    // Start watching all source directories
    for (const srcPath of absoluteSourceDirs) {
      await this.setupWatchers(srcPath);
    }

    console.log(`\n👀 Watching for changes... (Press Ctrl+C to stop)`);
  }

  /**
   * Stop watching and clean up resources
   */
  async stop(): Promise<void> {
    this.debouncer.cancel();

    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers.length = 0;

    console.log(`\n✋ Watch mode stopped.`);
  }

  /**
   * Set up file system watchers recursively
   */
  private async setupWatchers(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true }); // Watch the current directory
      const watcher = fsSync.watch(dirPath, (eventType: string, filename: string | null) => {
        if (filename) {
          this.handleFileChange(eventType, path.join(dirPath, filename));
        }
      });

      this.watchers.push(watcher);

      // Recursively watch subdirectories
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDirPath = path.join(dirPath, entry.name);
          await this.setupWatchers(subDirPath);
        }
      }
    } catch (error) {
      console.error(
        `⚠️  Failed to setup watcher for ${dirPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle file system changes
   */
  private handleFileChange(eventType: string, filePath: string): void {
    // Only watch template files
    if (!filePath.endsWith(this.options.templateExt)) {
      return;
    }

    // Find which source directory this file belongs to
    let relativePath = filePath;
    for (const dir of this.options.sourceDirs) {
      const dirPath = typeof dir === "string" ? dir : dir.path;
      const resolvedDirPath = path.resolve(dirPath);
      if (filePath.startsWith(resolvedDirPath)) {
        relativePath = path.relative(resolvedDirPath, filePath);
        if (typeof dir !== "string" && dir.alias) {
          relativePath = `${dir.alias}/${relativePath}`;
        }
        break;
      }
    }

    if (this.options.verbose) {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] 📝 ${eventType}: ${relativePath}`);
    }

    // Debounce the rebuild to batch rapid changes
    this.debouncer.debounce(() => this.runBuild());
  }

  /**
   * Run the build process
   */
  private async runBuild(): Promise<void> {
    if (this.isBuilding) {
      return; // Prevent concurrent builds
    }

    this.isBuilding = true;
    const timestamp = new Date().toLocaleTimeString();

    try {
      console.log(`\n[${timestamp}] 🔄 Building...`);
      const startTime = Date.now();

      const result = await build({
        sourceDirs: this.options.sourceDirs,
        outDir: this.options.outDir,
        templateExt: this.options.templateExt,
        generator: this.options.generator,
        includePathPrefix: this.options.includePathPrefix,
        preserveCodeReference: this.options.preserveCodeReference,
      });

      const duration = Date.now() - startTime;

      if (result.status === "success") {
        const fileCount = result.result?.files?.templates.size || 0;
        console.log(`[${timestamp}] ✅ Build completed successfully! (${fileCount} files in ${duration}ms)`);
      } else {
        console.log(`[${timestamp}] ❌ Build failed:`);
        if (result.error) {
          console.error(`   ${result.error.message}`);
        }
      }
    } catch (error) {
      console.log(`[${timestamp}] ❌ Build failed with error:`);
      console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.isBuilding = false;
    }
  }
}
