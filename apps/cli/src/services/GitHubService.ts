import { Octokit } from '@octokit/rest';

export interface PullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  headBranch: string;
  baseBranch: string;
  headSha: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export class GitHubService {
  private octokit: Octokit | null = null;

  constructor(token?: string) {
    if (token) {
      this.octokit = new Octokit({ auth: token });
    }
  }

  /**
   * Initialize with GitHub token
   */
  setToken(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Check if GitHub token is configured
   */
  isAuthenticated(): boolean {
    return this.octokit !== null;
  }

  /**
   * Get list of pull requests for a repository
   */
  async getPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open'
  ): Promise<PullRequest[]> {
    if (!this.octokit) {
      throw new Error('GitHub token not configured. Set GITHUB_TOKEN environment variable.');
    }

    try {
      const { data } = await this.octokit.pulls.list({
        owner,
        repo,
        state,
        per_page: 100,
        sort: 'updated',
        direction: 'desc',
      });

      return data.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state as 'open' | 'closed',
        author: pr.user?.login || 'unknown',
        headBranch: pr.head.ref,
        baseBranch: pr.base.ref,
        headSha: pr.head.sha,
        url: pr.html_url,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      }));
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error('Invalid GitHub token. Please check your credentials.');
      }
      if (error.status === 404) {
        throw new Error(`Repository ${owner}/${repo} not found or not accessible.`);
      }
      throw new Error(`Failed to fetch pull requests: ${error.message}`);
    }
  }

  /**
   * Get details of a specific pull request
   */
  async getPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PullRequest> {
    if (!this.octokit) {
      throw new Error('GitHub token not configured. Set GITHUB_TOKEN environment variable.');
    }

    try {
      const { data: pr } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      return {
        number: pr.number,
        title: pr.title,
        state: pr.state as 'open' | 'closed',
        author: pr.user?.login || 'unknown',
        headBranch: pr.head.ref,
        baseBranch: pr.base.ref,
        headSha: pr.head.sha,
        url: pr.html_url,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      };
    } catch (error: any) {
      if (error.status === 404) {
        throw new Error(`Pull request #${prNumber} not found.`);
      }
      throw new Error(`Failed to fetch pull request: ${error.message}`);
    }
  }

  /**
   * Get files changed in a pull request
   */
  async getPullRequestFiles(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<Array<{ filename: string; status: string; additions: number; deletions: number }>> {
    if (!this.octokit) {
      throw new Error('GitHub token not configured. Set GITHUB_TOKEN environment variable.');
    }

    try {
      const { data } = await this.octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      });

      return data.map((file) => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
      }));
    } catch (error: any) {
      throw new Error(`Failed to fetch PR files: ${error.message}`);
    }
  }
}
