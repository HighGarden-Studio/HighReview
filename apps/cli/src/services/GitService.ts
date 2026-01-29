import { execa } from 'execa';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
}

export class GitService {
  private baseWorktreePath: string;

  constructor() {
    this.baseWorktreePath = join(homedir(), '.highreview', 'worktrees');
    this.ensureBaseDirectory();
  }

  /**
   * Ensure ~/.highreview/worktrees directory exists
   */
  private ensureBaseDirectory() {
    if (!existsSync(this.baseWorktreePath)) {
      mkdirSync(this.baseWorktreePath, { recursive: true });
    }
  }

  /**
   * Get the repository root directory
   */
  async getRepoRoot(cwd?: string): Promise<string> {
    try {
      const { stdout } = await execa('git', ['rev-parse', '--show-toplevel'], {
        cwd: cwd || process.cwd(),
      });
      return stdout.trim();
    } catch (error) {
      throw new Error('Not a git repository or git is not installed');
    }
  }

  /**
   * List all existing worktrees
   */
  async listWorktrees(repoRoot: string): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], {
        cwd: repoRoot,
      });

      const worktrees: WorktreeInfo[] = [];
      const lines = stdout.split('\n');
      let current: Partial<WorktreeInfo> = {};

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          current.path = line.substring('worktree '.length);
        } else if (line.startsWith('branch ')) {
          current.branch = line.substring('branch '.length).replace('refs/heads/', '');
        } else if (line.startsWith('HEAD ')) {
          current.commit = line.substring('HEAD '.length);
        } else if (line === '') {
          if (current.path && current.commit) {
            worktrees.push({
              path: current.path,
              branch: current.branch || 'detached',
              commit: current.commit,
            });
          }
          current = {};
        }
      }

      return worktrees;
    } catch (error) {
      console.error('Failed to list worktrees:', error);
      return [];
    }
  }

  /**
   * Prune stale worktree metadata
   */
  async pruneWorktrees(repoRoot: string): Promise<void> {
    try {
      await execa('git', ['worktree', 'prune'], { cwd: repoRoot });
    } catch (error) {
      console.error('Failed to prune worktrees:', error);
    }
  }

  /**
   * Ensure a worktree exists for the given branch/commit
   * Returns the path to the worktree
   */
  async ensureWorktree(
    branchName: string,
    commitHash: string,
    repoRoot?: string
  ): Promise<string> {
    const root = repoRoot || (await this.getRepoRoot());

    // Generate a safe directory name
    const safeBranchName = branchName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const worktreePath = join(this.baseWorktreePath, `${safeBranchName}-${commitHash.substring(0, 7)}`);

    // Check if this worktree already exists
    const existingWorktrees = await this.listWorktrees(root);
    const existing = existingWorktrees.find(
      (w) => w.commit === commitHash || w.path === worktreePath
    );

    if (existing) {
      console.log(`Worktree already exists at: ${existing.path}`);
      return existing.path;
    }

    // If the directory exists but is not in worktree list, prune and retry
    if (existsSync(worktreePath)) {
      console.log('Stale worktree detected, pruning...');
      await this.pruneWorktrees(root);
    }

    // Create new worktree in detached HEAD mode
    try {
      console.log(`Creating worktree at: ${worktreePath}`);
      await execa(
        'git',
        ['worktree', 'add', '--detach', worktreePath, commitHash],
        { cwd: root }
      );
      console.log(`✓ Worktree created successfully`);
      return worktreePath;
    } catch (error: any) {
      // If creation fails due to lock, try pruning and retry once
      if (error.message?.includes('locked') || error.message?.includes('already exists')) {
        console.log('Lock detected, pruning and retrying...');
        await this.pruneWorktrees(root);

        // Retry
        await execa(
          'git',
          ['worktree', 'add', '--detach', worktreePath, commitHash],
          { cwd: root }
        );
        return worktreePath;
      }

      throw new Error(`Failed to create worktree: ${error.message}`);
    }
  }

  /**
   * Remove a worktree
   */
  async removeWorktree(worktreePath: string, repoRoot?: string): Promise<void> {
    const root = repoRoot || (await this.getRepoRoot());

    try {
      await execa('git', ['worktree', 'remove', worktreePath, '--force'], {
        cwd: root,
      });
      console.log(`✓ Worktree removed: ${worktreePath}`);
    } catch (error: any) {
      throw new Error(`Failed to remove worktree: ${error.message}`);
    }
  }

  /**
   * Get repository remote URL
   */
  async getRemoteUrl(repoRoot?: string): Promise<string> {
    const root = repoRoot || (await this.getRepoRoot());

    try {
      const { stdout } = await execa('git', ['remote', 'get-url', 'origin'], {
        cwd: root,
      });
      return stdout.trim();
    } catch (error) {
      throw new Error('Failed to get remote URL');
    }
  }

  /**
   * Parse GitHub owner and repo from remote URL
   */
  parseGitHubRepo(remoteUrl: string): { owner: string; repo: string } | null {
    // Match both HTTPS and SSH URLs
    const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
    const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/([^/.]+)/);

    const match = httpsMatch || sshMatch;
    if (!match) return null;

    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, ''),
    };
  }

  /**
   * Clone or update a repository for review purposes
   * Returns the path to the cloned/updated repository
   */
  async cloneOrUpdateRepo(owner: string, repo: string, targetPath: string): Promise<string> {
    const repoUrl = `https://github.com/${owner}/${repo}.git`;

    // Check if repository already exists
    if (existsSync(join(targetPath, '.git'))) {
      console.log(`Repository already exists at ${targetPath}, fetching updates...`);

      try {
        // Fetch all branches and PRs
        await execa('git', ['fetch', '--all', '--prune'], { cwd: targetPath });
        await execa('git', ['fetch', 'origin', '+refs/pull/*/head:refs/remotes/origin/pr/*'], { cwd: targetPath });
        console.log('✓ Repository updated');
        return targetPath;
      } catch (error: any) {
        throw new Error(`Failed to update repository: ${error.message}`);
      }
    }

    // Clone the repository
    console.log(`Cloning repository ${owner}/${repo} to ${targetPath}...`);

    try {
      // Ensure parent directory exists
      const parentDir = join(targetPath, '..');
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      // Clone with --bare to save space, or normal clone
      await execa('git', ['clone', repoUrl, targetPath]);

      // Fetch all PR refs
      await execa('git', ['fetch', 'origin', '+refs/pull/*/head:refs/remotes/origin/pr/*'], { cwd: targetPath });

      console.log('✓ Repository cloned successfully');
      return targetPath;
    } catch (error: any) {
      throw new Error(`Failed to clone repository: ${error.message}`);
    }
  }

  /**
   * Fetch a specific PR into a local repository
   */
  async fetchPR(owner: string, repo: string, prNumber: number, repoPath: string): Promise<void> {
    try {
      console.log(`Fetching PR #${prNumber} in ${repoPath}...`);

      // Fetch the PR ref
      await execa('git', [
        'fetch',
        'origin',
        `pull/${prNumber}/head:pr-${prNumber}`
      ], { cwd: repoPath });

      console.log(`✓ PR #${prNumber} fetched successfully`);
    } catch (error: any) {
      throw new Error(`Failed to fetch PR: ${error.message}`);
    }
  }
}
