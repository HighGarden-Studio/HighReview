import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CallStackVisualization } from './CallStackVisualization';
import { SlideOverPanel } from './SlideOverPanel';

interface AIReviewComment {
  file: string;
  line: number;
  severity: 'critical' | 'warning' | 'suggestion';
  category: string;
  message: string;
  suggestion?: string;
}

interface ChangeIntent {
  file?: string;
  level: 'file' | 'block';
  intent: string;
  motivation: string;
  impact?: string;
}

interface CallStackInfo {
  function: string;
  file: string;
  flowchart?: string;
  sequence?: string;
}

interface ImpactAnalysis {
  scope: string;
  affectedAreas: string[];
  breakingChanges?: string[];
  sideEffects?: string[];
}

interface EnhancedAIReviewResult {
  summary: string;
  criticalIssues: AIReviewComment[];
  warnings: AIReviewComment[];
  suggestions: AIReviewComment[];
  filesReviewed: number;
  totalIssues: number;

  // Enhanced sections
  changeIntents?: ChangeIntent[];
  callStacks?: CallStackInfo[];
  impactAnalysis?: ImpactAnalysis;
  movedCode?: Array<{ from: string; to: string; lines: number }>;
  refactorings?: Array<{ type: string; description: string; files: string[] }>;
}

interface EnhancedAIReviewPanelProps {
  review: EnhancedAIReviewResult;
  onClose: () => void;
  onRerun?: () => void;
  onFileSelect?: (file: string, line?: number, functionName?: string) => void;
  highlightedItem?: {
    type: 'issue' | 'callstack';
    data: AIReviewComment | CallStackInfo;
  } | null;
  onHighlightedItemProcessed?: () => void;
}

