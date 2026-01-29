import { FastifyInstance } from 'fastify';

/**
 * Settings routes
 * Handles general application settings
 */
export async function settingsRoutes(fastify: FastifyInstance) {
  // Get settings
  fastify.get('/api/settings', async (request, reply) => {
    try {
      // TODO: Implement config file reading
      // For now, return default settings
      return reply.send({
        aiProvider: {
          provider: 'claude-code',
          model: 'claude-sonnet-4.5',
        },
      });
    } catch (error) {
      console.error('[Settings] Failed to fetch settings:', error);
      return reply.status(500).send({ error: 'Failed to fetch settings' });
    }
  });

  // Update AI provider
  fastify.put<{
    Body: { provider: string; model?: string; endpoint?: string };
  }>('/api/settings/ai-provider', async (request, reply) => {
    try {
      const { provider, model, endpoint } = request.body;

      if (!provider) {
        return reply.status(400).send({ error: 'Provider is required' });
      }

      // TODO: Implement config file update
      // For now, return success
      return reply.send({ success: true, provider, model, endpoint });
    } catch (error) {
      console.error('[Settings] Failed to update AI provider:', error);
      return reply.status(500).send({ error: 'Failed to update AI provider' });
    }
  });
}
