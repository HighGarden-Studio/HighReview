import { execa } from 'execa';
import type { AIProvider, AIReviewRequest, AIReviewResponse } from './AIProvider.js';

/**
 * Ollama Provider
 *
 * Uses local Ollama for AI code review (no API key required)
 * Requires: Ollama installed locally (https://ollama.ai)
 *
 * TODO: Implement full functionality
 */
export class OllamaProvider implements AIProvider {
  name = 'Ollama';

  async isAvailable(): Promise<boolean> {
    try {
      const { exitCode } = await execa('ollama', ['--version'], {
        timeout: 5000,
        reject: false,
      });
      return exitCode === 0;
    } catch (error) {
      return false;
    }
  }

  getInstallationInstructions(): string {
    return 'Install Ollama: curl -fsSL https://ollama.ai/install.sh | sh\nThen run: ollama pull codellama';
  }

  async review(request: AIReviewRequest): Promise<AIReviewResponse> {
    // TODO: Implement Ollama integration
    // Example: ollama run codellama "prompt here"
    const startTime = Date.now();

    try {
      console.log('[OllamaProvider] Starting review...');

      const model = request.model || 'codellama';

      const { stdout } = await execa('ollama', ['run', model], {
        cwd: request.workingDirectory,
        input: request.prompt,
        timeout: request.timeout || 300000,
      });

      const duration = Date.now() - startTime;

      return {
        content: stdout,
        metadata: {
          model,
          provider: 'ollama',
          duration,
        },
      };
    } catch (error: any) {
      console.error('[OllamaProvider] Review failed:', error);
      throw new Error(`Ollama failed: ${error.message}`);
    }
  }
}
