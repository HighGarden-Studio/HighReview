import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * AI Configuration Service
 *
 * Manages AI provider selection and settings
 */

export interface AIConfig {
  /** Selected AI provider */
  provider: string;

  /** Provider-specific settings */
  providerSettings?: {
    /** Model name (optional) */
    model?: string;

    /** Custom API endpoint (for LM Studio, etc.) */
    endpoint?: string;

    /** Additional settings */
    [key: string]: any;
  };

  /** Last updated timestamp */
  updatedAt: number;
}

export class AIConfigService {
  private configPath: string;
  private config: AIConfig | null = null;

  constructor() {
    // Store config in ~/.highreview/ai-config.json
    const highreviewDir = path.join(os.homedir(), '.highreview');
    this.configPath = path.join(highreviewDir, 'ai-config.json');
  }

  /**
   * Get current AI configuration
   */
  async getConfig(): Promise<AIConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
      console.log('[AI Config] Loaded configuration:', this.config?.provider);
      return this.config!;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Config file doesn't exist - return default
        console.log('[AI Config] No configuration found, using default');
        return this.getDefaultConfig();
      }
      throw error;
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): AIConfig {
    return {
      provider: 'claude-code', // Default to Claude Code
      updatedAt: Date.now(),
    };
  }

  /**
   * Save AI configuration
   */
  async saveConfig(config: Partial<AIConfig>): Promise<void> {
    const currentConfig = await this.getConfig();

    this.config = {
      ...currentConfig,
      ...config,
      updatedAt: Date.now(),
    };

    // Ensure directory exists
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });

    // Save to file
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');

    console.log('[AI Config] Saved configuration:', this.config.provider);
  }

  /**
   * Get selected provider ID
   */
  async getSelectedProvider(): Promise<string> {
    const config = await this.getConfig();
    return config.provider;
  }

  /**
   * Set selected provider
   */
  async setSelectedProvider(providerId: string, providerSettings?: any): Promise<void> {
    await this.saveConfig({
      provider: providerId,
      providerSettings,
    });
  }

  /**
   * Get provider settings
   */
  async getProviderSettings(): Promise<Record<string, any> | undefined> {
    const config = await this.getConfig();
    return config.providerSettings;
  }
}

// Singleton instance
let configServiceInstance: AIConfigService | null = null;

/**
 * Get AI config service instance
 */
export function getAIConfigService(): AIConfigService {
  if (!configServiceInstance) {
    configServiceInstance = new AIConfigService();
  }
  return configServiceInstance;
}
