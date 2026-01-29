/**
 * AI Providers
 *
 * Export all available AI providers for code review
 */

export * from './AIProvider.js';
export * from './ClaudeCodeProvider.js';
export * from './OllamaProvider.js';
export * from './LMStudioProvider.js';

import { AIProviderFactory } from './AIProvider.js';
import { ClaudeCodeProvider } from './ClaudeCodeProvider.js';
import { OllamaProvider } from './OllamaProvider.js';
import { LMStudioProvider } from './LMStudioProvider.js';

/**
 * Register all providers
 */
export function registerProviders(): void {
  // Local CLI providers (no API key needed)
  AIProviderFactory.register('claude-code', () => new ClaudeCodeProvider());
  AIProviderFactory.register('ollama', () => new OllamaProvider());
  AIProviderFactory.register('lmstudio', () => new LMStudioProvider());

  // TODO: Add more providers as needed
  // AIProviderFactory.register('codex', () => new CodexProvider());
  // AIProviderFactory.register('gemini-cli', () => new GeminiCLIProvider());
}

/**
 * Get the default provider
 * Tries providers in order: claude-code, ollama, lmstudio
 */
export async function getDefaultProvider(): Promise<string | null> {
  const preferredOrder = ['claude-code', 'ollama', 'lmstudio'];

  for (const providerId of preferredOrder) {
    const provider = AIProviderFactory.create(providerId);
    if (provider && await provider.isAvailable()) {
      return providerId;
    }
  }

  return null;
}
