import { readdir, stat, readFile } from 'fs/promises';
import { join, relative, basename } from 'path';
import { existsSync } from 'fs';
import { execa } from 'execa';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export class FileSystemService {
  // Common directories and files to ignore
  private defaultIgnorePatterns = [
    'node_modules',
    '.git',
    '.DS_Store',
    'dist',
    'build',
    '.next',
    'coverage',
    '.cache',
    '.vscode',
    '.idea',
    '*.log',
  ];

  /**
   * Check if a path should be ignored based on patterns
   */
  private shouldIgnore(name: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(name);
      }
      return name === pattern;
    });
  }

  /**
   * Read .gitignore file and parse patterns
   */
  private async readGitignore(rootPath: string): Promise<string[]> {
    const gitignorePath = join(rootPath, '.gitignore');
    if (!existsSync(gitignorePath)) {
      return [];
    }

    try {
      const content = await readFile(gitignorePath, 'utf-8');
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    } catch (error) {
      return [];
    }
  }

  /**
   * Build a file tree from a directory
   */
  async getFileTree(
    rootPath: string,
    relativePath: string = '',
    maxDepth: number = 10,
    currentDepth: number = 0
  ): Promise<FileNode[]> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    const fullPath = join(rootPath, relativePath);

    // Check if path exists
    if (!existsSync(fullPath)) {
      throw new Error(`Path does not exist: ${fullPath}`);
    }

    // Read gitignore on first call
    const ignorePatterns =
      currentDepth === 0
        ? [...this.defaultIgnorePatterns, ...(await this.readGitignore(rootPath))]
        : this.defaultIgnorePatterns;

    try {
      const entries = await readdir(fullPath, { withFileTypes: true });
      const nodes: FileNode[] = [];

      for (const entry of entries) {
        // Skip ignored files
        if (this.shouldIgnore(entry.name, ignorePatterns)) {
          continue;
        }

        const entryPath = join(relativePath, entry.name);
        const entryFullPath = join(fullPath, entry.name);

        if (entry.isDirectory()) {
          const children = await this.getFileTree(
            rootPath,
            entryPath,
            maxDepth,
            currentDepth + 1
          );

          nodes.push({
            name: entry.name,
            path: entryPath || '.',
            type: 'directory',
            children,
          });
        } else if (entry.isFile()) {
          nodes.push({
            name: entry.name,
            path: entryPath,
            type: 'file',
          });
        }
      }

      // Sort: directories first, then files alphabetically
      nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return nodes;
    } catch (error: any) {
      throw new Error(`Failed to read directory: ${error.message}`);
    }
  }

  /**
   * Read file content
   */
  async readFileContent(filePath: string): Promise<string> {
    if (!existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      return content;
    } catch (error: any) {
      // If UTF-8 fails, it might be a binary file
      throw new Error(`Cannot read file as text: ${error.message}`);
    }
  }

  /**
   * Get file content from a specific git commit
   */
  async getFileContentFromGit(
    repoPath: string,
    commitOrBranch: string,
    filePath: string
  ): Promise<string> {
    try {
      const { stdout } = await execa(
        'git',
        ['show', `${commitOrBranch}:${filePath}`],
        { cwd: repoPath }
      );
      return stdout;
    } catch (error: any) {
      // If branch not found locally, try with origin/ prefix
      const errorMsg = error.stderr || error.message || '';
      const isBranchNotFound =
        errorMsg.includes('unknown revision') ||
        errorMsg.includes('invalid object name') ||
        errorMsg.includes('bad revision');

      if (isBranchNotFound && !commitOrBranch.startsWith('origin/')) {
        console.log(`[FileSystemService] Branch '${commitOrBranch}' not found locally, trying with origin/ prefix`);
        try {
          const { stdout } = await execa(
            'git',
            ['show', `origin/${commitOrBranch}:${filePath}`],
            { cwd: repoPath }
          );
          console.log(`[FileSystemService] Successfully fetched from origin/${commitOrBranch}:${filePath}`);
          return stdout;
        } catch (retryError: any) {
          console.log(`[FileSystemService] Failed to fetch from origin/${commitOrBranch}:${filePath}:`, retryError.message);
          // Fall through to original error
        }
      }

      // File might not exist in that commit
      if (errorMsg.includes('does not exist') || isBranchNotFound) {
        throw new Error(`File not found in ${commitOrBranch}: ${filePath}`);
      }
      throw new Error(`Failed to read file from git: ${error.message}`);
    }
  }

  /**
   * Check if a file is binary
   */
  async isBinaryFile(filePath: string): Promise<boolean> {
    try {
      const buffer = await readFile(filePath);

      // Check for null bytes in the first 8000 bytes
      const chunk = buffer.slice(0, Math.min(8000, buffer.length));
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 0) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file stats
   */
  async getFileStats(filePath: string) {
    try {
      const stats = await stat(filePath);
      return {
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
      };
    } catch (error: any) {
      throw new Error(`Failed to get file stats: ${error.message}`);
    }
  }
}
