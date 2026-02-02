import { FastifyInstance } from 'fastify';
import { DatabaseService } from '../services/DatabaseService.js';
import { CronService } from '../services/CronService.js';

/**
 * Repository management routes
 * Handles repository configuration and cron schedules
 */
export async function repositoriesRoutes(fastify: FastifyInstance) {
  const db = DatabaseService.getInstance();
  const cronService = CronService.getInstance();

  // Get all repositories
  fastify.get('/api/repositories', async (request, reply) => {
    try {
      const repositories = db.getAllRepositories();
      return reply.send(repositories);
    } catch (error) {
      console.error('[Repositories] Failed to fetch repositories:', error);
      return reply.status(500).send({ error: 'Failed to fetch repositories' });
    }
  });

  // Add repository
  fastify.post<{
    Body: { owner: string; name: string };
  }>('/api/repositories', async (request, reply) => {
    try {
      const { owner, name } = request.body;

      if (!owner || !name) {
        return reply.status(400).send({ error: 'Owner and name are required' });
      }

      // Check if repository already exists
      const existing = db.getRepositoryByOwnerAndName(owner, name);
      if (existing) {
        return reply.status(409).send({ error: 'Repository already exists' });
      }

      const repository = db.addRepository(owner, name);
      return reply.send(repository);
    } catch (error) {
      console.error('[Repositories] Failed to add repository:', error);
      return reply.status(500).send({ error: 'Failed to add repository' });
    }
  });

  // Remove repository
  fastify.delete<{
    Params: { id: string };
  }>('/api/repositories/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      if (!id) {
        return reply.status(400).send({ error: 'Repository ID is required' });
      }

      // Stop cron job if exists
      cronService.stopJob(id);

      const success = db.removeRepository(id);
      if (!success) {
        return reply.status(404).send({ error: 'Repository not found' });
      }

      return reply.send({ success: true });
    } catch (error) {
      console.error('[Repositories] Failed to remove repository:', error);
      return reply.status(500).send({ error: 'Failed to remove repository' });
    }
  });

  // Update cron schedule
  fastify.put<{
    Params: { id: string };
    Body: { schedule: string; autoReview: boolean };
  }>('/api/repositories/:id/cron', async (request, reply) => {
    try {
      const { id } = request.params;
      const { schedule, autoReview } = request.body;

      if (!id) {
        return reply.status(400).send({ error: 'Repository ID is required' });
      }

      // Get repository
      const repo = db.getRepository(id);
      if (!repo) {
        return reply.status(404).send({ error: 'Repository not found' });
      }

      // Update database
      const success = db.updateCronSchedule(id, schedule || null, autoReview);
      if (!success) {
        return reply.status(500).send({ error: 'Failed to update cron schedule' });
      }

      // Update cron job
      const updatedRepo = db.getRepository(id);
      if (updatedRepo) {
        if (autoReview && schedule) {
          await cronService.scheduleJob(updatedRepo);
        } else {
          cronService.stopJob(id);
        }
      }

      return reply.send({ success: true, schedule, autoReview });
    } catch (error) {
      console.error('[Repositories] Failed to update cron schedule:', error);
      return reply.status(500).send({ error: 'Failed to update cron schedule' });
    }
  });

  // Update AI review options
  fastify.put<{
    Params: { id: string };
    Body: { aiReviewOptions: any };
  }>('/api/repositories/:id/ai-options', async (request, reply) => {
    try {
      const { id } = request.params;
      const { aiReviewOptions } = request.body;

      if (!id) {
        return reply.status(400).send({ error: 'Repository ID is required' });
      }

      // Get repository
      const repo = db.getRepository(id);
      if (!repo) {
        return reply.status(404).send({ error: 'Repository not found' });
      }

      // Update AI review options
      const success = db.updateAIReviewOptions(id, aiReviewOptions);
      if (!success) {
        return reply.status(500).send({ error: 'Failed to update AI review options' });
      }

      return reply.send({ success: true, aiReviewOptions });
    } catch (error) {
      console.error('[Repositories] Failed to update AI review options:', error);
      return reply.status(500).send({ error: 'Failed to update AI review options' });
    }
  });

  // Get PRs for all managed repositories
  fastify.get('/api/repositories/prs', async (request, reply) => {
    try {
      const { GitHubCLIService } = await import('../services/GitHubCLIService.js');
      const githubService = new GitHubCLIService();

      const repositories = db.getAllRepositories();

      if (repositories.length === 0) {
        return reply.send({ pullRequests: [], count: 0 });
      }

      // Fetch PRs for all repositories
      const allPRs = [];
      for (const repo of repositories) {
        try {
          const prs = await githubService.listPullRequests(repo.owner, repo.name, 'open');
          allPRs.push(...prs);
        } catch (error) {
          console.error(`[Repositories] Failed to fetch PRs for ${repo.fullName}:`, error);
          // Continue with other repositories even if one fails
        }
      }

      // Sort by updated date
      allPRs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      return reply.send({
        pullRequests: allPRs,
        count: allPRs.length,
      });
    } catch (error) {
      console.error('[Repositories] Failed to fetch repository PRs:', error);
      return reply.status(500).send({ error: 'Failed to fetch repository PRs' });
    }
  });

  // Get auto review history
  fastify.get<{
    Querystring: { repositoryId?: string; limit?: number };
  }>('/api/auto-review/history', async (request, reply) => {
    try {
      const { repositoryId, limit } = request.query;

      let history;
      if (repositoryId) {
        history = db.getAutoReviewHistoryByRepository(repositoryId, limit || 50);
      } else {
        history = db.getAutoReviewHistory(limit || 100);
      }

      return reply.send(history);
    } catch (error) {
      console.error('[Auto Review] Failed to fetch history:', error);
      return reply.status(500).send({ error: 'Failed to fetch auto review history' });
    }
  });
}
