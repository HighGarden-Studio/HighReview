import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import {
  parseReferences,
  resolveReferences,
  stripReferences,
  formatReferencesForContext,
  type ResolvedReference,
} from '../utils/referenceParser';
import { MentionAutocomplete, type MentionSuggestion } from './MentionAutocomplete';
import { useLanguage } from '../contexts/LanguageContext';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  references?: ResolvedReference[]; // Store resolved references
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

export function ChatPanel({ sessionId, worktreePath, codeContext, prContext, aiReviewData, changedFiles }: ChatPanelProps) {
  const { language } = useLanguage();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mention autocomplete state
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  // Fetch AI Config
  const [aiConfig, setAiConfig] = useState<{
    provider: string | null;
    model: string | null;
    providerName: string | null;
  }>({ provider: null, model: null, providerName: null });

  useEffect(() => {
    const fetchAIConfig = async () => {
      try {
        const response = await fetch('/api/ai/providers');
        if (response.ok) {
          const data = await response.json();
          const selectedProvider = data.providers?.[data.selected];
          setAiConfig({
            provider: data.selected,
            model: data.selectedModel || (selectedProvider?.models?.[0] ?? null),
            providerName: selectedProvider ? selectedProvider.name : data.selected
          });
        }
      } catch (error) {
        console.error('Failed to fetch AI config:', error);
      }
    };

    fetchAIConfig();
  }, []);


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
      // Issue suggestions (merge all types)
      const allIssues = [
        ...(aiReviewData.criticalIssues || []),
        ...(aiReviewData.warnings || []),
        ...(aiReviewData.suggestions || []),
      ];

      if (allIssues.length > 0) {
        allIssues.slice(0, 20).forEach((issue: any, idx: number) => {
          suggestions.push({
            type: 'issue',
            id: (idx + 1).toString(),
            label: `Issue #${idx + 1}: ${issue.file}:${issue.line}`,
            description: issue.message.substring(0, 100),
          });
        });
      }

      // Change intent suggestions
      if (aiReviewData.changeIntents) {
        aiReviewData.changeIntents.slice(0, 10).forEach((change: any, idx: number) => {
          suggestions.push({
            type: 'change',
            id: (idx + 1).toString(),
            label: `Change #${idx + 1}: ${change.file || 'Global'}`,
            description: change.intent.substring(0, 100),
          });
        });
      }

      // Impact suggestions
      if (aiReviewData.impactAnalysis) {
        suggestions.push({
          type: 'impact',
          id: '1',
          label: 'Impact Analysis',
          description: `Scope: ${aiReviewData.impactAnalysis.scope || 'Unknown'}`,
        });
      }

      // Call stack suggestions
      if (aiReviewData.callStacks) {
        aiReviewData.callStacks.slice(0, 10).forEach((stack: any, idx: number) => {
          suggestions.push({
            type: 'callstack',
            id: (idx + 1).toString(),
            label: `Call Stack #${idx + 1}: ${stack.function}`,
            description: stack.file,
          });
        });
      }

      // Semantic suggestions (Moved Code & Refactorings)
      if (aiReviewData.movedCode) {
        aiReviewData.movedCode.slice(0, 5).forEach((move: any, idx: number) => {
          suggestions.push({
            type: 'semantic',
            id: (idx + 1).toString(),
            label: `Moved #${idx + 1}: ${move.from} → ${move.to}`,
            description: `${move.lines} lines moved`,
          });
        });
      }

      if (aiReviewData.refactorings) {
        aiReviewData.refactorings.slice(0, 5).forEach((refactor: any, idx: number) => {
          suggestions.push({
            type: 'refactor',
            id: (idx + 1).toString(),
            label: `Refactor #${idx + 1}: ${refactor.type}`,
            description: refactor.description?.substring(0, 100),
          });
        });
      }
    }

    return suggestions;
  };



  const handleInputChange = (value: string) => {
    setInput(value);
    
    // Simple regex to find @ mentions
    const cursorPosition = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtSymbol !== -1) {
      const query = textBeforeCursor.slice(lastAtSymbol + 1);
      // Only show mentions if there's no space after @ and we're typing
      if (!/\s/.test(query)) {
        setShowMentions(true);
        setMentionQuery(query);
        return;
      }
    }
    
    setShowMentions(false);
  };

  const handleMentionSelect = (suggestion: MentionSuggestion) => {
    const cursorPosition = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = input.slice(0, cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    
    const beforeMention = input.slice(0, lastAtSymbol);
    const afterMention = input.slice(cursorPosition);
    
    // Format the reference based on type
    let referenceText = '';
    const needsQuotes = (s: string) => /\s/.test(s);
    const formatValue = (v: string) => (needsQuotes(v) ? `"${v}"` : v);

    switch (suggestion.type) {
      case 'file':
        referenceText = `@file:${formatValue(suggestion.id)}`;
        break;
      case 'issue':
        referenceText = `@issue:${suggestion.id}`;
        break;
      case 'change':
        referenceText = `@change:${suggestion.id}`;
        break;
      case 'impact':
        referenceText = `@impact:${suggestion.id}`;
        break;
      case 'callstack':
        referenceText = `@callstack:${suggestion.id}`;
        break;
      case 'semantic':
        referenceText = `@semantic:${suggestion.id}`;
        break;
      case 'refactor':
        referenceText = `@refactor:${suggestion.id}`;
        break;
      default:
        referenceText = `@${suggestion.type}:${formatValue(suggestion.id)}`;
    }
    
    const newValue = `${beforeMention}${referenceText} ${afterMention}`;
    setInput(newValue);
    setShowMentions(false);
    
    // Focus back on textarea
    textareaRef.current?.focus();
  };

  const detectedReferences = useMemo(() => {
    // Basic regex to detect @references in the input
    // Supports @type:value and @type:"value with space"
    return input.match(/@(file|issue|change|impact|semantic|refactor|callstack):(?:(?:"[^"]+")|[^\s]+)/gi) || [];
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
      // Parse references from message
      const refs = parseReferences(userMessage);

      // Unify issues for reference resolution
      const unifiedAIReviewData = aiReviewData ? {
        ...aiReviewData,
        issues: [
          ...(aiReviewData.criticalIssues || []),
          ...(aiReviewData.warnings || []),
          ...(aiReviewData.suggestions || []),
        ]
      } : aiReviewData;

      const resolvedRefs = await resolveReferences(refs, worktreePath, unifiedAIReviewData);


      // Add user message to history (with references)
      const userMsg: ChatMessage = {
        id: Date.now(),
        role: 'user',
        content: userMessage, // Keep original message with @references for display
        createdAt: new Date().toISOString(),
        references: resolvedRefs,
      };
      setMessages(prev => [...prev, userMsg]);

      // Build context with references
      let contextMessage = userMessage;

      // Add references to message context
      if (resolvedRefs.length > 0) {
        const refsContext = formatReferencesForContext(resolvedRefs);
        contextMessage = `${userMessage}\n\n---\nReferenced Context:\n${refsContext}`;
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
      // Add Smart Context Compression for AI Review Data
      if (aiReviewData) {
        let compressedContext = `## Active AI Review Findings\n\n`;
        
        // 1. Summary (Always included)
        if (aiReviewData.summary) {
          compressedContext += `### Summary\n${aiReviewData.summary}\n\n`;
        }

        // 2. Change Intents (High-level context)
        if (aiReviewData.changeIntents && aiReviewData.changeIntents.length > 0) {
          compressedContext += `### Change Intents\n`;
          aiReviewData.changeIntents.slice(0, 5).forEach((intent: any) => {
             compressedContext += `- ${intent.file ? `[${intent.file}] ` : ''}${intent.intent}\n`;
          });
          compressedContext += '\n';
        }

        // 3. Issues (Compressed format: [SEVERITY] file:line - message)
        if (aiReviewData.issues && aiReviewData.issues.length > 0) {
          compressedContext += `### Identified Issues (${aiReviewData.issues.length})\n`;
          // Limit to top 20 issues to save tokens, assuming they are sorted by severity
          aiReviewData.issues.slice(0, 20).forEach((issue: any) => {
            compressedContext += `- [${issue.severity.toUpperCase()}] ${issue.file}:${issue.line} - ${issue.message}\n`;
          });
          if (aiReviewData.issues.length > 20) {
            compressedContext += `... and ${aiReviewData.issues.length - 20} more issues.\n`;
          }
        }

        context.documentation = [{
          title: 'Smart Review Context',
          content: compressedContext,
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
        content: stripReferences(msg.content), // Strip references from history
        timestamp: new Date(msg.createdAt).getTime(),
      }));

      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: contextMessage, // Send message with file contents and reference details
          history,
          context,
          workingDirectory: worktreePath,
          language, // Pass user language preference
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
      {/* Header - Matches EnhancedAIReviewPanel style (No Gradient) */}
      <div className="flex flex-col px-4 py-3 border-b border-light-border dark:border-dark-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-light-accent-primary dark:text-dark-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <h3 className="text-light-text-primary dark:text-dark-text-primary font-semibold">AI Assistant</h3>
              <p className="text-light-text-secondary dark:text-dark-text-secondary text-xs">Ask about code...</p>
            </div>
          </div>
          
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className="w-8 h-8 rounded-lg hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary"
              title="Clear Chat History"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Context Indicator */}
      {codeContext?.selectedCode && (
        <div className="px-4 py-2 bg-[#f8f9fa] dark:bg-[#2d2d30] border-b border-[#e5e5e5] dark:border-[#333333]">
          <div className="flex items-center gap-2 text-xs text-[#6c757d] dark:text-[#8c8c8c]">
            <span className="font-medium text-[#007acc]">Selected Context:</span>
            <span className="truncate flex-1" title={codeContext.filePath}>
              {codeContext.filePath.split('/').pop()} L{codeContext.lineStart}-{codeContext.lineEnd}
            </span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3 max-w-md">
              <p className="text-[#6c757d] dark:text-[#8c8c8c] mb-2 font-medium">
                Select code and ask me anything!
              </p>
              <div className="text-xs text-[#6c757d] dark:text-[#8c8c8c] space-y-1">
                <p className="font-semibold mb-2">Examples:</p>
                <p>• "Explain this function"</p>
                <p>• "What changed in <span className="font-mono text-[#007acc]">@src/App.tsx</span>?"</p>
                <p>• "Explain <span className="font-mono text-[#007acc]">@src/utils/helper.ts:50</span>"</p>
                <p>• "What is <span className="font-mono text-[#007acc]">@issue:1</span> about?"</p>
                <p>• "Show me <span className="font-mono text-[#007acc]">@callstack:1</span>"</p>
                <p className="mt-2 pt-2 border-t border-[#e5e5e5] dark:border-[#454545]">
                  Type <span className="font-mono text-[#007acc]">@</span> to see all available references
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
            {/* Reference tags (only for user messages) */}
            {message.role === 'user' && message.references && message.references.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1 max-w-[85%] justify-end">
                {message.references.map((ref, idx) => (
                  <span
                    key={idx}
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      ref.exists
                        ? 'bg-[#28a745]/10 text-[#28a745]'
                        : 'bg-[#dc3545]/10 text-[#dc3545]'
                    }`}
                  >
                    {ref.reference.raw}
                  </span>
                ))}
              </div>
            )}

            {/* Message bubble */}
            <div
              className={`max-w-[85%] rounded-lg p-3 text-sm shadow-sm ${
                message.role === 'user'
                  ? 'bg-[#007acc] text-white'
                  : 'bg-white dark:bg-[#2d2d30] text-[#333333] dark:text-[#cccccc] border border-[#e5e5e5] dark:border-[#454545]'
              }`}
            >
              {message.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none
                              prose-p:leading-relaxed prose-pre:bg-[#f3f3f3] dark:prose-pre:bg-[#1e1e1e]
                              prose-headings:text-sm prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1
                              prose-p:text-xs prose-li:text-xs prose-li:my-0.5
                              prose-code:text-[#d32f2f] dark:prose-code:text-[#f28b82] prose-code:bg-transparent prose-code:before:content-none prose-code:after:content-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      pre: ({ children }) => <div className="my-2 not-prose rounded overflow-hidden border border-[#d1d1d1] dark:border-[#454545]">{children}</div>,
                      code: ({ children, className, ...props }: any) => {
                         const match = /language-(\w+)/.exec(className || '');
                         return match ? (
                           <div className="bg-[#1e1e1e] p-2 overflow-x-auto text-xs">{children}</div>
                         ) : (
                           <code className="bg-black/5 dark:bg-white/10 px-1 py-0.5 rounded font-mono text-xs" {...props}>{children}</code>
                         );
                      }
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {(isStreaming && streamingMessage) || sendMessage.isPending ? (
          <div className="flex justify-start">
             {/* Agentic "Thinking" Visualization */}
            <div className="max-w-[85%] space-y-2">
              {sendMessage.isPending && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border text-xs text-[#6c757d] dark:text-[#8c8c8c] animate-pulse">
                   <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                    </svg>
                  <span>Thinking...</span>
                </div>
              )}
              
              {isStreaming && streamingMessage && (
                <div className="rounded-lg p-3 bg-white dark:bg-[#2d2d30] border border-[#e5e5e5] dark:border-[#454545] text-sm shadow-sm">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                      {streamingMessage}
                    </ReactMarkdown>
                    <span className="inline-block w-1.5 h-4 bg-[#007acc] animate-pulse ml-0.5 align-middle" />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Cursor style */}
      <div className="p-4 border-t border-[#e5e5e5] dark:border-[#333333] bg-[#f8f9fa] dark:bg-[#1e1e1e]">
        <form onSubmit={handleSubmit} className="relative">
          {/* Detected reference preview */}
          {detectedReferences.length > 0 && (
            <div className="absolute -top-8 left-0 right-0 flex overflow-x-auto gap-1 pb-1 scrollbar-hide">
              {detectedReferences.map((ref, idx) => (
                <span key={idx} className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-[#007acc]/10 text-[#007acc] border border-[#007acc]/20">
                  {ref}
                </span>
              ))}
            </div>
          )}

          <div className="group rounded-xl border border-[#d1d1d1] dark:border-[#454545] bg-white dark:bg-[#252526] focus-within:ring-1 focus-within:ring-[#007acc] focus-within:border-[#007acc] transition-all shadow-sm">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !showMentions) {
                  e.preventDefault();
                  handleSubmit(e);
                }
                if (e.key === 'Escape' && showMentions) {
                  e.preventDefault();
                  setShowMentions(false);
                }
              }}
              placeholder="Ask anything... (@ to reference)"
              disabled={sendMessage.isPending}
              rows={1}
              style={{ minHeight: '44px', maxHeight: '200px' }}
              className="w-full px-3 py-3 rounded-t-xl resize-none text-sm bg-transparent
                       text-[#333333] dark:text-[#cccccc] placeholder-[#8c8c8c]
                       focus:outline-none disabled:opacity-50"
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
              }}
            />

            {/* Internal Toolbar */}
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <div className="flex items-center gap-2">
                {/* Plus Button */}
                <button
                  type="button"
                  className="w-6 h-6 flex items-center justify-center rounded-md text-[#6c757d] dark:text-[#8c8c8c] hover:bg-[#f0f0f0] dark:hover:bg-[#3e3e42] transition-colors"
                  title="Add Context"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                
                {/* Model Badge */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#f0f0f0] dark:bg-[#3e3e42] border border-[#e5e5e5] dark:border-[#454545]" title={`Provider: ${aiConfig.providerName || 'Unknown'}`}>
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />
                  <span className="text-[10px] font-medium text-[#424242] dark:text-[#cccccc]">
                    {aiConfig.providerName || 'Unknown'} {aiConfig.model ? `(${aiConfig.model})` : ''}
                  </span>
                </div>
              </div>

              {/* Send Button */}
              <button
                type="submit"
                disabled={!input.trim() || sendMessage.isPending}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all
                          ${input.trim() && !sendMessage.isPending 
                            ? 'bg-[#007acc] text-white hover:bg-[#005a9e] shadow-sm' 
                            : 'bg-[#f0f0f0] dark:bg-[#3e3e42] text-[#a0a0a0] cursor-not-allowed'}`}
                title="Send Message"
              >
                {sendMessage.isPending ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Mention Autocomplete */}
          {showMentions && (
            <MentionAutocomplete
              query={mentionQuery}
              suggestions={getMentionSuggestions()}
              onSelect={handleMentionSelect}
              onClose={() => setShowMentions(false)}
            />
          )}
        </form>
      </div>
    </div>
  );
}
