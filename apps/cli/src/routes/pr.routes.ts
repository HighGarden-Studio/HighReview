import { FastifyInstance } from 'fastify';
import { GitService } from '../services/GitService.js';
import { GitHubCLIService } from '../services/GitHubCLIService.js';
import { DatabaseService } from '../services/DatabaseService.js';
import { ConfigService } from '../services/ConfigService.js';
import { AIReviewService } from '../services/AIReviewService.js';
import { ProjectIndexService } from '../services/ProjectIndexService.js';
import { ContextAnalyzer } from '../services/ContextAnalyzer.js';
import { normalizeReviewResult } from '../utils/ReviewNormalizer.js';
import type { ChunkedReviewProgress } from '../types/ChunkedReviewTypes.js';

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
   * GET /api/prs/authored
   * Get PRs authored by current user
   */
  fastify.get('/api/prs/authored', async (request, reply) => {
    try {
      const authenticated = await githubService.isAuthenticated();

      if (!authenticated) {
        return reply.code(401).send({
          error: 'Not authenticated',
          message: 'Please run: gh auth login',
        });
      }

      const prs = await githubService.getAuthoredPRs();

      return reply.send({
        pullRequests: prs,
        count: prs.length,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to fetch authored PRs',
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

        // Get or clone the repository for review (as bare repo)
        const repoPath = configService.getRepoPath(owner, repo);

        // Clone or update the repository (now as bare repo)
        await gitService.cloneOrUpdateRepo(owner, repo, repoPath);

        // Fetch the specific PR
        await gitService.fetchPR(owner, repo, prNumber, repoPath);

        // Create worktree for the PR using new structure
        // Format: ~/.highreview/worktrees/{owner}-{repo}/pr-{number}
        const worktreePath = configService.getWorktreePath(owner, repo, prNumber);
        await gitService.ensureWorktreeForPR(
          owner,
          repo,
          prNumber,
          pr.headRefOid,
          repoPath,
          worktreePath
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
   * DELETE /api/prs/:owner/:repo/:number/cleanup-review
   * Clean up worktree and resources for a pull request review
   */
  fastify.delete<{ Params: { owner: string; repo: string; number: string } }>(
    '/api/prs/:owner/:repo/:number/cleanup-review',
    async (request, reply) => {
      try {
        const { owner, repo, number } = request.params;
        const prNumber = parseInt(number);

        if (isNaN(prNumber)) {
          return reply.code(400).send({ error: 'Invalid PR number' });
        }

        // Get worktree path
        const worktreePath = configService.getWorktreePath(owner, repo, prNumber);
        const repoPath = configService.getRepoPath(owner, repo);

        // Remove worktree
        await gitService.removeWorktree(worktreePath, repoPath);

        return reply.send({
          success: true,
          message: `Worktree removed: ${worktreePath}`,
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'Failed to cleanup review environment',
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

      // Get PR details to extract HEAD SHA
      const prData = await githubService.getPRDetails(owner, repo, prNumber);
      if (!prData) {
        return reply.code(404).send({
          error: 'Pull request not found',
        });
      }
      const headSha = prData.headRefOid;

      // Check if this is a forced re-run
      const forceRerun = options?.forceRerun === true;

      // Generate options hash for cache key (exclude forceRerun from hash)
      const { forceRerun: _, ...cacheOptions } = options || {};
      const optionsHash = JSON.stringify(cacheOptions);

      // If force re-run, delete all existing reviews and chunks for this PR
      if (forceRerun) {
        const deletedReviews = dbService.deleteAllAIReviews(owner, repo, prNumber);
        const deletedChunks = dbService.deleteAllChunkCachesForPR(owner, repo, prNumber);
        console.log(`[PR AI Review] Force re-run: deleted ${deletedReviews} reviews and ${deletedChunks} chunk caches`);
      } else {
        // Check if cached review exists (try exact match first)
        let cachedReview = dbService.getAIReviewCache(owner, repo, prNumber, headSha, optionsHash);
        
        // If no exact match, try getting the latest review for this PR/commit (loose matching)
        if (!cachedReview) {
           const latest = dbService.getLatestAIReview(owner, repo, prNumber);
           if (latest && latest.commitSha === headSha) {
             console.log('[PR AI Review] Using latest cached review (loose option match)');
             cachedReview = latest.review;
           }
        }

        if (cachedReview) {
          console.log('[PR AI Review] Using cached review from database');
          return reply.send({
            success: true,
            review: normalizeReviewResult(cachedReview),
            cached: true,
          });
        }
      }

      // Perform AI review
      console.log('[PR AI Review] Starting review with options:', {
        worktreePath,
        baseBranch,
        language,
        options: Object.keys(cacheOptions),
        forceRerun
      });

      // Fetch authoritative list of changed files from GitHub
      let allowedFiles: string[] | undefined;
      try {
        console.log(`[PR AI Review] Fetching authoritative file list for PR #${prNumber} from GitHub...`);
        const prFiles = await githubService.getPRFiles(owner, repo, prNumber);
        allowedFiles = prFiles.map(f => f.path);
        console.log(`[PR AI Review] Found ${allowedFiles.length} changed files in PR via GitHub API`);
      } catch (error: any) {
        console.warn(`[PR AI Review] Failed to fetch PR files from GitHub: ${error.message}`);
        console.warn('[PR AI Review] Will fallback to git diff only (less robust against stale branches)');
      }

      const reviewResult = await aiReviewService.reviewPR(worktreePath, baseBranch, language, options, allowedFiles);

      console.log('[PR AI Review] Review completed:', {
        filesReviewed: reviewResult.filesReviewed,
        totalIssues: reviewResult.totalIssues
      });

      // Save to database cache
      dbService.setAIReviewCache(owner, repo, prNumber, headSha, optionsHash, reviewResult);
      console.log('[PR AI Review] Saved review to database cache');

      // Clean up old reviews for previous commits
      const deletedCount = dbService.deleteOldAIReviews(owner, repo, prNumber, headSha);
      if (deletedCount > 0) {
        console.log(`[PR AI Review] Cleaned up ${deletedCount} old review(s) for previous commits`);
      }

      return reply.send({
        success: true,
        review: reviewResult,
        cached: false,
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
   * POST /api/prs/:owner/:repo/:number/ai-review/stream
   * Perform AI code review with SSE streaming for progress updates
   */
  fastify.post<{
    Params: { owner: string; repo: string; number: string };
    Body: { worktreePath: string; baseBranch: string; language?: 'en' | 'ko' | 'ja' | 'zh'; options?: any };
  }>('/api/prs/:owner/:repo/:number/ai-review/stream', async (request, reply) => {
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
        return reply.code(401).send({ error: 'Not authenticated' });
      }

      // Get PR details for cache key
      const prData = await githubService.getPRDetails(owner, repo, prNumber);
      if (!prData) {
        return reply.code(404).send({ error: 'Pull request not found' });
      }
      const headSha = prData.headRefOid;

      // Set up SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Create AbortController for cancellation support
      const abortController = new AbortController();
      let clientDisconnected = false;

      // Handle client disconnection
      request.raw.on('close', () => {
        clientDisconnected = true;
        abortController.abort();
        console.log('[PR AI Review Stream] Client disconnected, aborting review');
      });

      // Helper to safely write SSE data
      const writeSseData = (data: any): boolean => {
        if (clientDisconnected) {
          return false;
        }
        try {
          reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
          return true;
        } catch (error) {
          clientDisconnected = true;
          console.error('[PR AI Review Stream] Write failed:', error);
          return false;
        }
      };

      // Progress callback for SSE
      const onProgress = (progress: ChunkedReviewProgress) => {
        if (clientDisconnected || abortController.signal.aborted) {
          throw new Error('Client disconnected');
        }
        if (!writeSseData({ type: 'progress', ...progress })) {
          throw new Error('Client disconnected');
        }
      };

      try {
        // Check cache first (skip forceRerun check for streaming)
        const { forceRerun: _, ...cacheOptions } = options || {};
        const optionsHash = JSON.stringify(cacheOptions);

        if (options?.forceRerun) {
          const deletedReviews = dbService.deleteAllAIReviews(owner, repo, prNumber);
          const deletedChunks = dbService.deleteAllChunkCachesForPR(owner, repo, prNumber);
          console.log(`[PR AI Review Stream] Force re-run: deleted ${deletedReviews} reviews and ${deletedChunks} chunk caches`);
        }

        if (!options?.forceRerun) {
          // Try strict cache match first
          let cachedReview = dbService.getAIReviewCache(owner, repo, prNumber, headSha, optionsHash);
          
          // If no strict match, try loose match (latest for this commit)
          if (!cachedReview) {
             const latest = dbService.getLatestAIReview(owner, repo, prNumber);
             if (latest && latest.commitSha === headSha) {
               console.log('[PR AI Review Stream] Using latest cached review (loose option match)');
               cachedReview = latest.review;
             }
          }

          if (cachedReview) {
            console.log('[PR AI Review Stream] Using cached review');
            writeSseData({ type: 'cached', review: normalizeReviewResult(cachedReview) });
            reply.raw.end();
            return;
          }
        }

        console.log('[PR AI Review Stream] Starting streaming review');

        // Fetch authoritative list of changed files from GitHub
        let allowedFiles: string[] | undefined;
        try {
          console.log(`[PR AI Review Stream] Fetching authoritative file list for PR #${prNumber} from GitHub...`);
          const prFiles = await githubService.getPRFiles(owner, repo, prNumber);
          allowedFiles = prFiles.map(f => f.path);
        } catch (error: any) {
             console.warn(`[PR AI Review Stream] Failed to fetch PR files: ${error.message}`);
        }

        // Perform review with progress callback
        const rawReviewResult = await aiReviewService.reviewPR(
          worktreePath,
          baseBranch,
          language,
          { ...options, useChunkedReview: true, prInfo: { owner, repo, prNumber } },
          allowedFiles,
          onProgress
        );
        
        // Normalize the review result to fix malformed AI responses
        const reviewResult = normalizeReviewResult(rawReviewResult);

        // Check if client disconnected during review
        if (clientDisconnected || abortController.signal.aborted) {
          console.log('[PR AI Review Stream] Review completed but client disconnected');
          return;
        }

        // Cache the result
        dbService.setAIReviewCache(owner, repo, prNumber, headSha, optionsHash, reviewResult);

        // Send final result - handle large payloads by checking size
        const resultJson = JSON.stringify({ type: 'complete', review: reviewResult });
        const MAX_SSE_SIZE = 64 * 1024; // 64KB per message (conservative limit)

        // DEBUG: Log what enhanced data we have
        console.log('[PR AI Review Stream] reviewResult enhanced fields:', {
          hasChangeIntents: !!reviewResult.changeIntents,
          hasImpactAnalysis: !!reviewResult.impactAnalysis,
          hasCallStacks: !!reviewResult.callStacks,
          changeIntentsLength: Array.isArray(reviewResult.changeIntents) ? reviewResult.changeIntents.length : 0,
          impactAnalysisKeys: reviewResult.impactAnalysis ? Object.keys(reviewResult.impactAnalysis) : [],
        });

        if (resultJson.length > MAX_SSE_SIZE) {
          console.log(`[PR AI Review Stream] Large result (${resultJson.length} bytes), sending in chunks`);
          
          // Send result in parts
          const parts = {
            summary: reviewResult.summary,
            criticalIssues: reviewResult.criticalIssues,
            warnings: reviewResult.warnings,
            suggestions: reviewResult.suggestions,
            filesReviewed: reviewResult.filesReviewed,
            totalIssues: reviewResult.totalIssues,
          };

          // Send main data
          writeSseData({ type: 'complete', review: parts });

          // Send optional sections separately if they exist
          if (reviewResult.changeIntents) {
            writeSseData({ type: 'metadata', field: 'changeIntents', data: reviewResult.changeIntents });
          }
          if (reviewResult.callStacks) {
            writeSseData({ type: 'metadata', field: 'callStacks', data: reviewResult.callStacks });
          }
          if (reviewResult.impactAnalysis) {
            writeSseData({ type: 'metadata', field: 'impactAnalysis', data: reviewResult.impactAnalysis });
          }
          if (reviewResult.movedCode) {
            writeSseData({ type: 'metadata', field: 'movedCode', data: reviewResult.movedCode });
          }
          if (reviewResult.refactorings) {
            writeSseData({ type: 'metadata', field: 'refactorings', data: reviewResult.refactorings });
          }
        } else {
          // Send complete result in one message
          writeSseData({ type: 'complete', review: reviewResult });
        }

        reply.raw.end();
      } catch (error: any) {
        // Don't log client disconnection as error
        if (error.message === 'Client disconnected' || abortController.signal.aborted) {
          console.log('[PR AI Review Stream] Review cancelled by client');
        } else {
          console.error('[PR AI Review Stream] Error:', error);
          writeSseData({ type: 'error', message: error.message });
        }
        reply.raw.end();
      }
    } catch (error: any) {
      fastify.log.error(error);
      // If headers haven't been sent yet, send error response
      if (!reply.raw.headersSent) {
        return reply.code(500).send({
          error: 'Failed to start AI review stream',
          message: error.message,
        });
      }
    }
  });

  /**
   * GET /api/prs/:owner/:repo/:number/ai-review/check
   * Check if an AI review exists for this PR
   */
  fastify.get<{
    Params: { owner: string; repo: string; number: string };
    Querystring: { commitSha?: string; optionsHash?: string };
  }>('/api/prs/:owner/:repo/:number/ai-review/check', async (request, reply) => {
    try {
      const { owner, repo, number } = request.params;
      const { commitSha, optionsHash } = request.query;
      const prNumber = parseInt(number);

      if (isNaN(prNumber)) {
        return reply.code(400).send({ error: 'Invalid PR number' });
      }

      // If commitSha and optionsHash are provided, check for exact match
      if (commitSha && optionsHash) {
        const exists = dbService.hasAIReviewCache(owner, repo, prNumber, commitSha, optionsHash);
        return reply.send({ exists });
      }

      // Otherwise, check if ANY review exists for this PR
      const exists = dbService.hasAnyAIReview(owner, repo, prNumber);

      // Also get latest review info if exists
      let latestReview = null;
      if (exists) {
        latestReview = dbService.getLatestAIReview(owner, repo, prNumber);
      }

      return reply.send({
        exists,
        latestReview: latestReview ? {
          commitSha: latestReview.commitSha,
          createdAt: latestReview.createdAt,
        } : null,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to check AI review',
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

  /**
   * POST /api/prs/:owner/:repo/:number/search
   * Search for text across all files in the PR worktree
   */
  fastify.post<{
    Params: { owner: string; repo: string; number: string };
    Body: {
      query: string;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      excludeFile?: string;
      excludeLine?: number;
    };
  }>('/api/prs/:owner/:repo/:number/search', async (request, reply) => {
    try {
      const { owner, repo, number } = request.params;
      const { query, caseSensitive = false, wholeWord = false, excludeFile, excludeLine } = request.body;
      const prNumber = parseInt(number);

      if (isNaN(prNumber)) {
        return reply.code(400).send({ error: 'Invalid PR number' });
      }

      if (!query || query.trim().length === 0) {
        return reply.code(400).send({ error: 'Search query is required' });
      }

      const worktreePath = configService.getWorktreePath(owner, repo, prNumber);

      // Verify worktree exists
      const { default: fs } = await import('fs/promises');
      try {
        await fs.access(worktreePath);
      } catch (error) {
        return reply.code(404).send({
          error: 'Worktree not found',
          message: `Worktree for PR #${prNumber} does not exist. Please open the PR review first.`,
        });
      }

      // Use ripgrep if available, otherwise fall back to grep
      const { execa } = await import('execa');

      const results: Array<{
        file: string;
        line: number;
        column: number;
        text: string;
      }> = [];

      // Try ripgrep first (faster and better output)
      let useRipgrep = true;
      try {
        await execa('which', ['rg']);
      } catch {
        useRipgrep = false;
        console.log('[Search] ripgrep not found, falling back to grep');
      }

      try {
        if (useRipgrep) {
          // Use ripgrep for fast searching with JSON output
          const args = ['--json', '--max-count', '1000']; // Limit to 1000 results

          if (!caseSensitive) {
            args.push('--ignore-case');
          }

          if (wholeWord) {
            args.push('--word-regexp');
          }

          // Add query and search path
          args.push(query, worktreePath);

          const { stdout } = await execa('rg', args);

          // Parse ripgrep JSON output
          const lines = stdout.trim().split('\n');

          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);

              // Only process "match" type entries
              if (parsed.type === 'match') {
                const data = parsed.data;
                const filePath = data.path.text;

                // Make path relative to worktree
                const relativePath = filePath.replace(worktreePath + '/', '');

                // Each match can have multiple submatches
                for (const submatch of data.submatches || []) {
                  results.push({
                    file: relativePath,
                    line: data.line_number,
                    column: submatch.start + 1, // ripgrep uses 0-based columns
                    text: data.lines.text.trim(),
                  });
                }
              }
            } catch (parseError) {
              // Skip invalid JSON lines
              continue;
            }
          }
        } else {
          // Fall back to grep
          const args = ['-rn']; // recursive, line numbers

          if (!caseSensitive) {
            args.push('-i');
          }

          if (wholeWord) {
            args.push('-w');
          }

          // Add query and search path
          args.push(query, worktreePath);

          const { stdout } = await execa('grep', args, { maxBuffer: 10 * 1024 * 1024 }); // 10MB buffer

          // Parse grep output: file:line:text
          const lines = stdout.trim().split('\n').slice(0, 1000); // Limit to 1000 results

          for (const line of lines) {
            const match = line.match(/^([^:]+):(\d+):(.*)$/);
            if (match) {
              const filePath = match[1];
              const lineNumber = parseInt(match[2]);
              const text = match[3];

              // Make path relative to worktree
              const relativePath = filePath.replace(worktreePath + '/', '');

              // Find column position (0-indexed position of query in text)
              const searchText = caseSensitive ? text : text.toLowerCase();
              const searchQuery = caseSensitive ? query : query.toLowerCase();
              const columnIndex = searchText.indexOf(searchQuery);

              results.push({
                file: relativePath,
                line: lineNumber,
                column: columnIndex >= 0 ? columnIndex + 1 : 1,
                text: text.trim(),
              });
            }
          }
        }

        // Filter out the current file's current line if excludeFile and excludeLine are provided
        let filteredResults = results;
        if (excludeFile && excludeLine !== undefined) {
          filteredResults = results.filter(
            (result) => !(result.file === excludeFile && result.line === excludeLine)
          );
          console.log(`[Search] Filtered out current position: ${excludeFile}:${excludeLine}`);
          console.log(`[Search] Results before filter: ${results.length}, after filter: ${filteredResults.length}`);
        }

        return reply.send({
          query,
          resultCount: filteredResults.length,
          results: filteredResults,
          truncated: results.length >= 1000,
        });
      } catch (error: any) {
        // grep/ripgrep returns exit code 1 when no matches found
        if (error.exitCode === 1) {
          return reply.send({
            query,
            resultCount: 0,
            results: [],
            truncated: false,
          });
        }

        throw error;
      }
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to search in project',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/code-analysis/definition
   * Find definition using Tree-sitter
   */
  fastify.post<{
    Body: {
      worktreePath: string;
      filePath: string;
      line: number;
      column: number;
    };
  }>('/api/code-analysis/definition', async (request, reply) => {
    try {
      const { worktreePath, filePath, line, column } = request.body;

      if (!worktreePath || !filePath || !line || !column) {
        return reply.code(400).send({
          error: 'Invalid request',
          message: 'worktreePath, filePath, line, and column are required',
        });
      }

      console.log('[Code Analysis] Finding definition:', { filePath, line, column });

      const contextAnalyzer = new ContextAnalyzer();
      const result = await contextAnalyzer.findDefinition(filePath, line, column, worktreePath);

      return reply.send({
        success: true,
        ...result,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to find definition',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/code-analysis/references
   * Find references using Tree-sitter + ripgrep
   */
  fastify.post<{
    Body: {
      worktreePath: string;
      filePath: string;
      line: number;
      column: number;
    };
  }>('/api/code-analysis/references', async (request, reply) => {
    try {
      const { worktreePath, filePath, line, column } = request.body;

      if (!worktreePath || !filePath || !line || !column) {
        return reply.code(400).send({
          error: 'Invalid request',
          message: 'worktreePath, filePath, line, and column are required',
        });
      }

      console.log('[Code Analysis] Finding references:', { filePath, line, column });

      const contextAnalyzer = new ContextAnalyzer();

      // Get symbol at position
      const symbol = await contextAnalyzer.getSymbolAtPosition(
        `${worktreePath}/${filePath}`,
        line,
        column
      );

      if (!symbol) {
        return reply.send({
          success: true,
          locations: [],
          symbolName: '',
        });
      }

      // Find references using existing method
      const modifiedSymbol = {
        name: symbol.name,
        type: 'function' as const,
        file: filePath,
        line: line,
      };

      const references = await contextAnalyzer['findReferences'](modifiedSymbol, worktreePath);

      const locations = references.map(ref => ({
        file: ref.file,
        line: ref.line,
        column: ref.column,
        name: symbol.name,
        type: 'function' as const,
        context: ref.context,
      }));

      return reply.send({
        success: true,
        locations,
        symbolName: symbol.name,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to find references',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/code-analysis/type-definition
   * Find type definition using Tree-sitter
   */
  fastify.post<{
    Body: {
      worktreePath: string;
      filePath: string;
      line: number;
      column: number;
    };
  }>('/api/code-analysis/type-definition', async (request, reply) => {
    try {
      const { worktreePath, filePath, line, column } = request.body;

      if (!worktreePath || !filePath || !line || !column) {
        return reply.code(400).send({
          error: 'Invalid request',
          message: 'worktreePath, filePath, line, and column are required',
        });
      }

      console.log('[Code Analysis] Finding type definition:', { filePath, line, column });

      const contextAnalyzer = new ContextAnalyzer();
      const result = await contextAnalyzer.findTypeDefinition(filePath, line, column, worktreePath);

      return reply.send({
        success: true,
        ...result,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to find type definition',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/code-analysis/implementations
   * Find implementations using Tree-sitter
   */
  fastify.post<{
    Body: {
      worktreePath: string;
      filePath: string;
      line: number;
      column: number;
    };
  }>('/api/code-analysis/implementations', async (request, reply) => {
    try {
      const { worktreePath, filePath, line, column } = request.body;

      if (!worktreePath || !filePath || !line || !column) {
        return reply.code(400).send({
          error: 'Invalid request',
          message: 'worktreePath, filePath, line, and column are required',
        });
      }

      console.log('[Code Analysis] Finding implementations:', { filePath, line, column });

      const contextAnalyzer = new ContextAnalyzer();
      const result = await contextAnalyzer.findImplementations(filePath, line, column, worktreePath);

      return reply.send({
        success: true,
        ...result,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to find implementations',
        message: error.message,
      });
    }
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    dbService.close();
  });
}
