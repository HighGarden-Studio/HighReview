import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export class ConfigService {
  private baseDir: string;
  private reposDir: string;

  constructor() {
    this.baseDir = join(homedir(), '.highreview');
    this.reposDir = join(this.baseDir, 'repos');

    // Ensure directories exist
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
    if (!existsSync(this.reposDir)) {
      mkdirSync(this.reposDir, { recursive: true });
    }
  }

  /**
   * Get the base directory for HighReview data
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Get the directory where repositories are cloned
   */
  getReposDir(): string {
    return this.reposDir;
  }

  /**
   * Get the local path for a specific repository
   */
  getRepoPath(owner: string, repo: string): string {
    return join(this.reposDir, owner, repo);
  }

  /**
   * Check if a repository is already cloned
   */
  isRepoCloned(owner: string, repo: string): boolean {
    const repoPath = this.getRepoPath(owner, repo);
    return existsSync(join(repoPath, '.git'));
  }
}
