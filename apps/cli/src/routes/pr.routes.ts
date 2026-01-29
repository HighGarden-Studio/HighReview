import { FastifyInstance } from 'fastify';
import { GitService } from '../services/GitService.js';
import { GitHubCLIService } from '../services/GitHubCLIService.js';
import { DatabaseService } from '../services/DatabaseService.js';
import { ConfigService } from '../services/ConfigService.js';
import { AIReviewService } from '../services/AIReviewService.js';
import { ProjectIndexService } from '../services/ProjectIndexService.js';

export async function prRoutes(fastify: FastifyInstance) {
  const gitService = new GitService();
  const githubService = new GitHubCLIService();
  const dbService = DatabaseService.getInstance();
  const configService = new ConfigService();
  const aiReviewService = new AIReviewService();
  const indexService = new ProjectIndexService();

  /**
   * GET /api/prs/review-requested
   * Get PRs where current user is requested as reviewer
   */
  fastify.get('/api/prs/review-requested', async (request, reply) => {
    try {
      const authenticated = await githubService.isAuthenticated();

      if (!authenticated) {
        return reply.code(401).send({
          error: 'Not authenticated',
          message: 'Please run: gh auth login',
        });
      }

      // Fetch review-requested PRs from GitHub
      const prs = await githubService.getReviewRequestedPRs();

      // Save to database for caching
      for (const pr of prs) {
        const [owner, repo] = pr.repository.split('/');
        dbService.savePullRequest({
          prNumber: pr.number,
          owner,
          repo,
          title: pr.title,
          body: pr.body,
          state: pr.state,
          baseBranch: pr.baseRefName,
          headBranch: pr.headRefName,
          headSha: pr.headRefOid,
          author: pr.author,
          url: pr.url,
          reviewStatus: 'pending',
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
        });
      }

      return reply.send({
        pullRequests: prs,
        count: prs.length,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to fetch review-requested PRs',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/prs/involved
   * Get PRs where current user is involved
   */
  fastify.get('/api/prs/involved', async (request, reply) => {
    try {
      const authenticated = await githubService.isAuthenticated();

      if (!authenticated) {
        return reply.code(401).send({
          error: 'Not authenticated',
          message: 'Please run: gh auth login',
        });
      }

      const prs = await githubService.getInvolvedPRs();

      return reply.send({
        pullRequests: prs,
        count: prs.length,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to fetch involved PRs',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/prs/:owner/:repo/:number
   * Get details of a specific pull request
   */
  fastify.get<{ Params: { owner: string; repo: string; number: string } }>(
    '/api/prs/:owner/:repo/:number',
    async (request, reply) => {
      try {
        const { owner, repo, number } = request.params;
        const prNumber = parseInt(number);

        if (isNaN(prNumber)) {
          return reply.code(400).send({ error: 'Invalid PR number' });
        }

        const authenticated = await githubService.isAuthenticated();

        if (!authenticated) {
          return reply.code(401).send({
            error: 'Not authenticated',
            message: 'Please run: gh auth login',
          });
        }

        // Fetch PR details from GitHub
        const pr = await githubService.getPRDetails(owner, repo, prNumber);

        if (!pr) {
          return reply.code(404).send({
            error: 'Pull request not found',
          });
        }

        // Fetch changed files
        const files = await githubService.getPRFiles(owner, repo, prNumber);

        // Fetch commits
        const commits = await githubService.getPRCommits(owner, repo, prNumber);

        // Save to database
        dbService.savePullRequest({
          prNumber: pr.number,
          owner,
          repo,
          title: pr.title,
          body: pr.body,
          state: pr.state,
          baseBranch: pr.baseRefName,
          headBranch: pr.headRefName,
          headSha: pr.headRefOid,
          author: pr.author,
          url: pr.url,
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
        });

        return reply.send({
          pullRequest: pr,
          files,
          commits,
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to fetch pull request details',
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/prs/:owner/:repo/:number/setup-review
   * Setup a worktree for reviewing a pull request
   */
  fastify.post<{ Params: { owner: string; repo: string; number: string } }>(
    '/api/prs/:owner/:repo/:number/setup-review',
    async (request, reply) => {
      try {
        const { owner, repo, number } = request.params;
        const prNumber = parseInt(number);

        if (isNaN(prNumber)) {
          return reply.code(400).send({ error: 'Invalid PR number' });
        }

        const authenticated = await githubService.isAuthenticated();

        if (!authenticated) {
          return reply.code(401).send({
            error: 'Not authenticated',
          });
        }

        // Fetch PR details
        const pr = await githubService.getPRDetails(owner, repo, prNumber);

        if (!pr) {
          return reply.code(404).send({
            error: 'Pull request not found',
          });
        }

        // Get or clone the repository for review
        const repoPath = configService.getRepoPath(owner, repo);

        // Clone or update the repository
        await gitService.cloneOrUpdateRepo(owner, repo, repoPath);

        // Fetch the specific PR
        await gitService.fetchPR(owner, repo, prNumber, repoPath);

        // Create worktree for the PR
        const worktreePath = await gitService.ensureWorktree(
          `pr-${prNumber}`,
          pr.headRefOid,
          repoPath
        );

        // Start project indexing asynchronously (don't wait)
        const branch = pr.headRefName;
        indexService.indexProject(worktreePath, branch).catch((error) => {
          console.error('[PR Setup] Failed to index project:', error);
        });

        return reply.send({
          success: true,
          pullRequest: pr,
          worktreePath,
          repoPath,
          message: `Review environment ready at ${worktreePath}`,
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to setup review environment',
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/prs/:owner/:repo/:number/ai-review
   * Perform AI code review on a pull request
   */
  fastify.post<{
    Params: { owner: string; repo: string; number: string };
    Body: { worktreePath: string; baseBranch: string; language?: 'en' | 'ko' | 'ja' | 'zh'; options?: any };
  }>('/api/prs/:owner/:repo/:number/ai-review', async (request, reply) => {
    try {
      const { owner, repo, number } = request.params;
      const { worktreePath, baseBranch, language = 'en', options } = request.body;
      const prNumber = parseInt(number);

      if (isNaN(prNumber)) {
        return reply.code(400).send({ error: 'Invalid PR number' });
      }

      if (!worktreePath || !baseBranch) {
        return reply.code(400).send({
          error: 'Invalid request',
          message: 'worktreePath and baseBranch are required',
        });
      }

      const authenticated = await githubService.isAuthenticated();

      if (!authenticated) {
        return reply.code(401).send({
          error: 'Not authenticated',
        });
      }

      // Perform AI review
      console.log('[PR AI Review] Starting review with options:', {
        worktreePath,
        baseBranch,
        language,
        options: Object.keys(options || {})
      });

      const reviewResult = await aiReviewService.reviewPR(worktreePath, baseBranch, language, options);

      console.log('[PR AI Review] Review completed:', {
        filesReviewed: reviewResult.filesReviewed,
        totalIssues: reviewResult.totalIssues
      });

      return reply.send({
        success: true,
        review: reviewResult,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to perform AI review',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/prs/:owner/:repo/:number/review
   * Submit a PR review with comments
   */
  fastify.post<{
    Params: { owner: string; repo: string; number: string };
    Body: {
      event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';
      body?: string;
      comments: Array<{ path: string; line: number; body: string }>;
    };
  }>('/api/prs/:owner/:repo/:number/review', async (request, reply) => {
    try {
      const { owner, repo, number } = request.params;
      const { event, body = '', comments } = request.body;
      const prNumber = parseInt(number);

      if (isNaN(prNumber)) {
        return reply.code(400).send({ error: 'Invalid PR number' });
      }

      if (!event || !['COMMENT', 'APPROVE', 'REQUEST_CHANGES'].includes(event)) {
        return reply.code(400).send({
          error: 'Invalid request',
          message: 'event must be COMMENT, APPROVE, or REQUEST_CHANGES',
        });
      }

      if (!comments || !Array.isArray(comments)) {
        return reply.code(400).send({
          error: 'Invalid request',
          message: 'comments array is required',
        });
      }

      const authenticated = await githubService.isAuthenticated();

      if (!authenticated) {
        return reply.code(401).send({
          error: 'Not authenticated',
        });
      }

      // Submit review
      await githubService.submitPRReview(owner, repo, prNumber, event, body, comments);

      return reply.send({
        success: true,
        message: 'Review submitted successfully',
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to submit review',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/prs/:owner/:repo/:number/conversation
   * Get conversation (comments, reviews) for a pull request
   */
  fastify.get<{ Params: { owner: string; repo: string; number: string } }>(
    '/api/prs/:owner/:repo/:number/conversation',
    async (request, reply) => {
      try {
        const { owner, repo, number } = request.params;
        const prNumber = parseInt(number);

        if (isNaN(prNumber)) {
          return reply.code(400).send({ error: 'Invalid PR number' });
        }

        const authenticated = await githubService.isAuthenticated();

        if (!authenticated) {
          return reply.code(401).send({
            error: 'Not authenticated',
            message: 'Please run: gh auth login',
          });
        }

        // Fetch conversation from GitHub
        const conversationData = await githubService.getPRConversation(owner, repo, prNumber);

        return reply.send(conversationData);
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to fetch conversation',
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/prs/:owner/:repo/:number/comment
   * Add a comment to a pull request
   */
  fastify.post<{
    Params: { owner: string; repo: string; number: string };
    Body: { body: string };
  }>('/api/prs/:owner/:repo/:number/comment', async (request, reply) => {
    try {
      const { owner, repo, number } = request.params;
      const { body } = request.body;
      const prNumber = parseInt(number);

      if (isNaN(prNumber)) {
        return reply.code(400).send({ error: 'Invalid PR number' });
      }

      if (!body || body.trim() === '') {
        return reply.code(400).send({
          error: 'Invalid request',
          message: 'Comment body is required',
        });
      }

      const authenticated = await githubService.isAuthenticated();

      if (!authenticated) {
        return reply.code(401).send({
          error: 'Not authenticated',
        });
      }

      await githubService.addPRComment(owner, repo, prNumber, body);

      return reply.send({
        success: true,
        message: 'Comment added successfully',
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to add comment',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/prs/:owner/:repo/:number/review-comment
   * Add a review comment to a specific line in a PR
   */
  fastify.post<{
    Params: { owner: string; repo: string; number: string };
    Body: { body: string; commitId: string; path: string; line: number };
  }>('/api/prs/:owner/:repo/:number/review-comment', async (request, reply) => {
    try {
      const { owner, repo, number } = request.params;
      const { body, commitId, path, line } = request.body;
      const prNumber = parseInt(number);

      if (isNaN(prNumber)) {
        return reply.code(400).send({ error: 'Invalid PR number' });
      }

      if (!body || !commitId || !path || !line) {
        return reply.code(400).send({
          error: 'Invalid request',
          message: 'body, commitId, path, and line are required',
        });
      }

      const authenticated = await githubService.isAuthenticated();

      if (!authenticated) {
        return reply.code(401).send({
          error: 'Not authenticated',
        });
      }

      await githubService.addPRReviewComment(owner, repo, prNumber, body, commitId, path, line);

      return reply.send({
        success: true,
        message: 'Review comment added successfully',
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to add review comment',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/prs/:owner/:repo/:number/comment-reply
   * Reply to a review comment
   */
  fastify.post<{
    Params: { owner: string; repo: string; number: string };
    Body: { body: string; inReplyTo: number };
  }>('/api/prs/:owner/:repo/:number/comment-reply', async (request, reply) => {
    try {
      const { owner, repo, number } = request.params;
      const { body, inReplyTo } = request.body;
      const prNumber = parseInt(number);

      if (isNaN(prNumber)) {
        return reply.code(400).send({ error: 'Invalid PR number' });
      }

      if (!body || body.trim() === '') {
        return reply.code(400).send({
          error: 'Invalid request',
          message: 'Comment body is required',
        });
      }

      if (!inReplyTo) {
        return reply.code(400).send({
          error: 'Invalid request',
          message: 'inReplyTo (comment ID) is required',
        });
      }

      const authenticated = await githubService.isAuthenticated();

      if (!authenticated) {
        return reply.code(401).send({
          error: 'Not authenticated',
        });
      }

      await githubService.addPRCommentReply(owner, repo, prNumber, body, inReplyTo);

      return reply.send({
        success: true,
        message: 'Reply added successfully',
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to add reply',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/prs/cached
   * Get cached PRs from local database
   */
  fastify.get('/api/prs/cached', async (request, reply) => {
    try {
      const prs = dbService.getPullRequests();

      return reply.send({
        pullRequests: prs,
        count: prs.length,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to fetch cached PRs',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/prs/:owner/:repo/reactions/add
   * Add a reaction to a comment
   */
  fastify.post<{
    Params: { owner: string; repo: string };
    Body: { commentId: string; reactionContent: string };
  }>('/api/prs/:owner/:repo/reactions/add', async (request, reply) => {
    try {
      const { owner, repo } = request.params;
      const { commentId, reactionContent } = request.body;

      if (!commentId || !reactionContent) {
        return reply.code(400).send({
          error: 'Invalid request',
          message: 'commentId and reactionContent are required',
        });
      }

      const authenticated = await githubService.isAuthenticated();

      if (!authenticated) {
        return reply.code(401).send({
          error: 'Not authenticated',
        });
      }

      await githubService.addReaction(owner, repo, commentId, reactionContent);

      return reply.send({
        success: true,
        message: 'Reaction added successfully',
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to add reaction',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/prs/:owner/:repo/reactions/remove
   * Remove a reaction from a comment
   */
  fastify.post<{
    Params: { owner: string; repo: string };
    Body: { commentId: string; reactionContent: string };
  }>('/api/prs/:owner/:repo/reactions/remove', async (request, reply) => {
    try {
      const { owner, repo } = request.params;
      const { commentId, reactionContent } = request.body;

      if (!commentId || !reactionContent) {
        return reply.code(400).send({
          error: 'Invalid request',
          message: 'commentId and reactionContent are required',
        });
      }

      const authenticated = await githubService.isAuthenticated();

      if (!authenticated) {
        return reply.code(401).send({
          error: 'Not authenticated',
        });
      }

      await githubService.removeReaction(owner, repo, commentId, reactionContent);

      return reply.send({
        success: true,
        message: 'Reaction removed successfully',
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to remove reaction',
        message: error.message,
      });
    }
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    dbService.close();
  });
}
