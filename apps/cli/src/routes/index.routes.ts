import { FastifyInstance } from 'fastify';
import { ProjectIndexService } from '../services/ProjectIndexService.js';

export async function indexRoutes(fastify: FastifyInstance) {
  const indexService = new ProjectIndexService();

  /**
   * Check if a project needs indexing
   */
  fastify.get<{
    Querystring: { projectPath: string; branch: string };
  }>('/api/index/check', async (request, reply) => {
    const { projectPath, branch } = request.query;

    if (!projectPath || !branch) {
      return reply.code(400).send({
        error: 'Missing required parameters',
        message: 'projectPath and branch are required',
      });
    }

    const needsIndexing = await indexService.needsIndexing(projectPath, branch);
    const status = indexService.getIndexStatus(projectPath, branch);

    return reply.send({
      needsIndexing,
      status,
    });
  });

  /**
   * Trigger project indexing
   */
  fastify.post<{
    Body: { projectPath: string; branch: string };
  }>('/api/index/start', async (request, reply) => {
    const { projectPath, branch } = request.body;

    if (!projectPath || !branch) {
      return reply.code(400).send({
        error: 'Missing required parameters',
        message: 'projectPath and branch are required',
      });
    }

    // Start indexing asynchronously
    indexService.indexProject(projectPath, branch).catch((error) => {
      console.error('[Index API] Indexing failed:', error);
    });

    return reply.send({
      success: true,
      message: 'Indexing started',
    });
  });

  /**
   * Get index status
   */
  fastify.get<{
    Querystring: { projectPath: string; branch: string };
  }>('/api/index/status', async (request, reply) => {
    const { projectPath, branch } = request.query;

    if (!projectPath || !branch) {
      return reply.code(400).send({
        error: 'Missing required parameters',
        message: 'projectPath and branch are required',
      });
    }

    const status = indexService.getIndexStatus(projectPath, branch);

    if (!status) {
      return reply.code(404).send({
        error: 'Not found',
        message: 'No index found for this project/branch',
      });
    }

    return reply.send(status);
  });

  /**
   * Search for symbols
   */
  fastify.get<{
    Querystring: { projectPath: string; branch: string; query: string };
  }>('/api/index/search', async (request, reply) => {
    const { projectPath, branch, query } = request.query;

    if (!projectPath || !branch || !query) {
      return reply.code(400).send({
        error: 'Missing required parameters',
        message: 'projectPath, branch, and query are required',
      });
    }

    const symbols = indexService.findSymbols(projectPath, branch, query);

    return reply.send({
      query,
      results: symbols,
    });
  });

  /**
   * Get symbols in a file
   */
  fastify.get<{
    Querystring: { projectPath: string; branch: string; filePath: string };
  }>('/api/index/file-symbols', async (request, reply) => {
    const { projectPath, branch, filePath } = request.query;

    if (!projectPath || !branch || !filePath) {
      return reply.code(400).send({
        error: 'Missing required parameters',
        message: 'projectPath, branch, and filePath are required',
      });
    }

    const symbols = indexService.findSymbolsInFile(projectPath, branch, filePath);

    return reply.send({
      filePath,
      symbols,
    });
  });
}
