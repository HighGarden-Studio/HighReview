import { execa } from 'execa';
import type { AIProvider, AIReviewRequest, AIReviewResponse } from './AIProvider.js';
import { ReviewResponseSchema } from './ReviewSchema.js';

/**
 * Gemini CLI Provider
 *
 * Uses the local Gemini CLI for AI code reviews.
 * Requires: `npm install -g @google/gemini-cli` or similar installation
 */
export class GeminiCliProvider implements AIProvider {
  name = 'Gemini CLI';

  /**
   * Check if Gemini CLI is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const { exitCode } = await execa('gemini', ['--help'], {
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
    return 'Install Gemini CLI: npm install -g @google/gemini-cli (or check official docs)';
  }

  /**
   * Perform AI code review using Gemini CLI
   */
  async review(request: AIReviewRequest): Promise<AIReviewResponse> {
    const startTime = Date.now();

    try {
      console.log('[GeminiCliProvider] Starting review...');
      console.log(`[GeminiCliProvider] Prompt size: ${request.prompt.length} characters`);
      console.log(`[GeminiCliProvider] Working directory: ${request.workingDirectory}`);

      // Basic args for Gemini CLI
      // Using non-interactive mode via stdin (input piping)
      // Note: `gemini` reads from stdin if no query arg is provided, or we can use positional arg if short.
      // For large prompts (code reviews), stdin is safer.
      const args = [
        // No special flags needed for stdin input in standard usage if we just pipe to it?
        // Actually, the help says: "gemini [query..]" or "-p/--prompt".
        // But for stdin: "Appended to input on stdin (if any)".
        // So we can just pipe the prompt to stdin.
        // Also specify output format.
      ];

       // Detect if this is a code review request (check for specific keywords in prompt)
       const isCodeReview = request.prompt.includes('## Pull Request Context') ||
                            request.prompt.includes('code review') ||
                            request.prompt.includes('analyze the following PR');

      // Use JSON output if possible/supported and if it's a code review
      // The user wants structured data for reviews.
      if (isCodeReview) {
         // Some versions of Gemini CLI support --output-format json
         // We should check if we can enforce schema, but for now let's hope the prompt instructions work well enough
         // or if the CLI supports schema validation directly (not visible in basic help, but maybe via config).
         args.push('--output-format', 'json');
         console.log('[GeminiCliProvider] Requesting JSON output format');
      } else {
         args.push('--output-format', 'text');
         console.log('[GeminiCliProvider] Requesting text output format');
      }

      // If a model is specified, use it
      if (request.model) {
        args.push('--model', request.model);
      }

      // Execute Gemini CLI
      const { stdout, stderr } = await execa('gemini', args, {
        cwd: request.workingDirectory,
        input: request.prompt,         // Pass prompt via stdin
        timeout: request.timeout || 1200000, // Default 20 minutes
      });

      const duration = Date.now() - startTime;

      console.log('[GeminiCliProvider] Review completed:', {
        responseLength: stdout.length,
        duration: `${duration}ms`,
      });

      if (stderr && stderr.trim().length > 0) {
        // Gemini CLI might output logs to stderr, just warn
        console.warn('[GeminiCliProvider] Stderr output:', stderr);
      }

      if (!stdout || stdout.trim().length === 0) {
        throw new Error('Gemini CLI returned empty response');
      }

      return {
        content: stdout,
        metadata: {
          model: request.model || 'default',
          provider: 'gemini-cli',
          duration,
        },
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;

      console.error('[GeminiCliProvider] Review failed:', error);
      console.error('[GeminiCliProvider] Error details:', {
        message: error.message,
        stderr: error.stderr,
        exitCode: error.exitCode,
        duration: `${duration}ms`,
      });

      throw new Error(`Gemini CLI failed: ${error.message}`);
    }
  }
}
