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
}
