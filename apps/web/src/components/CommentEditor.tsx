import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useTheme } from '../contexts/ThemeContext';

interface CommentEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  placeholder?: string;
  submitLabel?: string;
  isSubmitting?: boolean;
  autoFocus?: boolean;
  minHeight?: number;
  originalCode?: string; // For suggestion feature
}

export function CommentEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = 'Leave a comment',
  submitLabel = 'Comment',
  isSubmitting = false,
  autoFocus = false,
  minHeight = 150,
  originalCode,
}: CommentEditorProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isSubmitting && value.trim()) {
        onSubmit();
      }
    }
    // Escape to cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const insertSuggestion = () => {
    const suggestionBlock = originalCode
      ? `\`\`\`suggestion\n${originalCode}\n\`\`\``
      : `\`\`\`suggestion\n// Edit this code\n\`\`\``;
    onChange(value + '\n' + suggestionBlock);
  };

  return (
    <div className="comment-editor border border-light-border dark:border-dark-border rounded-md overflow-hidden" onKeyDown={handleKeyDown}>
      {/* Tabs */}
      <div className="flex items-center gap-2 px-3 py-2 bg-light-surface-elevated dark:bg-dark-surface-elevated border-b border-light-border dark:border-dark-border">
        <button
          onClick={() => setActiveTab('write')}
          className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
            activeTab === 'write'
              ? 'bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary'
              : 'text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary'
          }`}
        >
          Write
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
            activeTab === 'preview'
              ? 'bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary'
              : 'text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary'
          }`}
        >
          Preview
        </button>
        {originalCode && (
          <button
            onClick={insertSuggestion}
            className="ml-auto px-2 py-1 text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary border border-light-border dark:border-dark-border rounded transition-colors"
            title="Insert a suggestion"
          >
            <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Insert suggestion
          </button>
        )}
      </div>

      {/* Content */}
      <div className="bg-light-surface dark:bg-dark-surface">
        {activeTab === 'write' ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            disabled={isSubmitting}
            className="w-full px-3 py-2 text-sm bg-transparent text-light-text-primary dark:text-dark-text-primary resize-none focus:outline-none"
            style={{ minHeight: `${minHeight}px` }}
          />
        ) : (
          <div
            className="px-3 py-2 text-sm prose prose-sm dark:prose-invert max-w-none"
            style={{ minHeight: `${minHeight}px` }}
          >
            {value ? (
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {value}
              </ReactMarkdown>
            ) : (
              <p className="text-light-text-muted dark:text-dark-text-muted italic">Nothing to preview</p>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between px-3 py-2 bg-light-surface-elevated dark:bg-dark-surface-elevated border-t border-light-border dark:border-dark-border">
        <div className="text-xs text-light-text-muted dark:text-dark-text-muted">
          Markdown supported. Cmd+Enter to submit.
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitting || !value.trim()}
            className="px-4 py-1.5 text-sm font-medium text-white bg-light-accent-primary dark:bg-dark-accent-primary rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isSubmitting ? 'Posting...' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
