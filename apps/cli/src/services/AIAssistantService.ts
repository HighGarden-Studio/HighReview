import * as fs from 'fs/promises';
import { AIProviderFactory, registerProviders } from './providers/index.js';
import type { AIProvider } from './providers/index.js';
import { getAIConfigService } from './AIConfigService.js';

/**
 * AI Assistant Service
 *
 * Handles AI-powered chat and code assistance
 */

export interface AssistantMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface AssistantContext {
  /** Selected code snippet */
  code?: {
    content: string;
    language: string;
    filePath?: string;
    startLine?: number;
    endLine?: number;
  };

  /** Attached files */
  files?: Array<{
    path: string;
    content: string;
  }>;

  /** Attached documentation */
  documentation?: Array<{
    title: string;
    content: string;
  }>;

  /** PR context */
  prContext?: {
    owner: string;
    repo: string;
    prNumber: number;
    title: string;
    description: string;
  };
}

export interface AssistantRequest {
  /** User's message/question */
  message: string;

  /** Conversation history */
  history?: AssistantMessage[];

  /** Additional context */
  context?: AssistantContext;

  /** Working directory */
  workingDirectory: string;

  /** Optional model override */
  model?: string;
}

export interface AssistantResponse {
  /** AI's response */
  message: string;

  /** Metadata */
  metadata?: {
    provider?: string;
    model?: string;
    duration?: number;
    tokensUsed?: number;
  };
}

export class AIAssistantService {
  private provider: AIProvider | null = null;

  constructor() {
    registerProviders();
  }

  /**
   * Initialize the AI provider
   */
  private async initializeProvider(): Promise<void> {
    if (this.provider) {
      return;
    }

    const configService = getAIConfigService();
    const providerId = await configService.getSelectedProvider();

    this.provider = AIProviderFactory.create(providerId);

    if (!this.provider) {
      throw new Error(`Failed to create provider: ${providerId}`);
    }

    const isAvailable = await this.provider.isAvailable();
    if (!isAvailable) {
      throw new Error(`Provider '${providerId}' is not available. Please install it first.`);
    }

    console.log(`[AI Assistant] Using provider: ${this.provider.name}`);
  }

  /**
   * Ask AI assistant a question
   */
  async ask(request: AssistantRequest): Promise<AssistantResponse> {
    await this.initializeProvider();

    if (!this.provider) {
      throw new Error('AI provider not initialized');
    }

    const startTime = Date.now();

    // Build comprehensive prompt
    const prompt = this.buildPrompt(request);

    console.log('[AI Assistant] Processing request:', {
      messageLength: request.message.length,
      hasHistory: !!request.history?.length,
      hasContext: !!request.context,
      promptSize: prompt.length,
    });

    // Call AI provider
    const response = await this.provider.review({
      prompt,
      workingDirectory: request.workingDirectory,
      model: request.model,
      timeout: 120000, // 2 minutes for interactive chat
    });

    const duration = Date.now() - startTime;

    console.log('[AI Assistant] Response received:', {
      responseLength: response.content.length,
      duration: `${duration}ms`,
    });

    // Parse response - handle both JSON and plain text
    let messageContent = response.content;
    try {
      const parsed = JSON.parse(response.content);
      // If it's a Claude Code structured output, extract the result field
      if (parsed.result && typeof parsed.result === 'string') {
        messageContent = parsed.result;
        console.log('[AI Assistant] Extracted result from structured output');
      } else if (parsed.structured_output?.summary) {
        // Build readable message from structured output
        messageContent = `## ${parsed.structured_output.summary}\n\n`;

        if (parsed.structured_output.criticalIssues?.length > 0) {
          messageContent += `### Critical Issues\n`;
          parsed.structured_output.criticalIssues.forEach((issue: any) => {
            messageContent += `- **${issue.category}**: ${issue.message}\n`;
          });
          messageContent += '\n';
        }

        if (parsed.structured_output.warnings?.length > 0) {
          messageContent += `### Warnings\n`;
          parsed.structured_output.warnings.forEach((warning: any) => {
            messageContent += `- ${warning.message}\n`;
          });
          messageContent += '\n';
        }

        if (parsed.structured_output.suggestions?.length > 0) {
          messageContent += `### Suggestions\n`;
          parsed.structured_output.suggestions.forEach((suggestion: any) => {
            messageContent += `- ${suggestion.message}\n`;
          });
        }

        console.log('[AI Assistant] Formatted structured output into readable message');
      } else {
        // Just use the raw content if it's not a recognized structure
        messageContent = response.content;
      }
    } catch (error) {
      // Not JSON, use as-is
      console.log('[AI Assistant] Response is plain text, using as-is');
    }

    return {
      message: messageContent,
      metadata: {
        provider: response.metadata?.provider,
        model: response.metadata?.model,
        duration,
        tokensUsed: response.usage?.totalTokens,
      },
    };
  }

