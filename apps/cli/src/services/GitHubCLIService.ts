import { execa } from 'execa';

export interface GitHubUser {
  login: string;
  name: string;
  email: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  url: string;
  repository: string;
  repositoryUrl: string;
  headRefName: string;
  baseRefName: string;
  headRefOid: string;
  createdAt: string;
  updatedAt: string;
  commentCount?: number;
  reviewCount?: number;
  fileCount?: number;
}

export interface PRFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export class GitHubCLIService {
  private ghAvailable: boolean | null = null;

  constructor() {
    this.checkGitHubCLI();
  }

  /**
   * Check if GitHub CLI is installed
   */
  private async checkGitHubCLI(): Promise<void> {
    try {
      await execa('which', ['gh']);
      this.ghAvailable = true;
      console.log('[GitHub] GitHub CLI detected');
    } catch (error) {
      this.ghAvailable = false;
      console.log('[GitHub] GitHub CLI not found in PATH');
    }
  }

  /**
   * Check if GitHub CLI is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    if (this.ghAvailable === null) {
      await this.checkGitHubCLI();
    }

    if (!this.ghAvailable) {
      return false;
    }

    try {
      const { exitCode } = await execa('gh', ['auth', 'status']);
      return exitCode === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get authenticated user info
   */
  async getCurrentUser(): Promise<GitHubUser | null> {
    try {
      const { stdout } = await execa('gh', ['api', '/user']);
      const user = JSON.parse(stdout);

      return {
        login: user.login,
        name: user.name || user.login,
        email: user.email || '',
      };
    } catch (error) {
      console.error('[GitHub] Failed to get current user:', error);
      return null;
    }
  }

  /**
   * Get PRs where user is requested as reviewer
   */
  async getReviewRequestedPRs(): Promise<GitHubPR[]> {
    try {
      // First use gh search to get the list of PRs
      const { stdout } = await execa('gh', [
        'search',
        'prs',
        '--review-requested=@me',
        '--state=open',
        '--json=number,title,body,state,author,url,repository,createdAt,updatedAt',
        '--limit=100',
      ]);

      const prs = JSON.parse(stdout);

      // Use GraphQL to fetch detailed info including comment counts
      const detailedPRs = await Promise.all(
        prs.map(async (pr: any) => {
          try {
            const [owner, repo] = pr.repository.nameWithOwner.split('/');

            // Use GraphQL to get PR details with comment counts and file count
            const query = `
              query($owner: String!, $repo: String!, $number: Int!) {
                repository(owner: $owner, name: $repo) {
                  pullRequest(number: $number) {
                    number
                    title
                    body
                    state
                    author {
                      login
                    }
                    url
                    headRefName
                    baseRefName
                    headRefOid
                    createdAt
                    updatedAt
                    comments {
                      totalCount
                    }
                    reviews {
                      totalCount
                    }
                    files {
                      totalCount
                    }
                  }
                }
              }
            `;

            const { stdout: graphqlResult } = await execa('gh', [
              'api',
              'graphql',
              '-f',
              `query=${query}`,
              '-F',
              `owner=${owner}`,
              '-F',
              `repo=${repo}`,
              '-F',
              `number=${pr.number}`,
            ]);

            const result = JSON.parse(graphqlResult);
            const prData = result.data.repository.pullRequest;

            return {
              number: prData.number,
              title: prData.title,
              body: prData.body || '',
              state: prData.state,
              author: prData.author.login,
              url: prData.url,
              repository: pr.repository.nameWithOwner,
              repositoryUrl: `https://github.com/${pr.repository.nameWithOwner}`,
              headRefName: prData.headRefName,
              baseRefName: prData.baseRefName,
              headRefOid: prData.headRefOid,
              createdAt: prData.createdAt,
              updatedAt: prData.updatedAt,
              commentCount: prData.comments.totalCount,
              reviewCount: prData.reviews.totalCount,
              fileCount: prData.files.totalCount,
            };
          } catch (error) {
            console.error(`[GitHub] Failed to get details for PR #${pr.number}:`, error);
            // Return basic info if detailed fetch fails
            return {
              number: pr.number,
              title: pr.title,
              body: pr.body || '',
              state: pr.state,
              author: pr.author.login,
              url: pr.url,
              repository: pr.repository.nameWithOwner,
              repositoryUrl: `https://github.com/${pr.repository.nameWithOwner}`,
              headRefName: '',
              baseRefName: '',
              headRefOid: '',
              createdAt: pr.createdAt,
              updatedAt: pr.updatedAt,
              commentCount: 0,
              reviewCount: 0,
            };
          }
        })
      );

      return detailedPRs.filter((pr): pr is GitHubPR => pr !== null);
    } catch (error: any) {
      console.error('[GitHub] Failed to get review-requested PRs:', error);
      throw new Error(`Failed to fetch PRs: ${error.message}`);
    }
  }

