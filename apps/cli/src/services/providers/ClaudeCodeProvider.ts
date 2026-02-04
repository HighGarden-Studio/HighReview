import { execa } from 'execa';
import type { AIProvider, AIReviewRequest, AIReviewResponse } from './AIProvider.js';
import { ReviewResponseSchema } from './ReviewSchema.js';

/**
 * Claude Code Provider
 *
 * Uses the local Claude Code CLI (no API key required)
 * Requires: `npm install -g @anthropic-ai/claude-code` or similar installation
 */
export class ClaudeCodeProvider implements AIProvider {
  name = 'Claude Code';

  /**
   * Check if Claude Code CLI is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const { exitCode } = await execa('claude', ['code', '--help'], {
        timeout: 5000,
        reject: false,
      });
      return exitCode === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get installation instructions
   */
  getInstallationInstructions(): string {
    return 'Install Claude Code CLI: Visit https://claude.ai/download';
  }

  /**
   * Perform AI code review with streaming output
   */
  async reviewStream(request: AIReviewRequest & { onChunk: (chunk: string) => void }): Promise<void> {
    const startTime = Date.now();

    try {
      console.log('[ClaudeCodeProvider] Starting streaming review...');
      console.log(`[ClaudeCodeProvider] Prompt size: ${request.prompt.length} characters`);
      console.log(`[ClaudeCodeProvider] Working directory: ${request.workingDirectory}`);

      // Build command arguments (no JSON schema for streaming)
      const args = [
        'code',
        '--print',                      // Non-interactive mode
      ];

      // Note: Claude Code manages models via its own configuration
      // Do not pass --model parameter as it may conflict with user's config

      console.log('[ClaudeCodeProvider] Using plain text streaming output');

      // Call Claude Code CLI with streaming
      const childProcess = execa('claude', args, {
        cwd: request.workingDirectory,
        input: request.prompt,
        timeout: request.timeout || 300000,
      });

      // Stream stdout in real-time
      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data: Buffer) => {
          const chunk = data.toString();
          request.onChunk(chunk);
        });
      }

      // Wait for completion
      await childProcess;

      const duration = Date.now() - startTime;
      console.log('[ClaudeCodeProvider] Streaming completed:', { duration: `${duration}ms` });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[ClaudeCodeProvider] Streaming failed:', error);
      console.error('[ClaudeCodeProvider] Error details:', {
        message: error.message,
        stderr: error.stderr,
        exitCode: error.exitCode,
        duration: `${duration}ms`,
      });
      throw new Error(`Claude Code CLI streaming failed: ${error.message}`);
    }
  }

  /**
   * Perform AI code review using Claude Code CLI
   */
  async review(request: AIReviewRequest): Promise<AIReviewResponse> {
    const startTime = Date.now();

    try {
      console.log('[ClaudeCodeProvider] Starting review...');
      console.log(`[ClaudeCodeProvider] Prompt size: ${request.prompt.length} characters`);
      console.log(`[ClaudeCodeProvider] Working directory: ${request.workingDirectory}`);

      // Build command arguments
      const args = [
        'code',
        '--print',                      // Non-interactive mode
      ];

      // Detect if this is a code review request (check for specific keywords in prompt)
      const isCodeReview = request.prompt.includes('## Pull Request Context') ||
                           request.prompt.includes('code review') ||
                           request.prompt.includes('analyze the following PR');

      // Only use structured output for code review requests
      if (isCodeReview) {
        // JSON Schema for structured output
        const jsonSchema = ReviewResponseSchema;

        args.push('--output-format', 'json');      // JSON output for structured parsing
        args.push('--json-schema', JSON.stringify(jsonSchema)); // Enforce schema validation
        console.log('[ClaudeCodeProvider] Using JSON output format with schema validation');
      } else {
        console.log('[ClaudeCodeProvider] Using plain text output for conversational mode');
      }

      // Note: Claude Code manages models via its own configuration
      // Do not pass --model parameter as it may conflict with user's config

      // Call Claude Code CLI
      const { stdout, stderr } = await execa('claude', args, {
        cwd: request.workingDirectory,
        input: request.prompt,         // Pass prompt via stdin
        timeout: request.timeout || 1200000, // Default 20 minutes (large PRs can take time)
      });

      const duration = Date.now() - startTime;

      console.log('[ClaudeCodeProvider] Review completed:', {
        responseLength: stdout.length,
        duration: `${duration}ms`,
      });

      if (stderr && stderr.trim().length > 0) {
        console.warn('[ClaudeCodeProvider] Stderr output:', stderr);
      }

      if (!stdout || stdout.trim().length === 0) {
        throw new Error('Claude Code returned empty response');
      }

      return {
        content: stdout,
        metadata: {
          model: request.model || 'default',
          provider: 'claude-code',
          duration,
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      console.error('[ClaudeCodeProvider] Review failed:', error);
      console.error('[ClaudeCodeProvider] Error details:', {
        message: error.message,
        stderr: error.stderr,
        exitCode: error.exitCode,
        command: error.command,
        duration: `${duration}ms`,
        timedOut: error.timedOut,
      });

      // Check if it's a timeout error
      if (error.timedOut || error.message?.includes('timed out')) {
        const timeoutMinutes = Math.floor((request.timeout || 1200000) / 60000);
        throw new Error(
          `AI review timed out after ${timeoutMinutes} minutes. This PR may be too large. ` +
          `Try reducing the AI review options or reviewing a smaller set of changes.`
        );
      }

      throw new Error(`Claude Code CLI failed: ${error.message}`);
    }
  }
}
