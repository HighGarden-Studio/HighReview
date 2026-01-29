import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface AssistantContext {
  code?: {
    content: string;
    language: string;
    filePath?: string;
    startLine?: number;
    endLine?: number;
  };
  files?: Array<{
    path: string;
    content: string;
  }>;
  prContext?: {
    owner: string;
    repo: string;
    prNumber: number;
    title: string;
    description: string;
  };
}

interface AIAssistantPanelProps {
  workingDirectory: string;
  context?: AssistantContext;
  onContextChange?: (context: AssistantContext | undefined) => void;
}

export function AIAssistantPanel({ workingDirectory, context, onContextChange }: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      console.log('[AI Assistant] Sending message:', {
        message: input,
        hasContext: !!context,
        workingDirectory,
      });

      const response = await fetch('http://localhost:8765/api/ai/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: input,
          history: messages,
          context,
          workingDirectory,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Request failed: ${response.statusText}`);
      }

      const data = await response.json();

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      console.log('[AI Assistant] Response received:', {
        responseLength: data.response.length,
        metadata: data.metadata,
      });
    } catch (err: any) {
      console.error('[AI Assistant] Error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const clearContext = () => {
    if (onContextChange) {
      onContextChange(undefined);
    }
  };

  return (
    <div className="flex flex-col h-full bg-light-surface dark:bg-dark-surface rounded-lg border border-light-border dark:border-dark-border">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
        <div>
          <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
            AI Assistant
          </h3>
          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
            Ask questions about code, get suggestions, and more
          </p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="px-3 py-1.5 text-sm rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary transition-colors"
            >
              Clear Chat
            </button>
          )}
        </div>
      </div>

      {/* Context Info */}
      {context && (
        <div className="p-3 bg-blue-500/10 border-b border-blue-500/20">
          <div className="flex items-start justify-between">
            <div className="text-sm">
              <p className="font-medium text-blue-600 dark:text-blue-400 mb-1">Context attached:</p>
              {context.code && (
                <p className="text-light-text-secondary dark:text-dark-text-secondary">
                  📄 {context.code.filePath || 'Selected code'}
                  {context.code.startLine && ` (Lines ${context.code.startLine}-${context.code.endLine})`}
                </p>
              )}
              {context.files && context.files.length > 0 && (
                <p className="text-light-text-secondary dark:text-dark-text-secondary">
                  📁 {context.files.length} file{context.files.length > 1 ? 's' : ''} attached
                </p>
              )}
              {context.prContext && (
                <p className="text-light-text-secondary dark:text-dark-text-secondary">
                  🔀 PR #{context.prContext.prNumber}: {context.prContext.title}
                </p>
              )}
            </div>
            <button
              onClick={clearContext}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              title="Clear context"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <div className="text-4xl mb-2">💬</div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary">
                Ask me anything about your code!
              </p>
              <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-2">
                I can help with code review, debugging, explanations, and more.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-light-accent-primary dark:bg-dark-accent-primary text-white'
                  : 'bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary border border-light-border dark:border-dark-border'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown
                    components={{
                      code({ node, inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                          <SyntaxHighlighter
                            style={vscDarkPlus}
                            language={match[1]}
                            PreTag="div"
                            {...props}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg p-3 border border-light-border dark:border-dark-border">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-light-accent-primary dark:bg-dark-accent-primary animate-pulse"></div>
                <div className="w-2 h-2 rounded-full bg-light-accent-primary dark:bg-dark-accent-primary animate-pulse delay-75"></div>
                <div className="w-2 h-2 rounded-full bg-light-accent-primary dark:bg-dark-accent-primary animate-pulse delay-150"></div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">Error: {error}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-light-border dark:border-dark-border">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask a question... (Shift+Enter for new line)"
            disabled={isLoading}
            className="flex-1 px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary placeholder-light-text-muted dark:placeholder-dark-text-muted focus:outline-none focus:ring-2 focus:ring-light-accent-primary dark:focus:ring-dark-accent-primary resize-none disabled:opacity-50"
            rows={2}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 rounded-lg bg-light-accent-primary dark:bg-dark-accent-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              '→'
            )}
          </button>
        </div>
        <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
