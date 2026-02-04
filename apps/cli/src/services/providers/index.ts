/**
 * AI Providers
 *
 * Export all available AI providers for code review
 */

export * from './AIProvider.js';
// Import all providers
import { ClaudeCodeProvider } from './ClaudeCodeProvider.js';
import { OllamaProvider } from './OllamaProvider.js';
import { LMStudioProvider } from './LMStudioProvider.js';
import { CodexProvider } from './CodexProvider.js';
import { GeminiCliProvider } from './GeminiCliProvider.js';

export * from './AIProvider.js';
export * from './ReviewSchema.js';

// Re-export providers for direct usage if needed
export * from './ClaudeCodeProvider.js';
export * from './OllamaProvider.js';
export * from './LMStudioProvider.js';
export * from './CodexProvider.js';
export * from './GeminiCliProvider.js';

import { AIProviderFactory } from './AIProvider.js';

/**
 * Register all providers
 */
export function registerProviders(): void {
  // Local CLI providers (no API key needed)
  AIProviderFactory.register('claude-code', () => new ClaudeCodeProvider());
  AIProviderFactory.register('gemini-cli', () => new GeminiCliProvider());
  AIProviderFactory.register('codex', () => new CodexProvider());
  AIProviderFactory.register('ollama', () => new OllamaProvider());
  AIProviderFactory.register('lmstudio', () => new LMStudioProvider());

  // TODO: Add more providers as needed
}

/**
 * Get the default provider
 * Tries providers in order: claude-code, codex, ollama, lmstudio
 */
export async function getDefaultProvider(): Promise<string | null> {
  const preferredOrder = ['claude-code', 'codex', 'ollama', 'lmstudio'];

  for (const providerId of preferredOrder) {
    const provider = AIProviderFactory.create(providerId);
    if (provider && await provider.isAvailable()) {
      return providerId;
    }
  }

  return null;
}
