import { FastifyInstance } from 'fastify';
import { GitHubCLIService } from '../services/GitHubCLIService.js';

export async function authRoutes(fastify: FastifyInstance) {
  const githubService = new GitHubCLIService();

  /**
   * GET /api/auth/status
   * Check if GitHub CLI is authenticated
   */
  fastify.get('/api/auth/status', async (request, reply) => {
    try {
      const authenticated = await githubService.isAuthenticated();

      if (!authenticated) {
        return reply.send({
          authenticated: false,
          message: 'GitHub CLI not authenticated. Run: gh auth login',
        });
      }

      // Get user info
      const user = await githubService.getCurrentUser();

      return reply.send({
        authenticated: true,
        user: user
          ? {
              username: user.login,
              name: user.name,
              email: user.email,
            }
          : null,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to check auth status',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/auth/setup-instructions
   * Get instructions for setting up GitHub CLI
   */
  fastify.get('/api/auth/setup-instructions', async (request, reply) => {
    return reply.send({
      instructions: [
        {
          step: 1,
          title: 'Install GitHub CLI',
          command: 'brew install gh',
          description: 'Install GitHub CLI using Homebrew (macOS)',
          alternatives: [
            {
              platform: 'Windows',
              command: 'winget install GitHub.cli',
            },
            {
              platform: 'Linux',
              command: 'sudo apt install gh',
            },
          ],
        },
        {
          step: 2,
          title: 'Authenticate with GitHub',
          command: 'gh auth login',
          description: 'Follow the prompts to authenticate with your GitHub account',
        },
        {
          step: 3,
          title: 'Verify Authentication',
          command: 'gh auth status',
          description: 'Check that authentication was successful',
        },
      ],
      documentationUrl: 'https://cli.github.com/manual/gh_auth_login',
    });
  });
}
