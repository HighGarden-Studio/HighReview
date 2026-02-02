import type { FastifyInstance } from 'fastify';
import { getAIConfigService } from '../services/AIConfigService.js';
import { AIProviderFactory, registerProviders } from '../services/providers/index.js';
import { AIAssistantService } from '../services/AIAssistantService.js';
import type { AssistantRequest, AssistantContext } from '../services/AIAssistantService.js';

/**
 * AI Configuration Routes
 *
 * Endpoints for managing AI provider selection and settings
 */
export async function aiRoutes(fastify: FastifyInstance) {
  // Register providers
  registerProviders();

  /**
   * GET /api/ai/providers
   * Get list of all available AI providers
   */
  fastify.get('/api/ai/providers', async (request, reply) => {
    try {
      const providerIds = AIProviderFactory.getProviderIds();
      const providers: Record<string, any> = {};

      for (const id of providerIds) {
        const provider = AIProviderFactory.create(id);
        if (provider) {
          providers[id] = {
            name: provider.name,
            available: await provider.isAvailable(),
            instructions: provider.getInstallationInstructions(),
            models: provider.getModels ? await provider.getModels() : [],
          };
        }
      }

      // Get currently selected provider
      const configService = getAIConfigService();
      const selectedProvider = await configService.getSelectedProvider().catch(() => null);
      const config = await configService.getConfig();

      return reply.send({
        providers,
        selected: selectedProvider,
        selectedModel: config.providerSettings?.[selectedProvider || '']?.model,
      });
    } catch (error: any) {
      console.error('[AI Routes] Failed to get providers:', error);
      return reply.status(500).send({
        error: 'Failed to get providers',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/ai/config
   * Get current AI configuration
   */
  fastify.get('/api/ai/config', async (request, reply) => {
    try {
      const configService = getAIConfigService();
      const config = await configService.getConfig();

      return reply.send(config);
    } catch (error: any) {
      console.error('[AI Routes] Failed to get config:', error);
      return reply.status(500).send({
        error: 'Failed to get config',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/ai/config
   * Update AI configuration
   */
  fastify.post<{
    Body: {
      provider: string;
      providerSettings?: Record<string, any>;
      model?: string;
    };
  }>('/api/ai/config', async (request, reply) => {
    try {
      const { provider, providerSettings: initialSettings, model } = request.body;

      if (!provider) {
        return reply.status(400).send({
          error: 'Provider ID required',
        });
      }

      // Validate provider exists
      const providerInstance = AIProviderFactory.create(provider);
      if (!providerInstance) {
        return reply.status(400).send({
          error: `Unknown provider: ${provider}`,
        });
      }

      // Check if provider is available
      const isAvailable = await providerInstance.isAvailable();
      if (!isAvailable) {
        return reply.status(400).send({
          error: `Provider '${provider}' is not available`,
          instructions: providerInstance.getInstallationInstructions(),
        });
      }

      // Save configuration
      const configService = getAIConfigService();
      
      const providerSettings = initialSettings || {};
      if (model) {
        providerSettings.model = model;
      }

      await configService.setSelectedProvider(provider, providerSettings);

      console.log(`[AI Routes] Updated AI provider to: ${provider}`);

      return reply.send({
        success: true,
        provider,
        message: `AI provider set to ${providerInstance.name}`,
      });
    } catch (error: any) {
      console.error('[AI Routes] Failed to update config:', error);
      return reply.status(500).send({
        error: 'Failed to update config',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/ai/ask
   * Ask AI assistant a question with optional context
   */
  fastify.post<{
    Body: {
      message: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
      context?: AssistantContext;
      workingDirectory: string;
      model?: string;
    };
  }>('/api/ai/ask', async (request, reply) => {
    try {
      const { message, history, context, workingDirectory, model } = request.body;

      if (!message || !message.trim()) {
        return reply.status(400).send({
          error: 'Message is required',
        });
      }

      if (!workingDirectory) {
        return reply.status(400).send({
          error: 'Working directory is required',
        });
      }

      console.log('[AI Routes] AI Assistant request:', {
        messageLength: message.length,
        hasHistory: !!history?.length,
        hasContext: !!context,
      });

      const assistantService = new AIAssistantService();

      const response = await assistantService.ask({
        message,
        history,
        context,
        workingDirectory,
        model,
      });

      return reply.send({
        success: true,
        response: response.message,
        metadata: response.metadata,
      });
    } catch (error: any) {
      console.error('[AI Routes] AI Assistant failed:', error);
      return reply.status(500).send({
        error: 'AI Assistant request failed',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/ai/ask-stream
   * Ask AI assistant with streaming response (Server-Sent Events)
   */
  fastify.post<{
    Body: {
      message: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
      context?: AssistantContext;
      workingDirectory: string;
      model?: string;
    };
  }>('/api/ai/ask-stream', async (request, reply) => {
    try {
      const { message, history, context, workingDirectory, model } = request.body;

      if (!message || !message.trim()) {
        return reply.status(400).send({
          error: 'Message is required',
        });
      }

      if (!workingDirectory) {
        return reply.status(400).send({
          error: 'Working directory is required',
        });
      }

      console.log('[AI Routes] AI Assistant streaming request:', {
        messageLength: message.length,
        hasHistory: !!history?.length,
        hasContext: !!context,
      });

      // Set headers for SSE
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('Access-Control-Allow-Origin', '*');

      // Send initial status
      reply.raw.write(`data: ${JSON.stringify({ type: 'status', status: 'starting' })}\n\n`);

      const assistantService = new AIAssistantService();

      // Stream response
      await assistantService.askStream({
        message,
        history,
        context,
        workingDirectory,
        model,
        onChunk: (chunk) => {
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        },
      });

      // Send done event
      reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      reply.raw.end();
    } catch (error: any) {
      console.error('[AI Routes] AI Assistant streaming failed:', error);
      reply.raw.write(`data: ${JSON.stringify({
        type: 'error',
        error: error.message
      })}\n\n`);
      reply.raw.end();
    }
  });

  /**
   * POST /api/ai/read-files
   * Read file contents for context
   */
  fastify.post<{
    Body: {
      filePaths: string[];
      workingDirectory: string;
    };
  }>('/api/ai/read-files', async (request, reply) => {
    try {
      const { filePaths, workingDirectory } = request.body;

      if (!filePaths || filePaths.length === 0) {
        return reply.status(400).send({
          error: 'File paths are required',
        });
      }

      if (!workingDirectory) {
        return reply.status(400).send({
          error: 'Working directory is required',
        });
      }

      const assistantService = new AIAssistantService();
      const files = await assistantService.readFiles(filePaths, workingDirectory);

      return reply.send({
        success: true,
        files,
      });
    } catch (error: any) {
      console.error('[AI Routes] Read files failed:', error);
      return reply.status(500).send({
        error: 'Failed to read files',
        message: error.message,
      });
    }
  });
}
