import { execa } from 'execa';
import type { AIProvider, AIReviewRequest, AIReviewResponse } from './AIProvider.js';

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
   * Perform AI code review using Claude Code CLI
   */
  async review(request: AIReviewRequest): Promise<AIReviewResponse> {
    const startTime = Date.now();

    try {
      console.log('[ClaudeCodeProvider] Starting review...');
      console.log(`[ClaudeCodeProvider] Prompt size: ${request.prompt.length} characters`);
      console.log(`[ClaudeCodeProvider] Working directory: ${request.workingDirectory}`);

      // JSON Schema for structured output
      const jsonSchema = {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Brief overview of the review' },
          criticalIssues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                file: { type: 'string' },
                line: { type: 'number' },
                severity: { type: 'string', enum: ['critical', 'warning', 'suggestion'] },
                category: { type: 'string' },
                message: { type: 'string' },
                suggestion: { type: 'string' },
              },
              required: ['file', 'line', 'severity', 'category', 'message'],
            },
          },
          warnings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                file: { type: 'string' },
                line: { type: 'number' },
                severity: { type: 'string', enum: ['critical', 'warning', 'suggestion'] },
                category: { type: 'string' },
                message: { type: 'string' },
                suggestion: { type: 'string' },
              },
              required: ['file', 'line', 'severity', 'category', 'message'],
            },
          },
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                file: { type: 'string' },
                line: { type: 'number' },
                severity: { type: 'string', enum: ['critical', 'warning', 'suggestion'] },
                category: { type: 'string' },
                message: { type: 'string' },
                suggestion: { type: 'string' },
              },
              required: ['file', 'line', 'severity', 'category', 'message'],
            },
          },
          changeIntents: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                file: { type: 'string' },
                level: { type: 'string', enum: ['file', 'block'] },
                intent: { type: 'string' },
                motivation: { type: 'string' },
                impact: { type: 'string' },
              },
              required: ['file', 'level', 'intent', 'motivation'],
            },
          },
          callStacks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                function: { type: 'string' },
                file: { type: 'string' },
                flowchart: { type: 'string' },
                sequence: { type: 'string' },
              },
              required: ['function', 'file'],
            },
          },
          impactAnalysis: {
            type: 'object',
            properties: {
              scope: { type: 'string' },
              affectedAreas: { type: 'array', items: { type: 'string' } },
              breakingChanges: { type: 'array', items: { type: 'string' } },
              sideEffects: { type: 'array', items: { type: 'string' } },
            },
          },
          movedCode: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
                lines: { type: 'number' },
              },
              required: ['from', 'to', 'lines'],
            },
          },
          refactorings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                description: { type: 'string' },
                files: { type: 'array', items: { type: 'string' } },
              },
              required: ['type', 'description', 'files'],
            },
          },
        },
        required: ['summary', 'criticalIssues', 'warnings', 'suggestions'],
      };

      // Build command arguments
      const args = [
        'code',
        '--print',                      // Non-interactive mode
        '--output-format', 'json',      // JSON output for structured parsing
        '--json-schema', JSON.stringify(jsonSchema), // Enforce schema validation
      ];

      // Add model if specified
      if (request.model) {
        args.push('--model', request.model);
      }

      console.log('[ClaudeCodeProvider] Using JSON output format with schema validation');

      // Call Claude Code CLI
      const { stdout, stderr } = await execa('claude', args, {
        cwd: request.workingDirectory,
        input: request.prompt,         // Pass prompt via stdin
        timeout: request.timeout || 300000, // Default 5 minutes
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
      });

      throw new Error(`Claude Code CLI failed: ${error.message}`);
    }
  }
}
