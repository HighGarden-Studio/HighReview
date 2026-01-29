import { FastifyInstance } from 'fastify';
import { DatabaseService } from '../services/DatabaseService.js';

/**
 * Settings routes
 * Handles general application settings
 */
export async function settingsRoutes(fastify: FastifyInstance) {
  const db = DatabaseService.getInstance();

  // Get settings
  fastify.get('/api/settings', async (request, reply) => {
    try {
      const settings = db.getAllSettings();

      // Parse AI provider settings
      const aiProvider = settings['ai_provider']
        ? JSON.parse(settings['ai_provider'])
        : {
            provider: 'claude-code',
            model: 'claude-sonnet-4.5',
          };

      return reply.send({
        aiProvider,
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

      const aiProviderConfig = {
        provider,
        model: model || '',
        endpoint: endpoint || '',
      };

      db.setSetting('ai_provider', JSON.stringify(aiProviderConfig));

      return reply.send({ success: true, ...aiProviderConfig });
    } catch (error) {
      console.error('[Settings] Failed to update AI provider:', error);
      return reply.status(500).send({ error: 'Failed to update AI provider' });
    }
  });
}
