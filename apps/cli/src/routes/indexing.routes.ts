import type { FastifyInstance } from 'fastify';
import { CodeIndexingService } from '../services/CodeIndexingService.js';
import { getFileWatcherService } from '../services/FileWatcherService.js';

/**
 * Code Indexing Routes
 *
 * Endpoints for repository-level code indexing and symbol lookup
 */
export async function indexingRoutes(fastify: FastifyInstance) {
  const indexingService = new CodeIndexingService();

  /**
   * POST /api/indexing/start
   * Start indexing a repository
   */
  fastify.post<{
    Body: {
      repoPath: string;
    };
  }>('/api/indexing/start', async (request, reply) => {
    try {
      const { repoPath } = request.body;

      if (!repoPath) {
        return reply.status(400).send({
          error: 'repoPath is required',
        });
      }

      console.log(`[Indexing API] Starting indexing for: ${repoPath}`);

      // Start indexing in the background
      indexingService.indexRepository(repoPath, (current, total, file) => {
        console.log(`[Indexing] ${current}/${total}: ${file}`);
      }).catch((error) => {
        console.error('[Indexing API] Indexing failed:', error);
      });

      return reply.send({
        success: true,
        message: 'Indexing started',
      });
    } catch (error: any) {
      console.error('[Indexing API] Failed to start indexing:', error);
      return reply.status(500).send({
        error: 'Failed to start indexing',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/indexing/start-stream
   * Start indexing with Server-Sent Events progress updates
   */
  fastify.post<{
    Body: {
      repoPath: string;
      watch?: boolean;
    };
  }>('/api/indexing/start-stream', async (request, reply) => {
    try {
      const { repoPath, watch = true } = request.body;

      if (!repoPath) {
        return reply.status(400).send({
          error: 'repoPath is required',
        });
      }

      console.log(`[Indexing API] Starting SSE indexing for: ${repoPath}`);

      // Set up SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Send initial message
      reply.raw.write(`data: ${JSON.stringify({ status: 'started' })}\n\n`);

      try {
        // Start indexing with progress callback
        await indexingService.indexRepository(repoPath, (current, total, file) => {
          const percentage = Math.round((current / total) * 100);
          const progressData = {
            current,
            total,
            file,
            percentage,
          };

          // Send progress update
          reply.raw.write(`data: ${JSON.stringify(progressData)}\n\n`);
        });

        // Get final stats
        const stats = indexingService.getIndexStats(repoPath);

        // Start file watcher if requested
        if (watch) {
          const watcherService = getFileWatcherService();
          if (!watcherService.isWatching(repoPath)) {
            watcherService.startWatching(repoPath);
            console.log(`[Indexing API] Started file watcher for: ${repoPath}`);
          }
        }

        // Send completion message
        reply.raw.write(`data: ${JSON.stringify({ status: 'completed', stats })}\n\n`);
        reply.raw.end();
      } catch (error: any) {
        console.error('[Indexing API] Indexing failed:', error);
        // Send error message
        reply.raw.write(
          `data: ${JSON.stringify({ status: 'error', error: error.message })}\n\n`
        );
        reply.raw.end();
      }
    } catch (error: any) {
      console.error('[Indexing API] Failed to start SSE indexing:', error);
      return reply.status(500).send({
        error: 'Failed to start SSE indexing',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/indexing/status
   * Get indexing status and statistics
   */
  fastify.get<{
    Querystring: {
      repoPath: string;
    };
  }>('/api/indexing/status', async (request, reply) => {
    try {
      const { repoPath } = request.query;

      if (!repoPath) {
        return reply.status(400).send({
          error: 'repoPath is required',
        });
      }

      const stats = indexingService.getIndexStats(repoPath);

      return reply.send({
        success: true,
        stats,
      });
    } catch (error: any) {
      console.error('[Indexing API] Failed to get status:', error);
      return reply.status(500).send({
        error: 'Failed to get status',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/indexing/reindex-files
   * Re-index specific files (for incremental updates)
   */
  fastify.post<{
    Body: {
      repoPath: string;
      filePaths: string[];
    };
  }>('/api/indexing/reindex-files', async (request, reply) => {
    try {
      const { repoPath, filePaths } = request.body;

      if (!repoPath || !filePaths) {
        return reply.status(400).send({
          error: 'repoPath and filePaths are required',
        });
      }

      await indexingService.reindexFiles(repoPath, filePaths);

      return reply.send({
        success: true,
        message: `Re-indexed ${filePaths.length} files`,
      });
    } catch (error: any) {
      console.error('[Indexing API] Failed to re-index files:', error);
      return reply.status(500).send({
        error: 'Failed to re-index files',
        message: error.message,
      });
    }
  });

  /**
   * DELETE /api/indexing/repository
   * Delete index for a repository
   */
  fastify.delete<{
    Querystring: {
      repoPath: string;
    };
  }>('/api/indexing/repository', async (request, reply) => {
    try {
      const { repoPath } = request.query;

      if (!repoPath) {
        return reply.status(400).send({
          error: 'repoPath is required',
        });
      }

      indexingService.deleteRepositoryIndex(repoPath);

      return reply.send({
        success: true,
        message: 'Repository index deleted',
      });
    } catch (error: any) {
      console.error('[Indexing API] Failed to delete index:', error);
      return reply.status(500).send({
        error: 'Failed to delete index',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/indexing/definitions
   * Find symbol definitions by name
   */
  fastify.get<{
    Querystring: {
      repoPath: string;
      symbolName: string;
    };
  }>('/api/indexing/definitions', async (request, reply) => {
    try {
      const { repoPath, symbolName } = request.query;

      if (!repoPath || !symbolName) {
        return reply.status(400).send({
          error: 'repoPath and symbolName are required',
        });
      }

      const definitions = await indexingService.findDefinitions(repoPath, symbolName);

      return reply.send({
        success: true,
        definitions,
      });
    } catch (error: any) {
      console.error('[Indexing API] Failed to find definitions:', error);
      return reply.status(500).send({
        error: 'Failed to find definitions',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/indexing/symbols-in-file
   * Get all symbols in a file
   */
  fastify.get<{
    Querystring: {
      repoPath: string;
      filePath: string;
    };
  }>('/api/indexing/symbols-in-file', async (request, reply) => {
    try {
      const { repoPath, filePath } = request.query;

      if (!repoPath || !filePath) {
        return reply.status(400).send({
          error: 'repoPath and filePath are required',
        });
      }

      const symbols = await indexingService.findSymbolsInFile(repoPath, filePath);

      return reply.send({
        success: true,
        symbols,
      });
    } catch (error: any) {
      console.error('[Indexing API] Failed to find symbols:', error);
      return reply.status(500).send({
        error: 'Failed to find symbols',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/indexing/symbol-at-location
   * Find symbol at a specific location
   */
  fastify.get<{
    Querystring: {
      repoPath: string;
      filePath: string;
      line: string;
      column: string;
    };
  }>('/api/indexing/symbol-at-location', async (request, reply) => {
    try {
      const { repoPath, filePath, line, column } = request.query;

      if (!repoPath || !filePath || !line || !column) {
        return reply.status(400).send({
          error: 'repoPath, filePath, line, and column are required',
        });
      }

      const symbol = await indexingService.findSymbolAtLocation(
        repoPath,
        filePath,
        parseInt(line),
        parseInt(column)
      );

      return reply.send({
        success: true,
        symbol,
      });
    } catch (error: any) {
      console.error('[Indexing API] Failed to find symbol:', error);
      return reply.status(500).send({
        error: 'Failed to find symbol',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/indexing/watch/start
   * Start watching a repository for file changes
   */
  fastify.post<{
    Body: {
      repoPath: string;
    };
  }>('/api/indexing/watch/start', async (request, reply) => {
    try {
      const { repoPath } = request.body;

      if (!repoPath) {
        return reply.status(400).send({
          error: 'repoPath is required',
        });
      }

      const watcherService = getFileWatcherService();
      watcherService.startWatching(repoPath);

      return reply.send({
        success: true,
        message: 'File watcher started',
      });
    } catch (error: any) {
      console.error('[Indexing API] Failed to start watcher:', error);
      return reply.status(500).send({
        error: 'Failed to start watcher',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/indexing/watch/stop
   * Stop watching a repository
   */
  fastify.post<{
    Body: {
      repoPath: string;
    };
  }>('/api/indexing/watch/stop', async (request, reply) => {
    try {
      const { repoPath } = request.body;

      if (!repoPath) {
        return reply.status(400).send({
          error: 'repoPath is required',
        });
      }

      const watcherService = getFileWatcherService();
      await watcherService.stopWatching(repoPath);

      return reply.send({
        success: true,
        message: 'File watcher stopped',
      });
    } catch (error: any) {
      console.error('[Indexing API] Failed to stop watcher:', error);
      return reply.status(500).send({
        error: 'Failed to stop watcher',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/indexing/watch/status
   * Get file watcher status
   */
  fastify.get('/api/indexing/watch/status', async (request, reply) => {
    try {
      const watcherService = getFileWatcherService();
      const watchedRepos = watcherService.getWatchedRepositories();

      return reply.send({
        success: true,
        watching: watchedRepos,
        count: watchedRepos.length,
      });
    } catch (error: any) {
      console.error('[Indexing API] Failed to get watcher status:', error);
      return reply.status(500).send({
        error: 'Failed to get watcher status',
        message: error.message,
      });
    }
  });
}