export function EnhancedAIReviewPanel({
  review,
  onClose,
  onRerun,
  onFileSelect,
  highlightedItem,
  onHighlightedItemProcessed,
}: EnhancedAIReviewPanelProps) {
  const [activeTab, setActiveTab] = useState<'issues' | 'intents' | 'callstacks' | 'impact' | 'semantic'>('issues');
  const [selectedCallStack, setSelectedCallStack] = useState<{
    callStack: CallStackInfo;
    diagramType: 'flowchart' | 'sequence' | 'both';
  } | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  // Handle highlighted item from editor glyph margin clicks
  useEffect(() => {
    if (!highlightedItem) return;

    console.log('[EnhancedAIReviewPanel] Processing highlighted item:', highlightedItem);

    // Switch to appropriate tab
    if (highlightedItem.type === 'issue') {
      setActiveTab('issues');
      const issue = highlightedItem.data as AIReviewComment;
      // Generate unique ID for scrolling
      const itemId = `issue-${issue.file}-${issue.line}-${issue.severity}`;
      setHighlightedItemId(itemId);

      // Scroll to item after a short delay (to allow DOM to update)
      setTimeout(() => {
        const element = document.getElementById(itemId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Add temporary highlight animation
          element.classList.add('highlight-flash');
          setTimeout(() => {
            element.classList.remove('highlight-flash');
            setHighlightedItemId(null);
          }, 2000);
        }
      }, 300);
    } else if (highlightedItem.type === 'callstack') {
      setActiveTab('callstacks');
      const callStack = highlightedItem.data as CallStackInfo;
      // Generate unique ID for scrolling
      const itemId = `callstack-${callStack.function}-${callStack.file}`;
      setHighlightedItemId(itemId);

      // Scroll to item after a short delay
      setTimeout(() => {
        const element = document.getElementById(itemId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Add temporary highlight animation
          element.classList.add('highlight-flash');
          setTimeout(() => {
            element.classList.remove('highlight-flash');
            setHighlightedItemId(null);
          }, 2000);
        }
      }, 300);
    }

    // Notify parent that we've processed the highlighted item
    if (onHighlightedItemProcessed) {
      onHighlightedItemProcessed();
    }
  }, [highlightedItem, onHighlightedItemProcessed]);

  const handleFileClick = (file: string, line?: number, functionName?: string) => {
    if (onFileSelect) {
      onFileSelect(file, line, functionName);
    }
  };

  const handleCallStackExpand = (callStack: CallStackInfo, diagramType: 'flowchart' | 'sequence' | 'both') => {
    setSelectedCallStack({ callStack, diagramType });
  };

  // Helper function to format text with proper line breaks for labels
  const formatTextWithLabels = (text: string) => {
    // Split by common labels and add line breaks
    return text
      .replace(/(\s+)(Intent:|Motivation:|Impact:)/g, '\n\n**$2**\n')
      .replace(/^\s*Intent:/i, '**Intent:**\n')
      .replace(/\s+Motivation:/gi, '\n\n**Motivation:**\n')
      .replace(/\s+Impact:/gi, '\n\n**Impact:**\n')
      .trim();
  };

  // Decode unicode escape sequences (e.g., \uXXXX to actual characters)
  const decodeUnicode = (str: string): string => {
    try {
      // Check if string contains unicode escape sequences
      if (str.includes('\\u')) {
        // Replace unicode escape sequences with actual characters
        return str.replace(/\\u[\dA-Fa-f]{4}/g, (match) => {
          return String.fromCharCode(parseInt(match.replace('\\u', ''), 16));
        });
      }
      return str;
    } catch (error) {
      console.warn('[EnhancedAIReviewPanel] Failed to decode unicode:', error);
      return str;
    }
  };

  const renderMarkdown = (content: string) => {
    // Decode unicode escape sequences before rendering
    const decodedContent = decodeUnicode(content);

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <SyntaxHighlighter
                style={vscDarkPlus}
                language={match[1]}
                PreTag="div"
                className="rounded-lg !my-2"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code
                className={`${className} px-1 py-0.5 rounded bg-light-surface dark:bg-dark-surface text-light-accent-primary dark:text-dark-accent-primary font-mono text-xs`}
                {...props}
              >
                {children}
              </code>
            );
          },
          p: ({ children }) => (
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary leading-relaxed mb-2">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 text-sm text-light-text-secondary dark:text-dark-text-secondary mb-2">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 text-sm text-light-text-secondary dark:text-dark-text-secondary mb-2">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-light-text-primary dark:text-dark-text-primary">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-light-text-secondary dark:text-dark-text-secondary">
              {children}
            </em>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-light-accent-primary dark:border-dark-accent-primary pl-4 py-2 my-2 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-r">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-light-accent-primary dark:text-dark-accent-primary hover:underline"
            >
              {children}
            </a>
          ),
        }}
      >
        {decodedContent}
      </ReactMarkdown>
    );
  };

  // Debug logging
  console.log('[EnhancedAIReviewPanel] Rendering with data:', {
    hasReview: !!review,
    filesReviewed: review?.filesReviewed,
    totalIssues: review?.totalIssues,
    criticalIssues: review?.criticalIssues?.length,
    warnings: review?.warnings?.length,
    suggestions: review?.suggestions?.length,
    hasChangeIntents: !!review?.changeIntents?.length,
    hasCallStacks: !!review?.callStacks?.length,
    hasImpactAnalysis: !!review?.impactAnalysis,
    hasMovedCode: !!review?.movedCode?.length,
    hasRefactorings: !!review?.refactorings?.length,
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-light-accent-error dark:text-dark-accent-error bg-light-accent-error/10 dark:bg-dark-accent-error/10 border-light-accent-error dark:border-dark-accent-error';
      case 'warning':
        return 'text-light-accent-warning dark:text-dark-accent-warning bg-light-accent-warning/10 dark:bg-dark-accent-warning/10 border-light-accent-warning dark:border-dark-accent-warning';
      default:
        return 'text-light-accent-primary dark:text-dark-accent-primary bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 border-light-accent-primary dark:border-dark-accent-primary';
    }
  };

  const tabs = [
    { id: 'issues', label: 'Issues', icon: '⚠️', count: review.totalIssues },
    { id: 'intents', label: 'Change Intent', icon: '🎯', count: review.changeIntents?.length || 0 },
    { id: 'callstacks', label: 'Call Stacks', icon: '📊', count: review.callStacks?.length || 0 },
    { id: 'impact', label: 'Impact', icon: '🔍', count: review.impactAnalysis ? 1 : 0 },
    { id: 'semantic', label: 'Semantic', icon: '✨', count: (review.movedCode?.length || 0) + (review.refactorings?.length || 0) },
  ];

  return (
    <div className="h-full flex flex-col bg-light-surface dark:bg-dark-surface border-l border-light-border dark:border-dark-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border bg-gradient-to-r from-light-accent-primary to-light-accent-secondary dark:from-dark-accent-primary dark:to-dark-accent-secondary">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <span className="text-white text-lg">🤖</span>
          </div>
          <div>
            <h3 className="text-white font-semibold">AI Code Review</h3>
            <p className="text-white/80 text-xs">
              {review.filesReviewed} files • {review.totalIssues} issues
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onRerun && (
            <button
              onClick={onRerun}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-2 text-white text-sm font-medium"
              title="Re-run AI Review"
            >
              <span>🔄</span>
              <span>Re-run</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-white"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 bg-light-surface-elevated dark:bg-dark-surface-elevated border-b border-light-border dark:border-dark-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            disabled={tab.count === 0}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-light-accent-primary dark:bg-dark-accent-primary text-white'
                : tab.count === 0
                ? 'text-light-text-muted dark:text-dark-text-muted cursor-not-allowed opacity-50'
                : 'text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface dark:hover:bg-dark-surface'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                activeTab === tab.id ? 'bg-white/20' : 'bg-light-surface-elevated dark:bg-dark-surface-elevated'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Summary */}
        {activeTab === 'issues' && (
          <div className="p-4 space-y-4">
            <div className="p-4 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border">
              <h4 className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
                Summary
              </h4>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {renderMarkdown(review.summary)}
              </div>
            </div>

            {/* Critical Issues */}
            {review.criticalIssues.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-light-accent-error dark:text-dark-accent-error flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-light-accent-error/10 dark:bg-dark-accent-error/10 flex items-center justify-center text-xs">
                    🚨
                  </span>
                  Critical Issues ({review.criticalIssues.length})
                </h4>
                {review.criticalIssues.map((issue, idx) => (
                  <div
                    key={idx}
                    id={`issue-${issue.file}-${issue.line}-${issue.severity}`}
                    className="p-3 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border-l-4 border-light-accent-error dark:border-dark-accent-error transition-all duration-300"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${getSeverityColor(issue.severity)}`}>
                        {issue.severity.toUpperCase()}
                      </span>
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-light-surface dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary">
                        {issue.category}
                      </span>
                    </div>
                    <button
                      onClick={() => handleFileClick(issue.file, issue.line)}
                      className="text-sm font-mono text-light-accent-primary dark:text-dark-accent-primary hover:underline mb-2 text-left break-all w-full"
                    >
                      {issue.file}:{issue.line}
                    </button>
                    <div className="prose prose-sm dark:prose-invert max-w-none mb-2">
                      {renderMarkdown(issue.message)}
                    </div>
                    {issue.suggestion && (
                      <div className="mt-2 p-2 bg-light-surface dark:bg-dark-surface rounded">
                        <span className="text-xs font-semibold text-light-text-primary dark:text-dark-text-primary">Suggestion: </span>
                        <div className="prose prose-sm dark:prose-invert max-w-none mt-1">
                          {renderMarkdown(issue.suggestion)}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Warnings */}
            {review.warnings.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-light-accent-warning dark:text-dark-accent-warning flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-light-accent-warning/10 dark:bg-dark-accent-warning/10 flex items-center justify-center text-xs">
                    ⚠️
                  </span>
                  Warnings ({review.warnings.length})
                </h4>
                {review.warnings.map((issue, idx) => (
                  <div
                    key={idx}
                    id={`issue-${issue.file}-${issue.line}-${issue.severity}`}
                    className="p-3 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border-l-4 border-light-accent-warning dark:border-dark-accent-warning transition-all duration-300"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${getSeverityColor(issue.severity)}`}>
                        {issue.severity.toUpperCase()}
                      </span>
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-light-surface dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary">
                        {issue.category}
                      </span>
                    </div>
                    <button
                      onClick={() => handleFileClick(issue.file, issue.line)}
                      className="text-sm font-mono text-light-accent-primary dark:text-dark-accent-primary hover:underline mb-2 text-left break-all w-full"
                    >
                      {issue.file}:{issue.line}
                    </button>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      {renderMarkdown(issue.message)}
                    </div>
                    {issue.suggestion && (
                      <div className="mt-2 p-2 bg-light-surface dark:bg-dark-surface rounded">
                        <span className="text-xs font-semibold text-light-text-primary dark:text-dark-text-primary">Suggestion: </span>
                        <div className="prose prose-sm dark:prose-invert max-w-none mt-1">
                          {renderMarkdown(issue.suggestion)}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Suggestions */}
            {review.suggestions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-light-accent-primary dark:text-dark-accent-primary flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 flex items-center justify-center text-xs">
                    💡
                  </span>
                  Suggestions ({review.suggestions.length})
                </h4>
                {review.suggestions.map((issue, idx) => (
                  <div
                    key={idx}
                    id={`issue-${issue.file}-${issue.line}-${issue.severity}`}
                    className="p-3 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border-l-4 border-light-accent-primary dark:border-dark-accent-primary transition-all duration-300"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${getSeverityColor(issue.severity)}`}>
                        {issue.severity.toUpperCase()}
                      </span>
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-light-surface dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary">
                        {issue.category}
                      </span>
                    </div>
                    <button
                      onClick={() => handleFileClick(issue.file, issue.line)}
                      className="text-sm font-mono text-light-accent-primary dark:text-dark-accent-primary hover:underline mb-2 text-left break-all w-full"
                    >
                      {issue.file}:{issue.line}
                    </button>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      {renderMarkdown(issue.message)}
                    </div>
                    {issue.suggestion && (
                      <div className="mt-2 p-2 bg-light-surface dark:bg-dark-surface rounded">
                        <span className="text-xs font-semibold text-light-text-primary dark:text-dark-text-primary">Suggestion: </span>
                        <div className="prose prose-sm dark:prose-invert max-w-none mt-1">
                          {renderMarkdown(issue.suggestion)}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Change Intents */}
        {activeTab === 'intents' && review.changeIntents && (
          <div className="p-4 space-y-3">
            {review.changeIntents.map((intent, idx) => (
              <div
                key={idx}
                className="p-4 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border"
              >
                <div className="flex items-start gap-2 mb-2">
                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 text-light-accent-primary dark:text-dark-accent-primary">
                    {intent.level.toUpperCase()}
                  </span>
                  {intent.file && (
                    <button
                      onClick={() => handleFileClick(intent.file!)}
                      className="text-xs font-mono text-light-accent-primary dark:text-dark-accent-primary hover:underline"
                    >
                      {intent.file}
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="p-3 bg-light-surface dark:bg-dark-surface rounded-lg">
                    <h5 className="text-sm font-semibold text-light-accent-primary dark:text-dark-accent-primary mb-2 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 flex items-center justify-center text-xs">
                        🎯
                      </span>
                      Intent
                    </h5>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      {renderMarkdown(formatTextWithLabels(intent.intent))}
                    </div>
                  </div>

                  <div className="p-3 bg-light-surface dark:bg-dark-surface rounded-lg">
                    <h5 className="text-sm font-semibold text-light-accent-secondary dark:text-dark-accent-secondary mb-2 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-light-accent-secondary/10 dark:bg-dark-accent-secondary/10 flex items-center justify-center text-xs">
                        💡
                      </span>
                      Motivation
                    </h5>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      {renderMarkdown(formatTextWithLabels(intent.motivation))}
                    </div>
                  </div>

                  {intent.impact && (
                    <div className="p-3 bg-light-surface dark:bg-dark-surface rounded-lg">
                      <h5 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center text-xs">
                          📊
                        </span>
                        Impact
                      </h5>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        {renderMarkdown(formatTextWithLabels(intent.impact))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Call Stacks */}
        {activeTab === 'callstacks' && review.callStacks && (
          <div className="p-4 space-y-4">
            {review.callStacks.map((callStack, idx) => (
              <div
                key={idx}
                id={`callstack-${callStack.function}-${callStack.file}`}
                className="p-4 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border transition-all duration-300"
              >
                <div className="mb-4">
                  <h5 className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
                    {callStack.function}
                  </h5>
                  <button
                    onClick={() => handleFileClick(callStack.file, undefined, callStack.function)}
                    className="text-xs font-mono text-light-accent-primary dark:text-dark-accent-primary hover:underline"
                  >
                    {callStack.file}
                  </button>
                </div>
                <CallStackVisualization
                  flowchart={callStack.flowchart}
                  sequence={callStack.sequence}
                  title={callStack.function}
                  file={callStack.file}
                  onFileClick={(file) => handleFileClick(file)}
                  onExpand={(diagramType) => handleCallStackExpand(callStack, diagramType)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Impact Analysis */}
        {activeTab === 'impact' && review.impactAnalysis && (
          <div className="p-4 space-y-4">
            <div className="p-4 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border">
              <h5 className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 flex items-center justify-center text-xs">
                  🎯
                </span>
                Analysis Scope: {review.impactAnalysis.scope}
              </h5>

              {review.impactAnalysis.affectedAreas.length > 0 && (
                <div className="mb-4">
                  <h6 className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary mb-2">
                    Affected Areas
                  </h6>
                  <ul className="space-y-1">
                    {review.impactAnalysis.affectedAreas.map((area, idx) => (
                      <li key={idx} className="text-sm text-light-text-primary dark:text-dark-text-primary flex items-start gap-2">
                        <span className="text-light-accent-primary dark:text-dark-accent-primary">•</span>
                        {area}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {review.impactAnalysis.breakingChanges && review.impactAnalysis.breakingChanges.length > 0 && (
                <div className="mb-4 p-3 bg-light-accent-error/10 dark:bg-dark-accent-error/10 rounded-lg border border-light-accent-error/30 dark:border-dark-accent-error/30">
                  <h6 className="text-xs font-semibold text-light-accent-error dark:text-dark-accent-error mb-2">
                    ⚠️ Breaking Changes
                  </h6>
                  <ul className="space-y-1">
                    {review.impactAnalysis.breakingChanges.map((change, idx) => (
                      <li key={idx} className="text-sm text-light-text-primary dark:text-dark-text-primary flex items-start gap-2">
                        <span className="text-light-accent-error dark:text-dark-accent-error">•</span>
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {review.impactAnalysis.sideEffects && review.impactAnalysis.sideEffects.length > 0 && (
                <div className="p-3 bg-light-accent-warning/10 dark:bg-dark-accent-warning/10 rounded-lg border border-light-accent-warning/30 dark:border-dark-accent-warning/30">
                  <h6 className="text-xs font-semibold text-light-accent-warning dark:text-dark-accent-warning mb-2">
                    ⚡ Side Effects
                  </h6>
                  <ul className="space-y-1">
                    {review.impactAnalysis.sideEffects.map((effect, idx) => (
                      <li key={idx} className="text-sm text-light-text-primary dark:text-dark-text-primary flex items-start gap-2">
                        <span className="text-light-accent-warning dark:text-dark-accent-warning">•</span>
                        {effect}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Semantic Analysis */}
        {activeTab === 'semantic' && (
          <div className="p-4 space-y-4">
            {review.movedCode && review.movedCode.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 flex items-center justify-center text-xs">
                    📦
                  </span>
                  Moved Code ({review.movedCode.length})
                </h4>
                {review.movedCode.map((move, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <button
                        onClick={() => handleFileClick(move.from)}
                        className="font-mono text-light-accent-primary dark:text-dark-accent-primary hover:underline"
                      >
                        {move.from}
                      </button>
                      <span className="text-light-accent-primary dark:text-dark-accent-primary">→</span>
                      <button
                        onClick={() => handleFileClick(move.to)}
                        className="font-mono text-light-accent-primary dark:text-dark-accent-primary hover:underline"
                      >
                        {move.to}
                      </button>
                      <span className="ml-auto px-2 py-0.5 text-xs rounded bg-light-surface dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary">
                        {move.lines} lines
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {review.refactorings && review.refactorings.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-light-accent-secondary/10 dark:bg-dark-accent-secondary/10 flex items-center justify-center text-xs">
                    🔄
                  </span>
                  Refactorings ({review.refactorings.length})
                </h4>
                {review.refactorings.map((refactor, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <span className="px-2 py-0.5 text-xs font-semibold rounded bg-light-accent-secondary/10 dark:bg-dark-accent-secondary/10 text-light-accent-secondary dark:text-dark-accent-secondary">
                        {refactor.type}
                      </span>
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none mb-2">
                      {renderMarkdown(refactor.description)}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {refactor.files.map((file, fileIdx) => (
                        <button
                          key={fileIdx}
                          onClick={() => handleFileClick(file)}
                          className="text-xs font-mono px-2 py-0.5 rounded bg-light-surface dark:bg-dark-surface text-light-accent-primary dark:text-dark-accent-primary hover:underline"
                        >
                          {file}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expanded Call Stack Panel */}
      <SlideOverPanel
        isOpen={!!selectedCallStack}
        onClose={() => setSelectedCallStack(null)}
        title={selectedCallStack?.callStack.function || 'Call Stack Visualization'}
        resizable={true}
        defaultWidth={60}
      >
        {selectedCallStack && (
          <div className="space-y-6">
            <div className="p-4 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border">
              <h3 className="text-base font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
                Function Details
              </h3>
              <div className="space-y-2">
                <div>
                  <span className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">Function:</span>
                  <p className="text-sm font-mono text-light-text-primary dark:text-dark-text-primary mt-1">
                    {selectedCallStack.callStack.function}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">File:</span>
                  <button
                    onClick={() => handleFileClick(selectedCallStack.callStack.file)}
                    className="block text-sm font-mono text-light-accent-primary dark:text-dark-accent-primary hover:underline mt-1"
                  >
                    {selectedCallStack.callStack.file}
                  </button>
                </div>
                <div>
                  <span className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">Diagram Type:</span>
                  <p className="text-sm text-light-text-primary dark:text-dark-text-primary mt-1 capitalize">
                    {selectedCallStack.diagramType === 'both' ? 'Flowchart & Sequence' : selectedCallStack.diagramType}
                  </p>
                </div>
              </div>
            </div>

            {/* Large Visualization */}
            <div className="bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border p-6">
              <CallStackVisualization
                flowchart={selectedCallStack.diagramType !== 'sequence' ? selectedCallStack.callStack.flowchart : undefined}
                sequence={selectedCallStack.diagramType !== 'flowchart' ? selectedCallStack.callStack.sequence : undefined}
                file={selectedCallStack.callStack.file}
                onFileClick={(file) => {
                  handleFileClick(file);
                  setSelectedCallStack(null); // Close the panel after navigation
                }}
              />
            </div>

            {/* Help Text */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                💡 This visualization shows the call stack and data flow for the selected function.
                Use this to understand how the code interacts with other parts of the system. Drag the left edge to resize.
              </p>
            </div>
          </div>
        )}
      </SlideOverPanel>

      {/* Highlight animation */}
      <style>{`
        @keyframes highlight-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
          }
          50% {
            box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
          }
        }

        .highlight-flash {
          animation: highlight-pulse 1s ease-in-out 2;
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.8) !important;
        }
      `}</style>
    </div>
  );
}
