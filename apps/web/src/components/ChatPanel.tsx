import React, { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import {
  parseFileReferences,
  resolveFileReferences,
  stripFileReferences,
  formatFileReferencesForContext,
  type ResolvedFileReference,
} from '../utils/fileReferenceParser';
import { MentionAutocomplete, type MentionSuggestion } from './MentionAutocomplete';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  fileReferences?: ResolvedFileReference[]; // Store resolved file references
}

interface ChatPanelProps {
  sessionId: string;
  worktreePath: string;
  codeContext?: {
    filePath: string;
    fileContent: string;
    selectedCode?: string;
    lineStart?: number;
    lineEnd?: number;
  };
  commitHash?: string;
  onClose?: () => void;
  prContext?: {
    owner: string;
    repo: string;
    prNumber: number;
    title: string;
    description?: string;
  };
  aiReviewData?: any; // AI Review results
  changedFiles?: string[]; // List of changed file paths
}

export function ChatPanel({ sessionId, worktreePath, codeContext, commitHash, onClose, prContext, aiReviewData, changedFiles }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [detectedReferences, setDetectedReferences] = useState<string[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mention autocomplete state
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);

  // Build mention suggestions from AI review data and files
  const getMentionSuggestions = (): MentionSuggestion[] => {
    const suggestions: MentionSuggestion[] = [];

    // Add changed files as suggestions (limit to 20 most relevant)
    if (changedFiles && changedFiles.length > 0) {
      changedFiles.slice(0, 20).forEach((filePath) => {
        suggestions.push({
          type: 'file',
          id: filePath,
          label: filePath,
          description: 'Use @filepath or @filepath:line format',
        });
      });
    } else {
      // Show format example if no files available
      suggestions.push({
        type: 'file',
        id: 'example',
        label: 'Format: @filepath:line',
        description: 'Example: @src/components/ChatPanel.tsx:50',
      });
    }

    if (aiReviewData) {
      // Issue suggestions
      if (aiReviewData.issues) {
        aiReviewData.issues.slice(0, 10).forEach((issue: any, idx: number) => {
          suggestions.push({
            type: 'issue',
            id: idx.toString(),
            label: `Issue #${idx}: ${issue.file}:${issue.line}`,
            description: issue.message.substring(0, 100),
          });
        });
      }

      // Change intent suggestions
      if (aiReviewData.changeIntents) {
        aiReviewData.changeIntents.slice(0, 10).forEach((change: any, idx: number) => {
          suggestions.push({
            type: 'change',
            id: idx.toString(),
            label: `Change #${idx}: ${change.file}`,
            description: change.intent.substring(0, 100),
          });
        });
      }

      // Impact suggestions
      if (aiReviewData.impactAnalysis) {
        suggestions.push({
          type: 'impact',
          id: '0',
          label: 'Impact Analysis',
          description: `Scope: ${aiReviewData.impactAnalysis.scope || 'Unknown'}`,
        });
      }

      // Call stack suggestions
      if (aiReviewData.callStacks) {
        aiReviewData.callStacks.slice(0, 5).forEach((stack: any, idx: number) => {
          suggestions.push({
            type: 'callstack',
            id: idx.toString(),
            label: `Call Stack #${idx}`,
            description: stack.function || 'Function flow analysis',
          });
        });
      }

      // Semantic suggestions
      if (aiReviewData.semanticChanges) {
        const moved = aiReviewData.semanticChanges.movedCode?.slice(0, 5);
        moved?.forEach((move: any, idx: number) => {
          suggestions.push({
            type: 'semantic',
            id: `moved-${idx}`,
            label: `Moved: ${move.fromFile} → ${move.toFile}`,
            description: move.content?.substring(0, 100),
          });
        });

        const refactored = aiReviewData.semanticChanges.refactorings?.slice(0, 5);
        refactored?.forEach((refactor: any, idx: number) => {
          suggestions.push({
            type: 'semantic',
            id: `refactor-${idx}`,
            label: `Refactoring: ${refactor.file}`,
            description: refactor.description?.substring(0, 100),
          });
        });
      }
    }

    return suggestions;
  };

  // Detect @ input and show mention autocomplete
  const handleInputChange = (value: string) => {
    setInput(value);

    const cursorPosition = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const queryAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Show autocomplete if @ is followed by nothing or word characters
      if (/^[\w:\/\-_.]*$/.test(queryAfterAt)) {
        setMentionQuery(queryAfterAt);
        setMentionStartIndex(lastAtIndex);
        setShowMentions(true);

        // Calculate position for autocomplete dropdown
        if (textareaRef.current) {
          const textarea = textareaRef.current;
          const { top, left } = textarea.getBoundingClientRect();
          // Position above textarea (subtract approximate height of dropdown)
          setMentionPosition({
            top: top - 270, // ~264px max height + 6px padding
            left: left + 10,
          });
        }
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  // Handle mention selection
  const handleMentionSelect = (suggestion: MentionSuggestion) => {
    if (mentionStartIndex === -1) return;

    const beforeMention = input.substring(0, mentionStartIndex);
    const afterCursor = input.substring(textareaRef.current?.selectionStart || input.length);

    let insertText = '';
    switch (suggestion.type) {
      case 'file':
        // If it's an example, show format. Otherwise use actual file path
        if (suggestion.id === 'example') {
          insertText = '@filepath:line';
        } else {
          insertText = `@${suggestion.id}`;
        }
        break;
      case 'issue':
        insertText = `@issue:${suggestion.id}`;
        break;
      case 'change':
        insertText = `@change:${suggestion.id}`;
        break;
      case 'impact':
        insertText = `@impact:${suggestion.id}`;
        break;
      case 'callstack':
        insertText = `@callstack:${suggestion.id}`;
        break;
      case 'semantic':
        insertText = `@semantic:${suggestion.id}`;
        break;
    }

    const newInput = beforeMention + insertText + ' ' + afterCursor;
    setInput(newInput);
    setShowMentions(false);

    // Focus back to textarea
    setTimeout(() => {
      textareaRef.current?.focus();
      const newCursorPos = beforeMention.length + insertText.length + 1;
      textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Detect file references in input as user types
  useEffect(() => {
    const references = parseFileReferences(input);
    setDetectedReferences(references.map(ref => ref.raw));
  }, [input]);

  // Load chat history from localStorage
  useEffect(() => {
    const storageKey = `chat-history-${sessionId}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setMessages(parsed);
      } catch (error) {
        console.error('Failed to parse chat history:', error);
      }
    }
  }, [sessionId]);

  // Save chat history to localStorage
  useEffect(() => {
    const storageKey = `chat-history-${sessionId}`;
    if (messages.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, sessionId]);

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async (userMessage: string) => {
      // Parse file references from message
      const fileRefs = parseFileReferences(userMessage);
      const resolvedRefs = await resolveFileReferences(fileRefs, worktreePath);

      // Clean message by removing @file:line references
      const cleanMessage = stripFileReferences(userMessage);

      // Add user message to history (with file references)
      const userMsg: ChatMessage = {
        id: Date.now(),
        role: 'user',
        content: userMessage, // Keep original message with @references for display
        createdAt: new Date().toISOString(),
        fileReferences: resolvedRefs,
      };
      setMessages(prev => [...prev, userMsg]);

      // Build context with file references
      let contextMessage = cleanMessage;

      // Add file references to message context
      if (resolvedRefs.length > 0) {
        const fileContext = formatFileReferencesForContext(resolvedRefs);
        contextMessage = `${cleanMessage}\n\n---\nReferenced Files:\n${fileContext}`;
      }

      // Build comprehensive context
      const context: any = {};

      // Add selected code context if available
      if (codeContext) {
        context.code = {
          content: codeContext.selectedCode || codeContext.fileContent,
          language: 'typescript', // TODO: detect language
          filePath: codeContext.filePath,
          startLine: codeContext.lineStart,
          endLine: codeContext.lineEnd,
        };
      }

      // Add PR context if available
      if (prContext) {
        context.prContext = {
          owner: prContext.owner,
          repo: prContext.repo,
          prNumber: prContext.prNumber,
          title: prContext.title,
          description: prContext.description,
        };
      }

      // Add minimal AI Review summary if available (avoid overwhelming context)
      if (aiReviewData?.summary) {
        context.documentation = [{
          title: 'AI Review Summary',
          content: aiReviewData.summary,
        }];
      }

      // Add workspace path info for agent to access project files
      if (worktreePath) {
        context.workspace = {
          path: worktreePath,
          description: 'PR worktree path - use file operations to read/analyze any file in this directory',
        };
      }

      // Build history for API (last 10 messages, using clean versions)
      const history = messages.slice(-10).map(msg => ({
        role: msg.role,
        content: stripFileReferences(msg.content), // Strip references from history
        timestamp: new Date(msg.createdAt).getTime(),
      }));

      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: contextMessage, // Send message with file contents
          history,
          context,
          workingDirectory: worktreePath,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to send message' }));
        throw new Error(error.message || 'Failed to send message');
      }

      const result = await response.json();
      return result.response;
    },
    onSuccess: (assistantResponse: string) => {
      // Use typing effect for assistant response
      typeMessage(assistantResponse, () => {
        // Add assistant message to history after typing completes
        const assistantMsg: ChatMessage = {
          id: Date.now() + 1,
          role: 'assistant',
          content: assistantResponse,
          createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMsg]);
        setStreamingMessage('');
      });
      setInput('');
      setDetectedReferences([]);
    },
  });

  // Clear history
  const clearHistory = () => {
    setMessages([]);
    const storageKey = `chat-history-${sessionId}`;
    localStorage.removeItem(storageKey);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  // Typing effect for streaming message
  const typeMessage = (fullMessage: string, onComplete: () => void) => {
    setIsStreaming(true);
    setStreamingMessage('');

    let currentIndex = 0;
    const chunkSize = 3; // Characters to add per tick
    const delay = 10; // ms between ticks

    const typeNextChunk = () => {
      if (currentIndex < fullMessage.length) {
        currentIndex += chunkSize;
        setStreamingMessage(fullMessage.substring(0, currentIndex));
        setTimeout(typeNextChunk, delay);
      } else {
        setIsStreaming(false);
        onComplete();
      }
    };

    typeNextChunk();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !sendMessage.isPending) {
      sendMessage.mutate(input);
    }
  };

  return (
    <div className="h-full flex flex-col bg-light-surface dark:bg-dark-surface
                    border-l border-light-border dark:border-dark-border">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-light-border dark:border-dark-border">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
            AI Assistant
          </h3>
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className="px-3 py-1 text-sm rounded-md transition-colors
                       bg-light-surface-elevated dark:bg-dark-surface-elevated
                       text-light-text-secondary dark:text-dark-text-secondary
                       hover:bg-light-accent-error/10 dark:hover:bg-dark-accent-error/10
                       hover:text-light-accent-error dark:hover:text-dark-accent-error"
            >
              Clear
            </button>
          )}
        </div>
        {codeContext?.selectedCode && (
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-2">
            Context: {codeContext.filePath} (lines {codeContext.lineStart}-{codeContext.lineEnd})
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3 max-w-md">
              <p className="text-light-text-muted dark:text-dark-text-muted mb-2">
                Select code and ask me anything!
              </p>
              <div className="text-xs text-light-text-muted dark:text-dark-text-muted space-y-1">
                <p className="font-semibold mb-2">Examples:</p>
                <p>• "Explain this function"</p>
                <p>• "What changed in <span className="font-mono text-light-accent-primary dark:text-dark-accent-primary">@src/App.tsx</span>?"</p>
                <p>• "Explain <span className="font-mono text-light-accent-primary dark:text-dark-accent-primary">@src/utils/helper.ts:50</span>"</p>
                <p>• "What does <span className="font-mono text-light-accent-primary dark:text-dark-accent-primary">@issue:0</span> mean?"</p>
                <p>• "Show me <span className="font-mono text-light-accent-primary dark:text-dark-accent-primary">@callstack:0</span>"</p>
                <p className="mt-2 pt-2 border-t border-light-border dark:border-dark-border">
                  Type <span className="font-mono text-light-accent-primary dark:text-dark-accent-primary">@</span> to see all available references
                </p>
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            {/* File reference tags (only for user messages) */}
            {message.role === 'user' && message.fileReferences && message.fileReferences.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1 max-w-[80%]">
                {message.fileReferences.map((ref, idx) => (
                  <span
                    key={idx}
                    className={`text-xs px-2 py-0.5 rounded-md ${
                      ref.exists
                        ? 'bg-light-accent-success/20 dark:bg-dark-accent-success/20 text-light-accent-success dark:text-dark-accent-success border border-light-accent-success/30 dark:border-dark-accent-success/30'
                        : 'bg-light-accent-error/20 dark:bg-dark-accent-error/20 text-light-accent-error dark:text-dark-accent-error border border-light-accent-error/30 dark:border-dark-accent-error/30'
                    }`}
                    title={ref.exists ? 'File found' : 'File not found'}
                  >
                    <svg className="w-3 h-3 inline-block mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                    </svg>
                    {ref.raw}
                  </span>
                ))}
              </div>
            )}

            {/* Message bubble */}
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-light-accent-primary dark:bg-dark-accent-primary text-white'
                  : 'bg-light-surface-elevated dark:bg-dark-surface-elevated'
              }`}
            >
              {message.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none
                              prose-pre:bg-light-surface-elevated dark:prose-pre:bg-dark-surface-elevated
                              prose-code:text-light-accent-primary dark:prose-code:text-dark-accent-primary">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      pre: ({ children }) => <div className="my-4 not-prose">{children}</div>,
                      p: ({node, children, ...props}) => {
                        const hasCodeBlock = React.Children.toArray(children).some((child: any) => {
                          return child?.props?.className?.includes('language-');
                        });
                        const Element = hasCodeBlock ? 'div' : 'p';
                        return (
                          <Element className="mb-2 last:mb-0" {...props}>
                            {children}
                          </Element>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{stripFileReferences(message.content)}</p>
              )}
            </div>
          </div>
        ))}

        {/* Streaming message (typing effect) */}
        {isStreaming && streamingMessage && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg p-3 bg-light-surface-elevated dark:bg-dark-surface-elevated">
              <div className="prose prose-sm dark:prose-invert max-w-none
                            prose-pre:bg-light-surface-elevated dark:prose-pre:bg-dark-surface-elevated
                            prose-code:text-light-accent-primary dark:prose-code:text-dark-accent-primary">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    pre: ({ children }) => <div className="my-4 not-prose">{children}</div>,
                    p: ({node, children, ...props}) => {
                      const hasCodeBlock = React.Children.toArray(children).some((child: any) => {
                        return child?.props?.className?.includes('language-');
                      });
                      const Element = hasCodeBlock ? 'div' : 'p';
                      return (
                        <Element className="mb-2 last:mb-0" {...props}>
                          {children}
                        </Element>
                      );
                    },
                  }}
                >
                  {streamingMessage}
                </ReactMarkdown>
                <span className="inline-block w-2 h-4 bg-light-accent-primary dark:bg-dark-accent-primary animate-pulse ml-1" />
              </div>
            </div>
          </div>
        )}

        {sendMessage.isPending && !isStreaming && (
          <div className="flex justify-start">
            <div className="bg-light-surface-elevated dark:bg-dark-surface-elevated
                          rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-light-accent-primary dark:bg-dark-accent-primary
                              rounded-full animate-pulse" />
                <div className="w-2 h-2 bg-light-accent-primary dark:bg-dark-accent-primary
                              rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                <div className="w-2 h-2 bg-light-accent-primary dark:bg-dark-accent-primary
                              rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}

        {sendMessage.isError && (
          <div className="bg-light-accent-error/10 dark:bg-dark-accent-error/10
                        border border-light-accent-error dark:border-dark-accent-error
                        rounded-lg p-3">
            <p className="text-sm text-light-accent-error dark:text-dark-accent-error">
              {(sendMessage.error as Error).message}
            </p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex-shrink-0 p-4 border-t border-light-border dark:border-dark-border">
        {/* Detected file references preview */}
        {detectedReferences.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {detectedReferences.map((ref, idx) => (
              <span
                key={idx}
                className="text-xs px-2 py-0.5 rounded-md
                         bg-light-accent-primary/20 dark:bg-dark-accent-primary/20
                         text-light-accent-primary dark:text-dark-accent-primary
                         border border-light-accent-primary/30 dark:border-dark-accent-primary/30"
              >
                <svg className="w-3 h-3 inline-block mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
                {ref}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !showMentions) {
                e.preventDefault();
                handleSubmit(e);
              }
              // Close autocomplete on Escape
              if (e.key === 'Escape' && showMentions) {
                e.preventDefault();
                setShowMentions(false);
              }
            }}
            placeholder="Ask about the code... (type @ to reference files, issues, changes, etc.)"
            disabled={sendMessage.isPending}
            rows={3}
            className="flex-1 px-4 py-2 rounded-lg resize-none text-sm
                     bg-light-surface-elevated dark:bg-dark-surface-elevated
                     border border-light-border dark:border-dark-border
                     text-light-text-primary dark:text-dark-text-primary
                     placeholder-light-text-muted dark:placeholder-dark-text-muted
                     focus:outline-none focus:ring-2 focus:ring-light-accent-primary dark:focus:ring-dark-accent-primary
                     disabled:opacity-50"
          />

          {/* Mention Autocomplete */}
          {showMentions && (
            <MentionAutocomplete
              query={mentionQuery}
              suggestions={getMentionSuggestions()}
              onSelect={handleMentionSelect}
              onClose={() => setShowMentions(false)}
              position={mentionPosition}
            />
          )}
          <button
            type="submit"
            disabled={!input.trim() || sendMessage.isPending}
            className="px-6 py-2 rounded-lg font-medium transition-opacity self-end
                     bg-light-accent-primary dark:bg-dark-accent-primary
                     text-white
                     hover:opacity-90
                     disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
        <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-2">
          Press Enter to send, Shift+Enter for new line. Type <span className="font-mono text-light-accent-primary dark:text-dark-accent-primary">@</span> to reference files, issues, changes, impacts, call stacks, and semantic changes.
        </p>
      </form>
    </div>
  );
}