  /**
   * Get PRs where user is involved (author, assignee, mentioned, or reviewer)
   */
  async getInvolvedPRs(): Promise<GitHubPR[]> {
    try {
      const { stdout } = await execa('gh', [
        'search',
        'prs',
        '--involves=@me',
        '--state=open',
        '--json=number,title,body,state,author,url,repository,createdAt,updatedAt',
        '--limit=100',
      ]);

      const prs = JSON.parse(stdout);

      // Use GraphQL to fetch detailed info including comment counts
      const detailedPRs = await Promise.all(
        prs.map(async (pr: any) => {
          try {
            const [owner, repo] = pr.repository.nameWithOwner.split('/');

            // Use GraphQL to get PR details with comment counts and file count
            const query = `
              query($owner: String!, $repo: String!, $number: Int!) {
                repository(owner: $owner, name: $repo) {
                  pullRequest(number: $number) {
                    number
                    title
                    body
                    state
                    author {
                      login
                    }
                    url
                    headRefName
                    baseRefName
                    headRefOid
                    createdAt
                    updatedAt
                    comments {
                      totalCount
                    }
                    reviews {
                      totalCount
                    }
                    files {
                      totalCount
                    }
                  }
                }
              }
            `;

            const { stdout: graphqlResult } = await execa('gh', [
              'api',
              'graphql',
              '-f',
              `query=${query}`,
              '-F',
              `owner=${owner}`,
              '-F',
              `repo=${repo}`,
              '-F',
              `number=${pr.number}`,
            ]);

            const result = JSON.parse(graphqlResult);
            const prData = result.data.repository.pullRequest;

            return {
              number: prData.number,
              title: prData.title,
              body: prData.body || '',
              state: prData.state,
              author: prData.author.login,
              url: prData.url,
              repository: pr.repository.nameWithOwner,
              repositoryUrl: `https://github.com/${pr.repository.nameWithOwner}`,
              headRefName: prData.headRefName,
              baseRefName: prData.baseRefName,
              headRefOid: prData.headRefOid,
              createdAt: prData.createdAt,
              updatedAt: prData.updatedAt,
              commentCount: prData.comments.totalCount,
              reviewCount: prData.reviews.totalCount,
              fileCount: prData.files.totalCount,
            };
          } catch (error) {
            console.error(`[GitHub] Failed to get details for PR #${pr.number}:`, error);
            // Return basic info if detailed fetch fails
            return {
              number: pr.number,
              title: pr.title,
              body: pr.body || '',
              state: pr.state,
              author: pr.author.login,
              url: pr.url,
              repository: pr.repository.nameWithOwner,
              repositoryUrl: `https://github.com/${pr.repository.nameWithOwner}`,
              headRefName: '',
              baseRefName: '',
              headRefOid: '',
              createdAt: pr.createdAt,
              updatedAt: pr.updatedAt,
              commentCount: 0,
              reviewCount: 0,
            };
          }
        })
      );

      return detailedPRs.filter((pr): pr is GitHubPR => pr !== null);
    } catch (error: any) {
      console.error('[GitHub] Failed to get involved PRs:', error);
      throw new Error(`Failed to fetch PRs: ${error.message}`);
    }
  }

  /**
   * Get PR details
   */
  async getPRDetails(owner: string, repo: string, prNumber: number): Promise<GitHubPR | null> {
    try {
      // Use GraphQL to get PR details with comment counts
      const query = `
        query($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $number) {
              number
              title
              body
              state
              author {
                login
              }
              url
              headRefName
              baseRefName
              headRefOid
              createdAt
              updatedAt
              comments {
                totalCount
              }
              reviews {
                totalCount
              }
            }
          }
        }
      `;

      const { stdout } = await execa('gh', [
        'api',
        'graphql',
        '-f',
        `query=${query}`,
        '-F',
        `owner=${owner}`,
        '-F',
        `repo=${repo}`,
        '-F',
        `number=${prNumber}`,
      ]);

      const result = JSON.parse(stdout);
      const pr = result.data.repository.pullRequest;

      return {
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        state: pr.state,
        author: pr.author.login,
        url: pr.url,
        repository: `${owner}/${repo}`,
        repositoryUrl: `https://github.com/${owner}/${repo}`,
        headRefName: pr.headRefName,
        baseRefName: pr.baseRefName,
        headRefOid: pr.headRefOid,
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
        commentCount: pr.comments.totalCount,
        reviewCount: pr.reviews.totalCount,
      };
    } catch (error: any) {
      console.error('[GitHub] Failed to get PR details:', error);
      return null;
    }
  }

