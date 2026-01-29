/**
 * AI Provider Interface
 *
 * Supports multiple AI providers:
 * - Local CLIs: Claude Code, Codex, Gemini CLI
 * - Local Models: Ollama, LM Studio
 * - Cloud APIs: Anthropic API, OpenAI API (future)
 */

export interface AIProviderConfig {
  /** Provider name for logging and identification */
  name: string;

  /** Check if this provider is available on the system */
  isAvailable: () => Promise<boolean>;

  /** Get installation instructions if not available */
  getInstallationInstructions: () => string;
}

export interface AIReviewRequest {
  /** Full prompt for the AI */
  prompt: string;

  /** Working directory for context */
  workingDirectory: string;

  /** Optional model override (e.g., 'sonnet', 'opus') */
  model?: string;

  /** Timeout in milliseconds */
  timeout?: number;
}

export interface AIReviewResponse {
  /** The review text from AI */
  content: string;

  /** Token usage information (if available) */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };

  /** Metadata about the response */
  metadata?: {
    model?: string;
    provider?: string;
    duration?: number;
    [key: string]: any;
  };
}

/**
 * Base interface for all AI providers
 */
export interface AIProvider extends AIProviderConfig {
  /**
   * Perform AI code review
   * @param request The review request
   * @returns The AI response
   */
  review(request: AIReviewRequest): Promise<AIReviewResponse>;
}

/**
 * Provider factory for creating AI providers
 */
export class AIProviderFactory {
  private static providers: Map<string, () => AIProvider> = new Map();

  /**
   * Register a provider
   */
  static register(id: string, factory: () => AIProvider): void {
    this.providers.set(id, factory);
  }

  /**
   * Create a provider by ID
   */
  static create(id: string): AIProvider | null {
    const factory = this.providers.get(id);
    return factory ? factory() : null;
  }

  /**
   * Get all registered provider IDs
   */
  static getProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get all available providers (those that are installed)
   */
  static async getAvailableProviders(): Promise<string[]> {
    const available: string[] = [];

    for (const id of this.getProviderIds()) {
      const provider = this.create(id);
      if (provider && await provider.isAvailable()) {
        available.push(id);
      }
    }

    return available;
  }
}
