interface AIReviewComment {
  file: string;
  line: number;
  severity: 'critical' | 'warning' | 'suggestion';
  category: string;
  message: string;
  suggestion?: string;
}

interface AICommentInlineDisplayProps {
  comment: AIReviewComment;
  onConvertToComment: () => void;
  onDismiss: () => void;
}

export function AICommentInlineDisplay({
  comment,
  onConvertToComment,
  onDismiss,
}: AICommentInlineDisplayProps) {
  const severityConfig = {
    critical: {
      color: 'red',
      icon: '🔴',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      text: 'text-red-600 dark:text-red-400',
    },
    warning: {
      color: 'yellow',
      icon: '⚠️',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
      text: 'text-yellow-600 dark:text-yellow-400',
    },
    suggestion: {
      color: 'blue',
      icon: '💡',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      text: 'text-blue-600 dark:text-blue-400',
    },
  };

  const config = severityConfig[comment.severity];

  return (
    <div
      className={`p-4 rounded-lg border-2 ${config.border} ${config.bg}
                  bg-light-surface dark:bg-dark-surface`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${config.text}`}>
                {comment.severity.toUpperCase()}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-secondary dark:text-dark-text-secondary">
                {comment.category}
              </span>
            </div>
            <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
              Line {comment.line}
            </span>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated
                   text-light-text-muted dark:text-dark-text-muted
                   hover:text-light-text-primary dark:hover:text-dark-text-primary
                   transition-colors"
          title="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Message */}
      <div className="mb-3">
        <p className="text-sm text-light-text-primary dark:text-dark-text-primary whitespace-pre-wrap">
          {comment.message}
        </p>
      </div>

      {/* Suggestion Code Block */}
      {comment.suggestion && (
        <div className="mb-3">
          <div className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mb-1">
            Suggested fix:
          </div>
          <pre className="text-xs p-2 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border overflow-x-auto">
            <code className="text-light-text-primary dark:text-dark-text-primary">
              {comment.suggestion}
            </code>
          </pre>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onConvertToComment}
          className="flex-1 px-3 py-1.5 text-sm rounded-md
                   bg-light-accent-primary dark:bg-dark-accent-primary
                   hover:bg-light-accent-primary/90 dark:hover:bg-dark-accent-primary/90
                   text-white font-medium
                   transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add as review comment
        </button>
        <button
          onClick={onDismiss}
          className="px-3 py-1.5 text-sm rounded-md
                   bg-light-surface-elevated dark:bg-dark-surface-elevated
                   hover:bg-light-border dark:hover:bg-dark-border
                   text-light-text-primary dark:text-dark-text-primary
                   transition-colors"
        >
          Dismiss
        </button>
      </div>

      {/* AI Badge */}
      <div className="mt-3 pt-3 border-t border-light-border dark:border-dark-border">
        <div className="flex items-center gap-2 text-xs text-light-text-muted dark:text-dark-text-muted">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M13 7H7v6h6V7z" />
            <path
              fillRule="evenodd"
              d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2z"
              clipRule="evenodd"
            />
          </svg>
          <span>AI-generated suggestion from code review</span>
        </div>
      </div>
    </div>
  );
}
