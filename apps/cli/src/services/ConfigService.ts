import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export class ConfigService {
  private baseDir: string;
  private reposDir: string;
  private worktreesDir: string;

  constructor() {
    // Environment variable support for custom location
    const envBaseDir = process.env.HIGHREVIEW_BASE_DIR;
    const useGlobalMode = process.env.HIGHREVIEW_GLOBAL_MODE === 'true';

    if (envBaseDir) {
      // Custom base directory
      this.baseDir = envBaseDir;
    } else if (useGlobalMode) {
      // Global mode: ~/.highreview (legacy/multi-workspace)
      this.baseDir = join(homedir(), '.highreview');
    } else {
      // Local mode (default): ./.highreview-prs (current working directory)
      this.baseDir = join(process.cwd(), '.highreview-prs');
    }

    this.reposDir = join(this.baseDir, 'repos');
    this.worktreesDir = join(this.baseDir, 'worktrees');

    // Ensure directories exist
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
    if (!existsSync(this.reposDir)) {
      mkdirSync(this.reposDir, { recursive: true });
    }
    if (!existsSync(this.worktreesDir)) {
      mkdirSync(this.worktreesDir, { recursive: true });
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
   * Get the directory where worktrees are stored
   */
  getWorktreesDir(): string {
    return this.worktreesDir;
  }

  /**
   * Get the local path for a specific repository (bare repo)
   * Format: ~/.highreview/repos/{owner}-{repo}
   */
  getRepoPath(owner: string, repo: string): string {
    return join(this.reposDir, `${owner}-${repo}`);
  }

  /**
   * Get the worktree path for a specific PR
   * Format: ~/.highreview/worktrees/{owner}-{repo}/pr-{number}
   */
  getWorktreePath(owner: string, repo: string, prNumber: number): string {
    const repoWorktreeDir = join(this.worktreesDir, `${owner}-${repo}`);

    // Ensure repo worktree directory exists
    if (!existsSync(repoWorktreeDir)) {
      mkdirSync(repoWorktreeDir, { recursive: true });
    }

    return join(repoWorktreeDir, `pr-${prNumber}`);
  }

  /**
   * Check if a repository is already cloned (as bare repo)
   */
  isRepoCloned(owner: string, repo: string): boolean {
    const repoPath = this.getRepoPath(owner, repo);
    // For bare repos, check for 'config' file instead of .git directory
    return existsSync(join(repoPath, 'config')) || existsSync(join(repoPath, '.git'));
  }
}