  /**
   * Build prompt from request
   */
  private buildPrompt(request: AssistantRequest): string {
    let prompt = '';

    // System message
    prompt += `You are an expert code assistant helping with code review, debugging, and development tasks.

Your capabilities:
- Answer questions about code
- Explain code functionality
- Suggest improvements and fixes
- Help with debugging
- Provide code examples
- Review code quality

RESPONSE FORMAT GUIDELINES:
- Use clear section headers (## Header) to organize your response
- Use bullet points and numbered lists for clarity
- Format code using markdown code blocks with language tags
- Use **bold** for important points
- Use > blockquotes for tips or warnings
- Break down complex explanations into digestible sections:
  1. **Summary**: Brief overview (2-3 sentences)
  2. **Details**: In-depth explanation
  3. **Examples**: Code examples if applicable
  4. **Suggestions**: Recommendations if applicable

Be concise, accurate, and helpful. Structure your responses for easy reading.\n\n`;

    // Add conversation history
    if (request.history && request.history.length > 0) {
      prompt += `## Conversation History:\n\n`;
      for (const msg of request.history.slice(-10)) { // Last 10 messages
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        prompt += `**${role}:** ${msg.content}\n\n`;
      }
    }

    // Add context
    if (request.context) {
      const ctx = request.context;

      // PR context
      if (ctx.prContext) {
        prompt += `## Pull Request Context:\n\n`;
        prompt += `Repository: ${ctx.prContext.owner}/${ctx.prContext.repo}\n`;
        prompt += `PR #${ctx.prContext.prNumber}: ${ctx.prContext.title}\n`;
        if (ctx.prContext.description) {
          prompt += `Description: ${ctx.prContext.description}\n`;
        }
        prompt += `\n`;
      }

      // Selected code
      if (ctx.code) {
        prompt += `## Selected Code:\n\n`;
        if (ctx.code.filePath) {
          prompt += `File: \`${ctx.code.filePath}\``;
          if (ctx.code.startLine && ctx.code.endLine) {
            prompt += ` (Lines ${ctx.code.startLine}-${ctx.code.endLine})`;
          }
          prompt += `\n`;
        }
        prompt += `\`\`\`${ctx.code.language || ''}\n${ctx.code.content}\n\`\`\`\n\n`;
      }

      // Attached files
      if (ctx.files && ctx.files.length > 0) {
        prompt += `## Attached Files:\n\n`;
        for (const file of ctx.files.slice(0, 5)) { // Max 5 files
          prompt += `### ${file.path}\n\`\`\`\n${file.content.slice(0, 10000)}\n\`\`\`\n\n`;
        }
      }

      // Documentation
      if (ctx.documentation && ctx.documentation.length > 0) {
        prompt += `## Documentation:\n\n`;
        for (const doc of ctx.documentation) {
          prompt += `### ${doc.title}\n${doc.content}\n\n`;
        }
      }
    }

    // User's current question
    prompt += `## Current Question:\n\n${request.message}\n\n`;

    // Instructions
    prompt += `Please provide a helpful, accurate response. Use code examples when appropriate.`;

    return prompt;
  }

  /**
   * Read file contents for context
   */
  async readFiles(filePaths: string[], workingDirectory: string): Promise<Array<{ path: string; content: string; exists: boolean }>> {
    const files: Array<{ path: string; content: string; exists: boolean }> = [];

    for (const filePath of filePaths) {
      try {
        const fullPath = filePath.startsWith('/')
          ? filePath
          : `${workingDirectory}/${filePath}`;

        const content = await fs.readFile(fullPath, 'utf-8');
        files.push({ path: filePath, content, exists: true });
      } catch (error: any) {
        console.error(`[AI Assistant] Failed to read file ${filePath}:`, error);
        files.push({ path: filePath, content: `Error reading file: ${error.message}`, exists: false });
      }
    }

    return files;
  }
}
