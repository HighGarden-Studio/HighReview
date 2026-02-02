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

  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`);
      if (!response.ok) return [];
      
      const data: any = await response.json();
      return data.data?.map((m: any) => m.id) || [];
    } catch (error) {
      console.warn('[LMStudioProvider] Failed to fetch models:', error);
      return [];
    }
  }

  async reviewStream(request: AIReviewRequest & { onChunk: (chunk: string) => void }): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('[LMStudioProvider] Starting streaming review...');
      console.log(`[LMStudioProvider] Model: ${request.model || 'auto-detect'}`);
      
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model || 'local-model',
          messages: [{ role: 'user', content: request.prompt }],
          temperature: 0.3,
          max_tokens: 32768,
          stream: true, // Enable streaming
        }),
        signal: AbortSignal.timeout(request.timeout || 300000),
      });
      
      if (!response.ok) {
        let errorMsg = `LM Studio API error: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json() as any;
          if (errorData.error?.message) {
            errorMsg = `LM Studio error: ${errorData.error.message}`;
          }
        } catch (e) {
          // Ignore JSON parse error
        }
        throw new Error(errorMsg);
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body received from LM Studio');
      }
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last line if it's incomplete
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                request.onChunk(content);
              }
            } catch (e) {
              console.warn('[LMStudioProvider] Failed to parse stream chunk:', e);
            }
          }
        }
      }
      
      const duration = Date.now() - startTime;
      console.log('[LMStudioProvider] Streaming completed:', { duration: `${duration}ms` });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[LMStudioProvider] Streaming failed:', error);
      
      // Friendly error if connection failed
      if (error.cause?.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
        throw new Error(
          `Could not connect to LM Studio at ${this.baseUrl}. Please make sure LM Studio is running and the local server is started.`
        );
      }
      
      throw new Error(`LM Studio streaming failed: ${error.message}`);
    }
  }

  private resolveContextWindow(modelId: string): number {
    // Use 16384 tokens as default for all models
    // If LM Studio context overflow errors occur, increase context length in LM Studio settings
    return 16384;
  }

  async review(request: AIReviewRequest): Promise<AIReviewResponse> {
    const startTime = Date.now();
    let model = request.model;

    try {
      console.log('[LMStudioProvider] Starting review...');

      // Auto-detect model if not specified
      if (!model) {
        console.log('[LMStudioProvider] No model specified, attempting to auto-detect...');
        const models = await this.getModels();
        if (models.length > 0) {
          model = models[0];
          console.log(`[LMStudioProvider] Auto-detected model: ${model}`);
        } else {
          console.warn('[LMStudioProvider] Could not auto-detect model, falling back to "local-model"');
          model = 'local-model';
        }
      }

      console.log(`[LMStudioProvider] Model: ${model}`);
      console.log(`[LMStudioProvider] Prompt length: ${request.prompt.length} chars`);

      // Resolve context window and safe char limit
      // We assume ~4 chars per token. We leave 1000 tokens for safety/response.
      const contextWindow = this.resolveContextWindow(model);
      const safeTokenLimit = Math.max(contextWindow - 1000, 2000); // Reserve 1k for response, min 2k input
      const MAX_CHARS = safeTokenLimit * 4;

      console.log(`[LMStudioProvider] Context Window: ~${contextWindow} tokens`);
      console.log(`[LMStudioProvider] Safe Input Limit: ~${safeTokenLimit} tokens (~${MAX_CHARS} chars)`);
      
      let promptToSend = request.prompt;
      
      if (promptToSend.length > MAX_CHARS) {
        console.warn(`[LMStudioProvider] Prompt massive (${promptToSend.length} chars). Truncating to ${MAX_CHARS} chars to prevent context overflow.`);
        promptToSend = promptToSend.slice(0, MAX_CHARS) + '\n...(truncated due to length)...';
      }

      // Build language instruction
      const langMap: Record<string, string> = {
        'ko': '한국어', 'en': 'English', 'ja': '日本語', 'zh': '中文', 'es': 'Español', 'de': 'Deutsch', 'fr': 'Français'
      };
      const langInstruction = request.language && langMap[request.language] 
        ? `IMPORTANT: Respond in ${langMap[request.language]} language.\n` 
        : '';

      // Build options-based sections instruction
      const opts = request.options || {};
      const optionalSections: string[] = [];
      if (opts.analyzeChangeIntent) optionalSections.push('"changeIntents": [{"file": "path/file.rb", "intent": "Add feature", "motivation": "User requested..."}]');
      if (opts.generateCallStack) optionalSections.push('"callStacks": [{"function": "foo", "file": "file.rb", "callers": ["bar", "baz"]}]');
      if (opts.analyzeBroaderImpact) optionalSections.push('"impactAnalysis": {"scope": "Module", "affectedAreas": ["Auth", "API"]}');
      
      const optionalSectionExample = optionalSections.length > 0 ? `,\n  ${optionalSections.join(',\n  ')}` : '';

      const body: any = {
        model: model,
        messages: [
          {
            role: 'system',
            content: `${langInstruction}You are an expert code reviewer. Respond ONLY with a valid JSON object matching this EXACT structure:
{
  "summary": "Brief review summary",
  "criticalIssues": [{"file": "path/file.rb", "line": 10, "message": "Issue description", "severity": "critical", "category": "Security"}],
  "warnings": [{"file": "path/file.rb", "line": 20, "message": "Warning description", "severity": "warning", "category": "Performance"}],
  "suggestions": [{"file": "path/file.rb", "line": 30, "message": "Suggestion description", "severity": "suggestion", "category": "Best Practice"}]${optionalSectionExample}
}
IMPORTANT: Each issue MUST have "file", "line", "message", "severity", "category" fields.`,
          },
          {
            role: 'user',
            content: promptToSend,
          },
        ],
        temperature: 0.3,
        stream: false,
        max_tokens: 32768,
        // Force JSON output using OpenAI-compatible response_format
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'code_review',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                criticalIssues: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      file: { type: 'string' },
                      line: { type: 'integer' },
                      message: { type: 'string' },
                      severity: { type: 'string' },
                      category: { type: 'string' }
                    },
                    required: ['file', 'line', 'message', 'severity', 'category'],
                    additionalProperties: false
                  }
                },
                warnings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      file: { type: 'string' },
                      line: { type: 'integer' },
                      message: { type: 'string' },
                      severity: { type: 'string' },
                      category: { type: 'string' }
                    },
                    required: ['file', 'line', 'message', 'severity', 'category'],
                    additionalProperties: false
                  }
                },
                suggestions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      file: { type: 'string' },
                      line: { type: 'integer' },
                      message: { type: 'string' },
                      severity: { type: 'string' },
                      category: { type: 'string' }
                    },
                    required: ['file', 'line', 'message', 'severity', 'category'],
                    additionalProperties: false
                  }
                },
                // Optional enhanced sections
                changeIntents: { type: 'array' },
                callStacks: { type: 'array' },
                impactAnalysis: { type: 'object' }
              },
              required: ['summary', 'criticalIssues', 'warnings', 'suggestions']
            }
          }
        }
      };

      // Only add max_tokens if explicitly requested, otherwise let LM Studio handle it
      if (request.timeout) {
         // Using a timeout heuristic or just avoiding sending explicit max_tokens 
      }

      // LM Studio local models can be very slow - use 60 minute default timeout
      const lmStudioTimeout = request.timeout || 3600000; // 60 minutes default for LM Studio
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(lmStudioTimeout),
      });

      if (!response.ok) {
        let errorMsg = `LM Studio API error: ${response.status} ${response.statusText}`;
        try {
          const errorText = await response.text();
          console.error('[LMStudioProvider] Raw error response:', errorText);
          
          try {
             const errorData = JSON.parse(errorText);
             if (errorData.error?.message) {
               errorMsg = `LM Studio error: ${errorData.error.message}`;
             }
          } catch {
             if (errorText.length < 200) errorMsg += ` - ${errorText}`;
          }
        } catch (e) {
          // Ignore read error
        }
        throw new Error(errorMsg);
      }

      const data: any = await response.json();
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
          model: data.model || model || 'local-model',
          provider: 'lmstudio',
          duration,
        },
      };
    } catch (error: any) {
      console.error('[LMStudioProvider] Review failed:', error);
      
      // Friendly error if connection failed
      if (error.cause?.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
        throw new Error(
          `Could not connect to LM Studio at ${this.baseUrl}. Please make sure LM Studio is running and the local server is started.`
        );
      }
      
      throw new Error(`LM Studio failed: ${error.message}`);
    }
  }
}
