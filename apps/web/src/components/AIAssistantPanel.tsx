import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
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
  const [streamingStatus, setStreamingStatus] = useState<string>('');
  const [streamingContent, setStreamingContent] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, streamingStatus]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

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
    setStreamingContent('');
    setStreamingStatus('Thinking...');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      console.log('[AI Assistant] Sending streaming message:', {
        message: input,
        hasContext: !!context,
        workingDirectory,
      });

      const response = await fetch('/api/ai/ask-stream', {
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
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));

              if (data.type === 'status') {
                setStreamingStatus(data.status || '');
              } else if (data.type === 'content') {
                fullContent += data.content;
                setStreamingContent(fullContent);
                // Clear thinking status once we have content
                setStreamingStatus('');
              } else if (data.type === 'error') {
                throw new Error(data.error);
              } else if (data.type === 'done') {
                // Finalize message
                const assistantMessage: Message = {
                  role: 'assistant',
                  content: fullContent,
                  timestamp: Date.now(),
                };
                setMessages(prev => [...prev, assistantMessage]);
                setStreamingContent('');
                setStreamingStatus('');
              }
            } catch (parseError) {
              console.warn('[AI Assistant] Failed to parse SSE data:', line);
            }
          }
        }
      }

      console.log('[AI Assistant] Streaming completed');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[AI Assistant] Request cancelled');
      } else {
        console.error('[AI Assistant] Error:', err);
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
      setStreamingStatus('');
      abortControllerRef.current = null;
    }
  };

  const cancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setStreamingStatus('');
      setStreamingContent('');
    }
  };

  const clearChat = () => {
    cancelRequest();
    setMessages([]);
    setError(null);
    setStreamingContent('');
    setStreamingStatus('');
  };

  const clearContext = () => {
    if (onContextChange) {
      onContextChange(undefined);
    }
  };

  return (
    <div className="flex flex-col h-full bg-light-surface dark:bg-dark-surface border-l border-light-border dark:border-dark-border shadow-xl">
      {/* Header with Clear Action */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-light-border dark:border-dark-border bg-light-surface/50 dark:bg-dark-surface/50 backdrop-blur-sm sticky top-0 z-10">
        <div>
          <h3 className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary uppercase tracking-wider">
            AI Assistant
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-1.5 text-light-text-muted dark:text-dark-text-muted hover:text-light-accent-error dark:hover:text-dark-accent-error hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated rounded-md transition-all"
              title="Clear Chat"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Messages Area - Linear Stream Style */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-[80%] opacity-50 select-none">
            <svg className="w-16 h-16 text-light-accent-primary dark:text-dark-accent-primary mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-lg font-medium text-light-text-primary dark:text-dark-text-primary">
              How can I help you today?
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className="group animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Role Header */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-bold uppercase tracking-wide ${
                msg.role === 'user' 
                  ? 'text-light-text-muted dark:text-dark-text-muted' 
                  : 'text-light-accent-primary dark:text-dark-accent-primary'
              }`}>
                {msg.role === 'user' ? 'You' : 'AI Assistant'}
              </span>
            </div>
            
            {/* Content */}
            <div className={`prose prose-sm dark:prose-invert max-w-none leading-relaxed ${
              msg.role === 'user' ? 'text-light-text-primary dark:text-dark-text-primary' : ''
            }`}>
              {msg.role === 'assistant' ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  components={{
                    pre: ({ children }) => (
                      <div className="my-4 rounded-lg overflow-hidden border border-light-border dark:border-dark-border not-prose shadow-sm">
                        {children}
                      </div>
                    ),
                    p: ({children}) => <p className="mb-4 last:mb-0">{children}</p>,
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      if (!inline && className && match) {
                        return (
                          <SyntaxHighlighter
                            style={vscDarkPlus}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{ margin: 0, padding: '1.5rem', fontSize: '0.9em' }}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        );
                      }
                      return (
                        <code className="bg-light-surface-elevated dark:bg-dark-surface-elevated px-1.5 py-0.5 rounded text-light-accent-primary dark:text-dark-accent-primary font-mono text-[0.9em]" {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Streaming State */}
        {(isLoading || streamingContent) && (
          <div className="group animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wide text-light-accent-primary dark:text-dark-accent-primary">
                AI Assistant
              </span>
            </div>
            
            {streamingContent ? (
              <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                 <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  components={{
                    pre: ({ children }) => (
                      <div className="my-4 rounded-lg overflow-hidden border border-light-border dark:border-dark-border not-prose shadow-sm">
                        {children}
                      </div>
                    ),
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      if (!inline && className && match) {
                        return (
                          <SyntaxHighlighter
                            style={vscDarkPlus}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{ margin: 0, padding: '1.5rem', fontSize: '0.9em' }}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        );
                      }
                      return <code className="bg-light-surface-elevated dark:bg-dark-surface-elevated px-1.5 py-0.5 rounded text-light-accent-primary dark:text-dark-accent-primary font-mono text-[0.9em]" {...props}>{children}</code>;
                    },
                  }}
                >
                  {streamingContent}
                </ReactMarkdown>
                <div className="h-4 w-2 bg-light-accent-primary dark:bg-dark-accent-primary animate-pulse inline-block align-middle ml-1"/>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-light-text-muted dark:text-dark-text-muted text-sm">
                <div className="flex gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-light-text-muted dark:text-dark-text-muted animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-light-text-muted dark:text-dark-text-muted animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-light-text-muted dark:text-dark-text-muted animate-bounce"></div>
                </div>
                {streamingStatus && <span className="italic opacity-80">{streamingStatus}</span>}
              </div>
            )}
          </div>
        )}

        {error && (
           <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">
             <strong>Error:</strong> {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Command Bar Style */}
      <div className="p-6 bg-transparent">
        <div className={`
          relative flex flex-col gap-2 
          bg-light-surface dark:bg-dark-surface 
          border transition-all duration-200 ease-in-out
          rounded-xl shadow-lg
          ${isLoading 
            ? 'border-light-border dark:border-dark-border opacity-80' 
            : 'border-light-border dark:border-dark-border focus-within:border-light-accent-primary dark:focus-within:border-dark-accent-primary focus-within:ring-1 focus-within:ring-light-accent-primary dark:focus-within:ring-dark-accent-primary'
          }
        `}>
          
          {/* Context Pills */}
          {context && (
            <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-1">
              {context.code && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs border border-blue-500/20">
                  <span className="opacity-70">📄</span>
                  <span className="font-medium truncate max-w-[150px]">{context.code.filePath || 'Selection'}</span>
                  {context.code.startLine && <span className="opacity-70">:{context.code.startLine}-{context.code.endLine}</span>}
                  <button onClick={clearContext} className="ml-1 hover:text-blue-700 dark:hover:text-blue-300">×</button>
                </div>
              )}
              {context.prContext && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs border border-purple-500/20">
                   <span className="opacity-70">🔀</span>
                   <span className="font-medium">#{context.prContext.prNumber}</span>
                   <button onClick={clearContext} className="ml-1 hover:text-purple-700 dark:hover:text-purple-300">×</button>
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask a question..."
              disabled={isLoading}
              rows={1}
              className="w-full px-4 py-3 bg-transparent border-0 focus:ring-0 text-light-text-primary dark:text-dark-text-primary placeholder-light-text-muted dark:placeholder-dark-text-muted resize-none max-h-[200px] text-[0.9375rem] leading-relaxed"
            />
            
            <div className="flex justify-between items-center px-2 pb-2">
               <div className="flex items-center gap-1">
                 {/* Future: Attachment buttons could go here */}
               </div>
               
               <button
                onClick={isLoading ? cancelRequest : sendMessage}
                disabled={!input.trim() && !isLoading}
                className={`
                  p-1.5 rounded-lg transition-all duration-200
                  ${!input.trim() && !isLoading
                    ? 'text-light-text-disabled dark:text-dark-text-disabled cursor-not-allowed'
                    : isLoading
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20'
                      : 'bg-light-accent-primary dark:bg-dark-accent-primary text-white shadow-sm hover:opacity-90'
                  }
                `}
              >
                {isLoading ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24">
                     <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19V5m0 0l-7 7m7-7l7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
        
        <div className="mt-2 text-center">
           <p className="text-[10px] text-light-text-muted dark:text-dark-text-muted opacity-60">
             Ai Assistant can make mistakes. Please review responses.
           </p>
        </div>
      </div>
    </div>
  );
}