  /**
   * Get changed files in a PR
   */
  async getPRFiles(owner: string, repo: string, prNumber: number): Promise<PRFile[]> {
    try {
      const { stdout } = await execa('gh', [
        'api',
        `/repos/${owner}/${repo}/pulls/${prNumber}/files`,
        '--paginate',
      ]);

      const files = JSON.parse(stdout);

      return files.map((file: any) => ({
        path: file.filename,
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
      }));
    } catch (error: any) {
      console.error('[GitHub] Failed to get PR files:', error);
      throw new Error(`Failed to fetch PR files: ${error.message}`);
    }
  }

  /**
   * Add a comment to a PR
   */
  async addPRComment(owner: string, repo: string, prNumber: number, body: string): Promise<void> {
    try {
      await execa('gh', [
        'pr',
        'comment',
        prNumber.toString(),
        '--repo',
        `${owner}/${repo}`,
        '--body',
        body,
      ]);

      console.log('[GitHub] Comment added successfully');
    } catch (error: any) {
      console.error('[GitHub] Failed to add comment:', error);
      throw new Error(`Failed to add comment: ${error.message}`);
    }
  }

  /**
   * Add a review comment to a specific file/line in a PR
   */
  async addPRReviewComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    commitId: string,
    path: string,
    line: number
  ): Promise<void> {
    try {
      await execa('gh', [
        'api',
        `/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
        '-X',
        'POST',
        '-f',
        `body=${body}`,
        '-f',
        `commit_id=${commitId}`,
        '-f',
        `path=${path}`,
        '-F',
        `line=${line}`,
      ]);

      console.log('[GitHub] Review comment added successfully');
    } catch (error: any) {
      console.error('[GitHub] Failed to add review comment:', error);
      throw new Error(`Failed to add review comment: ${error.message}`);
    }
  }

  /**
   * Reply to a review comment
   */
  async addPRCommentReply(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    inReplyTo: number
  ): Promise<void> {
    try {
      await execa('gh', [
        'api',
        `/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
        '-X',
        'POST',
        '-f',
        `body=${body}`,
        '-F',
        `in_reply_to=${inReplyTo}`,
      ]);

      console.log('[GitHub] Comment reply added successfully');
    } catch (error: any) {
      console.error('[GitHub] Failed to add comment reply:', error);
      throw new Error(`Failed to add comment reply: ${error.message}`);
    }
  }

  /**
   * Get PR commits
   */
  async getPRCommits(owner: string, repo: string, prNumber: number): Promise<any[]> {
    try {
      const { stdout } = await execa('gh', [
        'api',
        `/repos/${owner}/${repo}/pulls/${prNumber}/commits`,
        '--paginate',
      ]);

      const commits = JSON.parse(stdout);

      // Transform to a cleaner format
      return commits.map((commit: any) => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author.name || commit.author?.login || 'Unknown',
        date: commit.commit.author.date,
        url: commit.html_url,
      }));
    } catch (error: any) {
      console.error('[GitHub] Failed to get PR commits:', error);
      throw new Error(`Failed to fetch PR commits: ${error.message}`);
    }
  }

  /**
   * Get PR conversation (comments, reviews, timeline)
   */
  async getPRConversation(owner: string, repo: string, prNumber: number): Promise<any> {
    try {
      console.log(`[GitHub] Fetching conversation for ${owner}/${repo}#${prNumber}`);

      const query = `
        query($owner: String!, $repo: String!, $prNumber: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $prNumber) {
              author {
                login
              }
              timelineItems(first: 100, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW]) {
                nodes {
                  __typename
                  ... on IssueComment {
                    id
                    body
                    author {
                      login
                      avatarUrl
                    }
                    createdAt
                    updatedAt
                    reactions(first: 10) {
                      nodes {
                        content
                        user {
                          login
                        }
                      }
                    }
                  }
                  ... on PullRequestReview {
                    id
                    body
                    state
                    author {
                      login
                      avatarUrl
                    }
                    createdAt
                    comments(first: 50) {
                      nodes {
                        id
                        body
                        path
                        position
                        line
                        diffHunk
                        author {
                          login
                          avatarUrl
                        }
                        createdAt
                        reactions(first: 10) {
                          nodes {
                            content
                            user {
                              login
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  comments(first: 50) {
                    nodes {
                      id
                      body
                      path
                      line
                      diffHunk
                      author {
                        login
                        avatarUrl
                      }
                      createdAt
                      reactions(first: 10) {
                        nodes {
                          content
                          user {
                            login
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const { stdout } = await execa('gh', [
        'api',
        'graphql',
        '-f',
        `query=${query}`,
        '-F',
        `owner=${owner}`,
        '-F',
        `repo=${repo}`,
        '-F',
        `prNumber=${prNumber}`,
      ]);

      const response = JSON.parse(stdout);

      console.log(`[GitHub] Raw response:`, JSON.stringify(response, null, 2));

      // Check for GraphQL errors
      if (response.errors) {
        console.error('[GitHub] GraphQL errors:', response.errors);
        throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
      }

      // Check if data exists
      if (!response.data || !response.data.repository) {
        console.error('[GitHub] No repository data in response');
        throw new Error('Repository not found or no access');
      }

      if (!response.data.repository.pullRequest) {
        console.error('[GitHub] No pull request data in response');
        throw new Error('Pull request not found');
      }

      const prAuthor = response.data.repository.pullRequest.author?.login || 'unknown';
      const timelineItems = response.data.repository.pullRequest.timelineItems?.nodes || [];
      const reviewThreads = response.data.repository.pullRequest.reviewThreads?.nodes || [];

      console.log(`[GitHub] Found ${timelineItems.length} timeline items and ${reviewThreads.length} review threads for PR by ${prAuthor}`);

      // Add __typename to review threads if not present
      reviewThreads.forEach((thread: any) => {
        if (!thread.__typename) {
          thread.__typename = 'PullRequestReviewThread';
        }
      });

      // Combine timeline items and review threads
      const conversation = [...timelineItems, ...reviewThreads];

      // Log each conversation item type and structure
      conversation.forEach((item: any, index: number) => {
        console.log(`[GitHub] Item ${index}: Type=${item.__typename}`);

        if (item.__typename === 'PullRequestReview') {
          const commentCount = item.comments?.nodes?.length || 0;
          console.log(`[GitHub]   - Review has ${commentCount} comments`);
          if (commentCount > 0) {
            item.comments.nodes.forEach((comment: any, idx: number) => {
              console.log(`[GitHub]     Comment ${idx}: path=${comment.path}, line=${comment.line}, author=${comment.author?.login}`);
            });
          }
        }

        if (item.__typename === 'PullRequestReviewThread') {
          const commentCount = item.comments?.nodes?.length || 0;
          console.log(`[GitHub]   - Thread has ${commentCount} comments, resolved=${item.isResolved}`);
          if (commentCount > 0) {
            item.comments.nodes.forEach((comment: any, idx: number) => {
              console.log(`[GitHub]     Comment ${idx}: path=${comment.path}, line=${comment.line}, author=${comment.author?.login}`);
            });
          }
        }

        if (item.__typename === 'IssueComment') {
          console.log(`[GitHub]   - Comment by ${item.author?.login}`);
        }
      });

      return {
        prAuthor,
        conversation,
      };
    } catch (error: any) {
      console.error('[GitHub] Failed to get PR conversation:', error);
      console.error('[GitHub] Error details:', error.stderr || error.message);
      throw new Error(`Failed to fetch PR conversation: ${error.message}`);
    }
  }

  /**
   * Checkout PR branch locally (for review)
   */
  async checkoutPR(owner: string, repo: string, prNumber: number, targetDir: string): Promise<void> {
    try {
      // This will be handled by GitService with worktree
      // Just providing the interface for future use
      await execa('gh', ['pr', 'checkout', prNumber.toString(), '--repo', `${owner}/${repo}`], {
        cwd: targetDir,
      });

      console.log('[GitHub] PR checked out successfully');
    } catch (error: any) {
      console.error('[GitHub] Failed to checkout PR:', error);
      throw new Error(`Failed to checkout PR: ${error.message}`);
    }
  }

  /**
   * Add a reaction to a comment (issue comment or review comment)
   * @param owner Repository owner
   * @param repo Repository name
   * @param commentId The node ID of the comment
   * @param reactionContent The reaction content (e.g., THUMBS_UP, HEART, ROCKET, etc.)
   */
  async addReaction(owner: string, repo: string, commentId: string, reactionContent: string): Promise<void> {
    try {
      const mutation = `
        mutation {
          addReaction(input: {subjectId: "${commentId}", content: ${reactionContent}}) {
            reaction {
              id
              content
            }
          }
        }
      `;

      await execa('gh', [
        'api',
        'graphql',
        '-f',
        `query=${mutation}`,
      ]);

      console.log(`[GitHub] Reaction ${reactionContent} added to comment ${commentId}`);
    } catch (error: any) {
      console.error('[GitHub] Failed to add reaction:', error);
      console.error('[GitHub] Error details:', error.stderr || error.message);
      throw new Error(`Failed to add reaction: ${error.message}`);
    }
  }

  /**
   * Remove a reaction from a comment
   * @param owner Repository owner
   * @param repo Repository name
   * @param commentId The node ID of the comment
   * @param reactionContent The reaction content to remove
   */
  async removeReaction(owner: string, repo: string, commentId: string, reactionContent: string): Promise<void> {
    try {
      const mutation = `
        mutation {
          removeReaction(input: {subjectId: "${commentId}", content: ${reactionContent}}) {
            reaction {
              id
              content
            }
          }
        }
      `;

      await execa('gh', [
        'api',
        'graphql',
        '-f',
        `query=${mutation}`,
      ]);

      console.log(`[GitHub] Reaction ${reactionContent} removed from comment ${commentId}`);
    } catch (error: any) {
      console.error('[GitHub] Failed to remove reaction:', error);
      console.error('[GitHub] Error details:', error.stderr || error.message);
      throw new Error(`Failed to remove reaction: ${error.message}`);
    }
  }

  /**
   * Submit a full PR review with multiple comments
   * @param owner Repository owner
   * @param repo Repository name
   * @param prNumber PR number
   * @param event Review event type (COMMENT, APPROVE, REQUEST_CHANGES)
   * @param body Overall review comment (optional)
   * @param comments Array of line-specific comments
   */
  async submitPRReview(
    owner: string,
    repo: string,
    prNumber: number,
    event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES',
    body: string,
    comments: Array<{ path: string; line: number; body: string }>
  ): Promise<void> {
    try {
      // Step 1: Get HEAD commit SHA
      const { stdout: prDataJson } = await execa('gh', [
        'api',
        `/repos/${owner}/${repo}/pulls/${prNumber}`,
        '--jq',
        '.head.sha',
      ]);
      const headSha = prDataJson.trim();

      console.log('[GitHub] Creating review with', comments.length, 'comments');
      console.log('[GitHub] HEAD SHA:', headSha);
      console.log('[GitHub] Event:', event);

      // Step 2: Create review with comments
      const reviewData = {
        commit_id: headSha,
        event: event,
        body: body || '',
        comments: comments.map(c => ({
          path: c.path,
          line: c.line,
          body: c.body,
        })),
      };

      await execa(
        'gh',
        [
          'api',
          `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
          '-X',
          'POST',
          '--input',
          '-',
        ],
        {
          input: JSON.stringify(reviewData),
        }
      );

      console.log('[GitHub] Review submitted successfully');
    } catch (error: any) {
      console.error('[GitHub] Failed to submit review:', error);
      console.error('[GitHub] Error details:', error.stderr || error.message);
      throw new Error(`Failed to submit PR review: ${error.message}`);
    }
  }

  /**
   * Get file content from GitHub at a specific ref (branch/commit)
   */
  async getFileContentFromGitHub(
    owner: string,
    repo: string,
    filePath: string,
    ref: string
  ): Promise<string> {
    try {
      console.log(`[GitHub] Fetching ${filePath} from ${owner}/${repo} at ${ref}`);

      const { stdout } = await execa('gh', [
        'api',
        `/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`,
        '--jq',
        '.content | @base64d',
      ]);

      return stdout;
    } catch (error: any) {
      console.error('[GitHub] Failed to fetch file content:', error);
      // File might not exist at this ref
      if (error.stderr?.includes('404')) {
        throw new Error(`File not found: ${filePath} at ${ref}`);
      }
      throw new Error(`Failed to fetch file from GitHub: ${error.message}`);
    }
  }
}
