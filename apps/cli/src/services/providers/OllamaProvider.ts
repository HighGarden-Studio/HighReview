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

  async getModels(): Promise<string[]> {
    try {
      const { stdout } = await execa('ollama', ['list']);
      // Parse output: NAME ID SIZE MODIFIED
      // Skip header line
      return stdout.split('\n')
        .slice(1)
        .filter(line => line.trim().length > 0)
        .map(line => line.split(/\s+/)[0])
        .filter(name => name !== 'NAME');
    } catch (error) {
      console.warn('[OllamaProvider] Failed to list models:', error);
      return [];
    }
  }

  private resolveContextWindow(modelId: string): number {
    const lowerId = modelId.toLowerCase();
    
    // Known models and their typical context windows (in tokens)
    if (lowerId.includes('llama3')) return 8192; // Llama 3 is 8k or 128k
    if (lowerId.includes('llama2') || lowerId.includes('codellama')) return 4096;
    if (lowerId.includes('mistral')) return 8192;
    if (lowerId.includes('mixtral')) return 32768;
    if (lowerId.includes('gemma')) return 8192;
    if (lowerId.includes('qwen')) return 32768;
    if (lowerId.includes('phi3')) return 4096;
    if (lowerId.includes('deepseek')) return 4096;

    return 4096; // Safe default
  }

  async review(request: AIReviewRequest): Promise<AIReviewResponse> {
    const startTime = Date.now();

    try {
      console.log('[OllamaProvider] Starting review...');

      const model = request.model || 'codellama';
      
      const contextWindow = this.resolveContextWindow(model);
      const safeTokenLimit = Math.max(contextWindow - 1000, 2000);
      const MAX_CHARS = safeTokenLimit * 4;

      let promptToSend = request.prompt;
      if (promptToSend.length > MAX_CHARS) {
         console.warn(`[OllamaProvider] Prompt massive (${promptToSend.length} chars). Truncating to ${MAX_CHARS} chars.`);
         promptToSend = promptToSend.slice(0, MAX_CHARS) + '\n...(truncated)...';
      }

      console.log(`[OllamaProvider] Using model: ${model} with limit ~${safeTokenLimit} tokens`);

      const { stdout } = await execa('ollama', ['run', model], {
        cwd: request.workingDirectory,
        input: promptToSend,
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
