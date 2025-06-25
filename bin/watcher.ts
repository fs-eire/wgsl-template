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
   * Start watching the source directory for changes
   */
  async start(): Promise<void> {
    const srcPath = path.resolve(this.options.sourceDir);

    // Verify source directory exists
    try {
      await fs.access(srcPath);
    } catch {
      throw new Error(`Source directory "${srcPath}" does not exist`);
    }

    console.log(`🔍 Starting watch mode...`);
    console.log(`  Source: ${srcPath}`);
    console.log(`  Output: ${path.resolve(this.options.outDir)}`);
    console.log(`  Template extension: ${this.options.templateExt}`);
    console.log(`  Debounce delay: ${this.options.debounce}ms`);

    // Perform initial build
    console.log(`\n⚡ Running initial build...`);
    await this.runBuild();

    // Start watching
    await this.setupWatchers(srcPath);

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

    const relativePath = path.relative(this.options.sourceDir, filePath);

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
        sourceDir: this.options.sourceDir,
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
