import { FastifyInstance } from 'fastify';
import { LSPService } from '../services/LSPService.js';

export async function lspRoutes(fastify: FastifyInstance) {
  const lspService = new LSPService();

  // Check if a specific language server is installed
  fastify.get<{
    Querystring: { language?: string };
  }>('/api/lsp/check', async (request, reply) => {
    const language = (request.query.language || 'typescript') as 'typescript' | 'javascript' | 'ruby' | 'java';
    const isInstalled = await lspService.checkInstalled(language);
    const instructions = lspService.getInstallInstructions(language);

    return reply.send({
      language,
      installed: isInstalled,
      message: isInstalled
        ? `${language} language server is installed`
        : `${language} language server is not installed.`,
      instructions: isInstalled ? null : instructions,
    });
  });

  // Check all language servers
  fastify.get('/api/lsp/check-all', async (request, reply) => {
    const status = await lspService.checkAllServers();
    const result: Record<string, { installed: boolean; instructions: string }> = {};

    for (const [lang, installed] of status.entries()) {
      result[lang] = {
        installed,
        instructions: lspService.getInstallInstructions(lang),
      };
    }

    return reply.send({
      servers: result,
      allInstalled: Array.from(status.values()).every(v => v),
    });
  });

  // WebSocket endpoint for LSP communication
  fastify.get('/lsp', { websocket: true }, (connection, req) => {
    const { socket } = connection;

    // Get workspace root and language from query parameters
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const workspaceRoot = url.searchParams.get('workspaceRoot');
    const language = (url.searchParams.get('language') || 'typescript') as 'typescript' | 'javascript' | 'ruby' | 'java';

    if (!workspaceRoot) {
      console.error('[LSP] workspaceRoot query parameter is required');
      socket.close(1008, 'workspaceRoot query parameter is required');
      return;
    }

    console.log(`[LSP] WebSocket connection established for workspace: ${workspaceRoot}, language: ${language}`);

    try {
      lspService.startLanguageServer(socket as any, workspaceRoot, language);
    } catch (error) {
      console.error('[LSP] Failed to start language server:', error);
      socket.close(1011, 'Failed to start language server');
    }
  });

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    lspService.killAll();
  });
}
