import { FastifyInstance } from 'fastify';
import { join } from 'path';
import { FileSystemService } from '../services/FileSystemService.js';
import { GitHubCLIService } from '../services/GitHubCLIService.js';

export async function fsRoutes(fastify: FastifyInstance) {
  const fsService = new FileSystemService();
  const githubService = new GitHubCLIService();

  /**
   * GET /api/fs/tree
   * Get file tree structure for a given path
   * Query params:
   *   - path: root path to explore (required)
   *   - maxDepth: maximum depth to traverse (default: 10)
   */
  fastify.get<{
    Querystring: { path: string; maxDepth?: string };
  }>('/api/fs/tree', async (request, reply) => {
    try {
      const { path, maxDepth } = request.query;

      if (!path) {
        return reply.code(400).send({
          error: 'Missing required parameter',
          message: 'path query parameter is required',
        });
      }

      const depth = maxDepth ? parseInt(maxDepth) : 10;

      const tree = await fsService.getFileTree(path, '', depth);

      return reply.send({
        path,
        tree,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to read directory tree',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/fs/content
   * Get file content
   * Query params:
   *   - path: absolute path to file (required)
   */
  fastify.get<{
    Querystring: { path: string };
  }>('/api/fs/content', async (request, reply) => {
    try {
      const { path } = request.query;

      if (!path) {
        return reply.code(400).send({
          error: 'Missing required parameter',
          message: 'path query parameter is required',
        });
      }

      // Check if file is binary
      const isBinary = await fsService.isBinaryFile(path);
      if (isBinary) {
        return reply.code(400).send({
          error: 'Binary file',
          message: 'Cannot display binary files',
        });
      }

      const content = await fsService.readFileContent(path);
      const stats = await fsService.getFileStats(path);

      return reply.send({
        path,
        content,
        stats,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to read file',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/fs/diff
   * Get file content from both current and base branch for diff view
   * Query params:
   *   - worktreePath: path to worktree
   *   - filePath: relative path to file within worktree
   *   - baseBranch: base branch name (e.g., 'main', 'master')
   *   - repoRoot: original repository root path
   *   - owner: (optional) GitHub owner for API fallback
   *   - repo: (optional) GitHub repo for API fallback
   *   - headRef: (optional) PR head ref for API fallback
   */
  fastify.get<{
    Querystring: {
      worktreePath: string;
      filePath: string;
      baseBranch: string;
      repoRoot: string;
      owner?: string;
      repo?: string;
      headRef?: string;
    };
  }>('/api/fs/diff', async (request, reply) => {
    try {
      const { worktreePath, filePath, baseBranch, repoRoot, owner, repo, headRef } = request.query;

      if (!worktreePath || !filePath || !baseBranch || !repoRoot) {
        return reply.code(400).send({
          error: 'Missing required parameters',
          message: 'worktreePath, filePath, baseBranch, and repoRoot are required',
        });
      }

      let modifiedContent = '';
      let originalContent = '';

      // Try to get modified content from worktree first, fallback to GitHub API
      const currentPath = join(worktreePath, filePath);
      try {
        modifiedContent = await fsService.readFileContent(currentPath);
      } catch (error) {
        // If local file doesn't exist but we have GitHub info, try fetching from GitHub
        if (owner && repo && headRef) {
          try {
            modifiedContent = await githubService.getFileContentFromGitHub(owner, repo, filePath, headRef);
            console.log(`[DiffAPI] Fetched modified content from GitHub API`);
          } catch (ghError) {
            // File might be deleted or new
            console.log(`[DiffAPI] File not found in worktree or GitHub: ${filePath}`);
            modifiedContent = '';
          }
        } else {
          modifiedContent = '';
        }
      }

      // Try to get original content from git, fallback to GitHub API
      try {
        originalContent = await fsService.getFileContentFromGit(
          repoRoot,
          baseBranch,
          filePath
        );
      } catch (error) {
        // If local git fails but we have GitHub info, try fetching from GitHub
        if (owner && repo) {
          try {
            originalContent = await githubService.getFileContentFromGitHub(owner, repo, filePath, baseBranch);
            console.log(`[DiffAPI] Fetched original content from GitHub API`);
          } catch (ghError) {
            // File might be new in PR or deleted in base
            console.log(`[DiffAPI] File not found in base branch: ${filePath}`);
            originalContent = '';
          }
        } else {
          originalContent = '';
        }
      }

      return reply.send({
        filePath,
        original: originalContent,
        modified: modifiedContent,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to get diff',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/fs/stats
   * Get file statistics
   */
  fastify.get<{
    Querystring: { path: string };
  }>('/api/fs/stats', async (request, reply) => {
    try {
      const { path } = request.query;

      if (!path) {
        return reply.code(400).send({
          error: 'Missing required parameter',
          message: 'path query parameter is required',
        });
      }

      const stats = await fsService.getFileStats(path);
      const isBinary = await fsService.isBinaryFile(path);

      return reply.send({
        path,
        stats,
        isBinary,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to get file stats',
        message: error.message,
      });
    }
  });
}
