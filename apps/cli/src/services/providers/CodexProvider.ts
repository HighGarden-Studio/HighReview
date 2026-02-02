import { execa } from 'execa';
import type { AIProvider, AIReviewRequest, AIReviewResponse } from './AIProvider.js';

/**
 * Codex Provider
 *
 * Uses OpenAI Codex CLI for code review and analysis
 * Requires: Codex CLI installation and API key configuration
 */
export class CodexProvider implements AIProvider {
  name = 'Codex';

  /**
   * Check if Codex CLI is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const { exitCode } = await execa('codex', ['--help'], {
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
    return 'Install Codex CLI: npm install -g @openai/codex-cli or visit https://openai.com/codex';
  }

  /**
   * Perform AI code review with streaming output
   */
  async reviewStream(request: AIReviewRequest & { onChunk: (chunk: string) => void }): Promise<void> {
    const startTime = Date.now();

    try {
      console.log('[CodexProvider] Starting streaming review...');
      console.log(`[CodexProvider] Prompt size: ${request.prompt.length} characters`);
      console.log(`[CodexProvider] Working directory: ${request.workingDirectory}`);

      // Build command arguments for streaming
      const args = [
        'exec',                         // Non-interactive execution mode
        '--json',                       // JSON output
      ];

      // Add model if specified
      if (request.model) {
        args.push('--model', request.model);
      }

      console.log('[CodexProvider] Using streaming output');

      // Call Codex CLI with streaming
      const childProcess = execa('codex', args, {
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
      console.log('[CodexProvider] Streaming completed:', { duration: `${duration}ms` });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[CodexProvider] Streaming failed:', error);
      console.error('[CodexProvider] Error details:', {
        message: error.message,
        stderr: error.stderr,
        exitCode: error.exitCode,
        duration: `${duration}ms`,
      });
      throw new Error(`Codex CLI streaming failed: ${error.message}`);
    }
  }

  /**
   * Perform AI code review using Codex CLI
   */
  async review(request: AIReviewRequest): Promise<AIReviewResponse> {
    const startTime = Date.now();

    try {
      console.log('[CodexProvider] Starting review...');
      console.log(`[CodexProvider] Prompt size: ${request.prompt.length} characters`);
      console.log(`[CodexProvider] Working directory: ${request.workingDirectory}`);

      // Build command arguments
      const args = [
        'exec',                         // Non-interactive execution mode
      ];

      // Detect if this is a code review request
      const isCodeReview = request.prompt.includes('## Pull Request Context') ||
                           request.prompt.includes('code review') ||
                           request.prompt.includes('analyze the following PR');

      // Use JSON output for code review requests
      if (isCodeReview) {
        args.push('--json');  // Enable JSON output
        console.log('[CodexProvider] Using JSON output format');
        
        // Note: JSON schema validation would require writing to a temp file
        // For now, we rely on the prompt to guide the output structure
      } else {
        console.log('[CodexProvider] Using plain text output for conversational mode');
      }

      // Add model if specified
      if (request.model) {
        args.push('--model', request.model);
      }

      // Call Codex CLI
      const { stdout, stderr } = await execa('codex', args, {
        cwd: request.workingDirectory,
        input: request.prompt,
        timeout: request.timeout || 1200000, // Default 20 minutes
      });

      const duration = Date.now() - startTime;

      console.log('[CodexProvider] Review completed:', {
        responseLength: stdout.length,
        duration: `${duration}ms`,
      });

      if (stderr && stderr.trim().length > 0) {
        console.warn('[CodexProvider] Stderr output:', stderr);
      }

      if (!stdout || stdout.trim().length === 0) {
        throw new Error('Codex returned empty response');
      }

      // Parse JSONL output if --json was used
      let content = stdout;
      if (isCodeReview) {
        try {
          // Parse JSONL (JSON Lines) output from codex exec --json
          const lines = stdout.trim().split('\n');
          const events = lines.map(line => JSON.parse(line));
          
          // Find the last assistant message
          const assistantMessages = events
            .filter(event => event.type === 'assistant_message' || event.message?.role === 'assistant')
            .map(event => event.message?.content || event.content)
            .filter(c => c);
          
          if (assistantMessages.length > 0) {
            content = assistantMessages[assistantMessages.length - 1];
            console.log('[CodexProvider] Extracted assistant message from JSONL output');
          } else {
            console.warn('[CodexProvider] No assistant message found in JSONL, using raw output');
          }
        } catch (parseError: any) {
          console.warn('[CodexProvider] Failed to parse JSONL output, using raw stdout:', parseError.message);
          // Fall back to using raw stdout
        }
      }

      return {
        content,
        metadata: {
          model: request.model || 'default',
          provider: 'codex',
          duration,
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      console.error('[CodexProvider] Review failed:', error);
      console.error('[CodexProvider] Error details:', {
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

      throw new Error(`Codex CLI failed: ${error.message}`);
    }
  }
}
