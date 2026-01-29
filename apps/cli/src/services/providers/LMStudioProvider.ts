import type { AIProvider, AIReviewRequest, AIReviewResponse } from './AIProvider.js';

/**
 * LM Studio Provider
 *
 * Uses LM Studio's local API server for AI code review
 * Requires: LM Studio installed and running (https://lmstudio.ai)
 *
 * TODO: Implement full functionality
 */
export class LMStudioProvider implements AIProvider {
  name = 'LM Studio';
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:1234') {
    this.baseUrl = baseUrl;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if LM Studio server is running
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  getInstallationInstructions(): string {
    return 'Install LM Studio from https://lmstudio.ai\nStart the local server and load a model.';
  }

  async review(request: AIReviewRequest): Promise<AIReviewResponse> {
    // TODO: Implement LM Studio API integration
    // Uses OpenAI-compatible API format
    const startTime = Date.now();

    try {
      console.log('[LMStudioProvider] Starting review...');

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model || 'local-model',
          messages: [
            {
              role: 'user',
              content: request.prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 16000,
        }),
        signal: AbortSignal.timeout(request.timeout || 300000),
      });

      if (!response.ok) {
        throw new Error(`LM Studio API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const duration = Date.now() - startTime;

      const content = data.choices?.[0]?.message?.content || '';

      if (!content || content.trim().length === 0) {
        throw new Error('LM Studio returned empty response');
      }

      return {
        content,
        usage: {
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens,
          totalTokens: data.usage?.total_tokens,
        },
        metadata: {
          model: data.model || request.model || 'local-model',
          provider: 'lmstudio',
          duration,
        },
      };
    } catch (error: any) {
      console.error('[LMStudioProvider] Review failed:', error);
      throw new Error(`LM Studio failed: ${error.message}`);
    }
  }
}
