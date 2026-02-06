import chokidar, { FSWatcher } from 'chokidar';
import { CodeIndexingService } from './CodeIndexingService.js';
import * as path from 'path';

/**
 * File Watcher Service
 *
 * Watches repository files for changes and automatically re-indexes them
 */
export class FileWatcherService {
  private watchers: Map<string, FSWatcher> = new Map();
  private indexingService: CodeIndexingService;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceDelay = 1000; // 1 second debounce

  constructor() {
    this.indexingService = new CodeIndexingService();
  }

  /**
   * Start watching a repository
   */
  startWatching(repoPath: string): void {
    if (this.watchers.has(repoPath)) {
      console.log(`[FileWatcher] Already watching: ${repoPath}`);
      return;
    }

    console.log(`[FileWatcher] Starting to watch: ${repoPath}`);

    const watcher = chokidar.watch(repoPath, {
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/dist-web/**',
        '**/build/**',
        '**/.git/**',
        '**/coverage/**',
        '**/.next/**',
        '**/.cache/**',
        '**/out/**',
        '**/target/**', // Java build output
        '**/.idea/**',
        '**/.vscode/**',
        '**/public/**', // Ignore public folder where Vite builds assets
        '**/*.map',
        '**/*.log',
      ],
      persistent: true,
      ignoreInitial: true, // Don't trigger for existing files
      awaitWriteFinish: {
        stabilityThreshold: 1000, // Increase to 1s to reduce EDR triggers
        pollInterval: 200,
      },
    });

    watcher
      .on('add', (filePath) => this.handleFileChange(repoPath, filePath, 'added'))
      .on('change', (filePath) => this.handleFileChange(repoPath, filePath, 'changed'))
      .on('unlink', (filePath) => this.handleFileDelete(repoPath, filePath));

    this.watchers.set(repoPath, watcher);
    console.log(`[FileWatcher] Now watching: ${repoPath}`);
  }

  /**
   * Stop watching a repository
   */
  async stopWatching(repoPath: string): Promise<void> {
    const watcher = this.watchers.get(repoPath);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(repoPath);
      console.log(`[FileWatcher] Stopped watching: ${repoPath}`);
    }
  }

  /**
   * Stop all watchers
   */
  async stopAll(): Promise<void> {
    console.log(`[FileWatcher] Stopping all ${this.watchers.size} watchers`);
    const promises = Array.from(this.watchers.keys()).map((repoPath) =>
      this.stopWatching(repoPath)
    );
    await Promise.all(promises);
  }

  /**
   * Handle file change (add or modify)
   */
  private handleFileChange(repoPath: string, fullPath: string, changeType: 'added' | 'changed'): void {
    // Check if file is indexable
    if (!this.isIndexableFile(fullPath)) {
      return;
    }

    const relativePath = path.relative(repoPath, fullPath);
    console.log(`[FileWatcher] File ${changeType}: ${relativePath}`);

    // Debounce to avoid multiple re-indexes for rapid changes
    const key = `${repoPath}:${relativePath}`;
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(key);
      try {
        await this.indexingService.indexFile(repoPath, relativePath);
        console.log(`[FileWatcher] Re-indexed: ${relativePath}`);
      } catch (error) {
        console.error(`[FileWatcher] Failed to re-index ${relativePath}:`, error);
      }
    }, this.debounceDelay);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Handle file deletion
   */
  private handleFileDelete(repoPath: string, fullPath: string): void {
    if (!this.isIndexableFile(fullPath)) {
      return;
    }

    const relativePath = path.relative(repoPath, fullPath);
    console.log(`[FileWatcher] File deleted: ${relativePath}`);

    try {
      this.indexingService.deleteFileIndex(repoPath, relativePath);
      console.log(`[FileWatcher] Removed index for: ${relativePath}`);
    } catch (error) {
      console.error(`[FileWatcher] Failed to remove index for ${relativePath}:`, error);
    }
  }

  /**
   * Check if file should be indexed
   */
  private isIndexableFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const indexableExtensions = [
      // Web
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.css', '.scss', '.sass', '.less',
      '.html', '.htm', '.xhtml',
      '.json', '.jsonc',
      // Backend
      '.py', '.pyi', '.pyw',
      '.java',
      '.cs', '.csx',
      '.php', '.phtml',
      '.rb', '.rake', '.gemspec',
      '.go',
      '.rs',
      // Mobile
      '.swift',
      '.kt', '.kts',
      '.dart',
      // Systems
      '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh', '.hxx',
      // Others
      '.scala', '.sc',
      '.lua',
      '.pl', '.pm', '.pod',
    ];
    return indexableExtensions.includes(ext);
  }

  /**
   * Get list of watched repositories
   */
  getWatchedRepositories(): string[] {
    return Array.from(this.watchers.keys());
  }

  /**
   * Check if repository is being watched
   */
  isWatching(repoPath: string): boolean {
    return this.watchers.has(repoPath);
  }
}

// Singleton instance
let instance: FileWatcherService | null = null;

export function getFileWatcherService(): FileWatcherService {
  if (!instance) {
    instance = new FileWatcherService();
  }
  return instance;
}
