import { useState, useEffect, useRef } from 'react';
import { Scanner } from './Scanner';
import type { AIReviewOptions } from './AIReviewOptionsModal';

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'success' | 'warning' | 'error';
  category: 'indexing' | 'lsp' | 'context' | 'api' | 'parsing' | 'general';
  message: string;
  details?: any;
}

export interface AIReviewLog {
  timestamp: number;
  prInfo: {
    owner: string;
    repo: string;
    number: number;
  };
  options: AIReviewOptions;
  changedFiles: string[];
  contextFiles?: Array<{
    path: string;
    reason: string;
    relatedSymbol: string;
  }>;
  logs: LogEntry[]; // Real-time log stream
  result?: {
    filesReviewed: number;
    totalIssues: number;
    duration: number;
  };
  error?: string;
}

interface AIReviewLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  log: AIReviewLog | null;
}

export function AIReviewLogModal({ isOpen, onClose, log }: AIReviewLogModalProps) {
  const [activeTab, setActiveTab] = useState<'logs' | 'options' | 'files' | 'context' | 'result'>('logs');
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [log?.logs, autoScroll]);

  if (!isOpen || !log) return null;

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-light-surface dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-light-border dark:border-dark-border bg-gradient-to-r from-purple-600 to-blue-600">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">AI Review Log</h2>
              <p className="text-white/80 text-sm mt-1">
                {log.prInfo.owner}/{log.prInfo.repo} #{log.prInfo.number} • {formatTimestamp(log.timestamp)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-light-border dark:border-dark-border bg-light-surface-elevated dark:bg-dark-surface-elevated">
          <div className="flex gap-1 px-6">
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'logs'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary'
              }`}
            >
              Logs {log.logs && log.logs.length > 0 && `(${log.logs.length})`}
            </button>
            <button
              onClick={() => setActiveTab('options')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'options'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary'
              }`}
            >
              Options
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'files'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary'
              }`}
            >
              Changed Files ({log.changedFiles.length})
            </button>
            {log.contextFiles && log.contextFiles.length > 0 && (
              <button
                onClick={() => setActiveTab('context')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'context'
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary'
                }`}
              >
                Context Files ({log.contextFiles.length})
              </button>
            )}
            <button
              onClick={() => setActiveTab('result')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'result'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary'
              }`}
            >
              Result
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'logs' && (
            <div className="space-y-4">
              {/* Log Controls */}
              <div className="flex items-center justify-between bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg p-3">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={autoScroll}
                      onChange={(e) => setAutoScroll(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-light-text-secondary dark:text-dark-text-secondary">
                      Auto-scroll
                    </span>
                  </label>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="px-3 py-1 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded text-sm text-light-text-primary dark:text-dark-text-primary"
                  >
                    <option value="all">All Categories</option>
                    <option value="indexing">Indexing</option>
                    <option value="lsp">LSP</option>
                    <option value="context">Context Collection</option>
                    <option value="api">API Calls</option>
                    <option value="parsing">Parsing</option>
                    <option value="general">General</option>
                  </select>
                </div>
                <div className="text-sm text-light-text-muted dark:text-dark-text-muted">
                  {log.logs?.length || 0} entries
                </div>
              </div>

              {/* Log Entries */}
              <div className="bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg overflow-hidden">
                <div className="max-h-[500px] overflow-y-auto font-mono text-xs">
                  {log.logs && log.logs.length > 0 ? (
                    <>
                      {log.logs
                        .filter(entry => filterCategory === 'all' || entry.category === filterCategory)
                        .map((entry, index) => {
                          const levelColors = {
                            info: 'text-blue-600 dark:text-blue-400',
                            success: 'text-green-600 dark:text-green-400',
                            warning: 'text-orange-600 dark:text-orange-400',
                            error: 'text-red-600 dark:text-red-400',
                          };
                          const categoryBadges = {
                            indexing: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
                            lsp: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
                            context: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
                            api: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
                            parsing: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
                            general: 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300',
                          };

                          return (
                            <div
                              key={index}
                              className="px-4 py-2 border-b border-light-border dark:border-dark-border last:border-b-0 hover:bg-light-surface dark:hover:bg-dark-surface"
                            >
                              <div className="flex items-start gap-3">
                                <span className="text-light-text-muted dark:text-dark-text-muted whitespace-nowrap">
                                  {new Date(entry.timestamp).toLocaleTimeString()}
                                </span>
                                <span className={`font-semibold uppercase ${levelColors[entry.level]}`}>
                                  [{entry.level}]
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs ${categoryBadges[entry.category]}`}>
                                  {entry.category}
                                </span>
                                <span className="flex-1 text-light-text-primary dark:text-dark-text-primary">
                                  {entry.message}
                                </span>
                              </div>
                              {entry.details && (
                                <details className="mt-1 ml-24">
                                  <summary className="cursor-pointer text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary">
                                    View details
                                  </summary>
                                  <pre className="mt-2 p-2 bg-light-surface dark:bg-dark-surface rounded text-xs overflow-x-auto">
                                    {JSON.stringify(entry.details, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          );
                        })}
                      <div ref={logsEndRef} />
                    </>
                  ) : (
                    <div className="p-8 text-center text-light-text-muted dark:text-dark-text-muted">
                      No logs available
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'options' && (
            <div className="space-y-4">
              <div className="bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg p-4">
                <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-3">
                  Review Options
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">
                      Context-Aware Review
                    </h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={log.options.includeContext ? 'text-green-600' : 'text-red-600'}>
                          {log.options.includeContext ? '✓' : '✗'}
                        </span>
                        <span>Include Context</span>
                      </div>
                      {log.options.includeContext && (
                        <div className="ml-6 text-light-text-muted dark:text-dark-text-muted">
                          Scope: {log.options.contextScope}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">
                      Change Intent
                    </h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={log.options.analyzeChangeIntent ? 'text-green-600' : 'text-red-600'}>
                          {log.options.analyzeChangeIntent ? '✓' : '✗'}
                        </span>
                        <span>Analyze Intent</span>
                      </div>
                      {log.options.analyzeChangeIntent && (
                        <div className="ml-6 text-light-text-muted dark:text-dark-text-muted">
                          Level: {log.options.changeIntentLevel}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">
                      Call Stack
                    </h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={log.options.generateCallStack ? 'text-green-600' : 'text-red-600'}>
                          {log.options.generateCallStack ? '✓' : '✗'}
                        </span>
                        <span>Generate Call Stack</span>
                      </div>
                      {log.options.generateCallStack && (
                        <div className="ml-6 text-light-text-muted dark:text-dark-text-muted">
                          Format: {log.options.callStackFormat}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">
                      Impact Analysis
                    </h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={log.options.analyzeBroaderImpact ? 'text-green-600' : 'text-red-600'}>
                          {log.options.analyzeBroaderImpact ? '✓' : '✗'}
                        </span>
                        <span>Broader Impact</span>
                      </div>
                      {log.options.analyzeBroaderImpact && (
                        <div className="ml-6 text-light-text-muted dark:text-dark-text-muted">
                          Scope: {log.options.impactScope}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="col-span-2">
                    <h4 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">
                      Semantic Diff
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={log.options.useSemanticDiff ? 'text-green-600' : 'text-red-600'}>
                          {log.options.useSemanticDiff ? '✓' : '✗'}
                        </span>
                        <span>Use Semantic Diff</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={log.options.detectMovedCode ? 'text-green-600' : 'text-red-600'}>
                          {log.options.detectMovedCode ? '✓' : '✗'}
                        </span>
                        <span>Detect Moved Code</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={log.options.detectRefactoring ? 'text-green-600' : 'text-red-600'}>
                          {log.options.detectRefactoring ? '✓' : '✗'}
                        </span>
                        <span>Detect Refactoring</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={log.options.ignoreWhitespace ? 'text-green-600' : 'text-red-600'}>
                          {log.options.ignoreWhitespace ? '✓' : '✗'}
                        </span>
                        <span>Ignore Whitespace</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={log.options.ignoreComments ? 'text-green-600' : 'text-red-600'}>
                          {log.options.ignoreComments ? '✓' : '✗'}
                        </span>
                        <span>Ignore Comments</span>
                      </div>
                    </div>
                  </div>
                </div>

                {log.options.customPrompt && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-2">
                      Custom Prompt
                    </h4>
                    <div className="bg-light-surface dark:bg-dark-surface rounded p-3 text-sm text-light-text-primary dark:text-dark-text-primary">
                      {log.options.customPrompt}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'files' && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-3">
                Changed Files ({log.changedFiles.length})
              </h3>
              <div className="bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg divide-y divide-light-border dark:divide-dark-border">
                {log.changedFiles.map((file, index) => (
                  <div key={index} className="px-4 py-3 flex items-center gap-3">
                    <span className="text-blue-600 dark:text-blue-400">📄</span>
                    <code className="text-sm text-light-text-primary dark:text-dark-text-primary font-mono">
                      {file}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'context' && log.contextFiles && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-3">
                Context Files ({log.contextFiles.length})
              </h3>
              <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-4">
                Files included for impact analysis only (not reviewed for code quality)
              </p>
              <div className="bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg divide-y divide-light-border dark:divide-dark-border">
                {log.contextFiles.map((file, index) => (
                  <div key={index} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className="text-purple-600 dark:text-purple-400">🔗</span>
                      <div className="flex-1">
                        <code className="text-sm text-light-text-primary dark:text-dark-text-primary font-mono">
                          {file.path}
                        </code>
                        <div className="mt-1 flex items-center gap-4 text-xs text-light-text-muted dark:text-dark-text-muted">
                          <span className="flex items-center gap-1">
                            <span className="font-medium">Reason:</span>
                            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                              {file.reason}
                            </span>
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="font-medium">Related to:</span>
                            <code className="text-purple-600 dark:text-purple-400">{file.relatedSymbol}</code>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'result' && (
            <div className="space-y-4">
              {log.error ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">
                    Error
                  </h3>
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {log.error}
                  </p>
                </div>
              ) : log.result ? (
                <div className="bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
                    Review Results
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                        {log.result.filesReviewed}
                      </div>
                      <div className="text-sm text-light-text-muted dark:text-dark-text-muted mt-1">
                        Files Reviewed
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                        {log.result.totalIssues}
                      </div>
                      <div className="text-sm text-light-text-muted dark:text-dark-text-muted mt-1">
                        Total Issues
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                        {formatDuration(log.result.duration)}
                      </div>
                      <div className="text-sm text-light-text-muted dark:text-dark-text-muted mt-1">
                        Duration
                      </div>
                    </div>
                  </div>
                </div>
              ) :                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="mb-4">
                      <Scanner size="lg" />
                    </div>
                    <p className="text-light-text-muted dark:text-dark-text-muted animate-pulse">
                      Review in progress...
                    </p>
                  </div>
              }
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-light-border dark:border-dark-border bg-light-surface-elevated dark:bg-dark-surface-elevated flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:shadow-lg transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
