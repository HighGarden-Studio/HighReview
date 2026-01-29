import { execa } from 'execa';
import { spawn } from 'child_process';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CodeContext {
  filePath: string;
  fileContent: string;
  selectedCode?: string;
  lineStart?: number;
  lineEnd?: number;
}

export class AIService {
  private claudeCodeAvailable: boolean | null = null;

  constructor() {
    // Check if Claude Code is available on startup
    this.checkClaudeCodeInstalled();
  }

  /**
   * Check if Claude Code CLI is installed
   */
  private async checkClaudeCodeInstalled(): Promise<void> {
    try {
      await execa('which', ['claude']);
      this.claudeCodeAvailable = true;
      console.log('[AI] Claude Code CLI detected');
    } catch (error) {
      this.claudeCodeAvailable = false;
      console.log('[AI] Claude Code CLI not found in PATH');
    }
  }

  /**
   * Check if AI service is configured
   */
  async isConfigured(): Promise<boolean> {
    if (this.claudeCodeAvailable === null) {
      await this.checkClaudeCodeInstalled();
    }
    return this.claudeCodeAvailable === true;
  }

  /**
   * Create a complete prompt with system instructions and code context
   */
  private createPrompt(
    question: string,
    codeContext?: CodeContext,
    conversationHistory: AIMessage[] = []
  ): string {
    let prompt = `You are a senior code reviewer and software engineer helping with pull request reviews.

Your responsibilities:
- Explain code clearly and concisely
- Point out potential issues or improvements
- Consider the context of a PR/code change
- Provide actionable advice
- Be helpful and constructive

`;

    // Add conversation history
    if (conversationHistory.length > 0) {
      prompt += `Previous conversation:\n`;
      conversationHistory.forEach((msg) => {
        prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n\n`;
      });
    }

    // Add code context
    if (codeContext) {
      prompt += `Current file context:\n`;
      prompt += `- File: ${codeContext.filePath}\n`;

      if (codeContext.selectedCode) {
        prompt += `- Selected code (lines ${codeContext.lineStart}-${codeContext.lineEnd}):\n\`\`\`\n${codeContext.selectedCode}\n\`\`\`\n\n`;
      } else if (codeContext.fileContent) {
        // Truncate file content if too long (Claude Code has token limits)
        const maxChars = 50000;
        const content =
          codeContext.fileContent.length > maxChars
            ? codeContext.fileContent.substring(0, maxChars) + '\n... (truncated)'
            : codeContext.fileContent;
        prompt += `- Full file content:\n\`\`\`\n${content}\n\`\`\`\n\n`;
      }
    }

    prompt += `User question: ${question}\n`;

    return prompt;
  }

  /**
   * Ask Claude Code CLI a question about code
   */
  async ask(
    question: string,
    codeContext?: CodeContext,
    conversationHistory: AIMessage[] = []
  ): Promise<string> {
    if (!(await this.isConfigured())) {
      throw new Error(
        'Claude Code CLI not found. Please install it with: npm install -g @anthropic-ai/claude-code'
      );
    }

    try {
      const fullPrompt = this.createPrompt(question, codeContext, conversationHistory);

      console.log('[AI] Sending request to Claude Code CLI...');
      console.log('[AI] Prompt length:', fullPrompt.length, 'characters');

      // Use claude CLI in non-interactive mode with print flag
      const { stdout, stderr } = await execa('claude', ['--print', '--no-session-persistence'], {
        input: fullPrompt,
        timeout: 60000, // 60 second timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      if (stderr) {
        console.log('[AI] Claude Code stderr:', stderr);
      }

      const response = stdout.trim();
      console.log('[AI] Response received:', response.substring(0, 200) + '...');

      if (!response) {
        throw new Error('Empty response from Claude Code CLI');
      }

      return response;
    } catch (error: any) {
      console.error('[AI] Error:', error);

      if (error.timedOut) {
        throw new Error('Request timed out. The question might be too complex.');
      }

      if (error.stderr) {
        throw new Error(`Claude Code error: ${error.stderr}`);
      }

      throw new Error(`AI request failed: ${error.message}`);
    }
  }

  /**
   * Generate a concise explanation for selected code
   */
  async explainCode(code: string, filePath: string, language?: string): Promise<string> {
    const question = `Please explain what this code does:

\`\`\`${language || 'typescript'}
${code}
\`\`\``;

    return this.ask(question, {
      filePath,
      fileContent: code,
      selectedCode: code,
    });
  }

  /**
   * Review code and suggest improvements
   */
  async reviewCode(code: string, filePath: string): Promise<string> {
    const question = `Please review this code and suggest any improvements or potential issues:

\`\`\`
${code}
\`\`\``;

    return this.ask(question, {
      filePath,
      fileContent: code,
      selectedCode: code,
    });
  }
}
