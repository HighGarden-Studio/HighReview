import { useState, useEffect } from 'react';
import { MarkdownEditor } from './MarkdownEditor';

interface CommentFormProps {
  file: string;
  line: number;
  endLine?: number; // For multi-line comments
  initialBody?: string;
  aiSuggestions?: string[];
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

export function CommentForm({
  file,
  line,
  endLine,
  initialBody = '',
  aiSuggestions = [],
  onSubmit,
  onCancel,
}: CommentFormProps) {
  const [body, setBody] = useState(initialBody);

  // Handle ESC key to close the modal
  // Use capture phase to handle ESC before Monaco editor's selection clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  const handleSubmit = (addToReview: boolean) => {
    if (!body.trim()) return;
    onSubmit(body);
  };

  const insertSuggestion = (suggestion: string) => {
    setBody((prev) => (prev ? `${prev}\n\n${suggestion}` : suggestion));
  };

  return (
    <div
      className="rounded-lg shadow-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border p-4"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <div className="pb-3 mb-3 border-b border-light-border dark:border-dark-border">
        <div className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">
          💬 Add Comment
        </div>
        <div className="text-xs mt-1 text-light-text-primary dark:text-dark-text-primary">
          <span className="font-mono">
            {file}:{line}{endLine && endLine !== line ? `-${endLine}` : ''}
          </span>
          {endLine && endLine !== line && (
            <span className="ml-2">
              ({endLine - line + 1} lines)
            </span>
          )}
        </div>
      </div>

      {/* AI Suggestions */}
      {aiSuggestions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <span
            className="text-xs"
            style={{
              color: 'var(--vscode-descriptionForeground, #9ca3af)',
            }}
          >
            AI Suggestions:
          </span>
          {aiSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => insertSuggestion(suggestion)}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{
                background: 'rgba(59, 130, 246, 0.15)',
                color: 'rgb(96, 165, 250)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
              }}
              title="Click to insert"
            >
              💡 {suggestion.substring(0, 30)}
              {suggestion.length > 30 ? '...' : ''}
            </button>
          ))}
        </div>
      )}

      {/* Markdown Editor */}
      <MarkdownEditor
        value={body}
        onChange={setBody}
        placeholder="Leave a comment... (Markdown supported)"
        height={200}
        preview="edit"
      />

      {/* Character Count */}
      <div
        className="mt-2 text-xs text-right"
        style={{
          color: 'var(--vscode-descriptionForeground, #858585)',
        }}
      >
        {body.length} / 65536 characters
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded transition-colors"
          style={{
            background: 'var(--vscode-button-secondaryBackground, #3a3d41)',
            color: 'var(--vscode-button-secondaryForeground, #cccccc)',
            border: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--vscode-button-secondaryHoverBackground, #45494e)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--vscode-button-secondaryBackground, #3a3d41)';
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => handleSubmit(false)}
          disabled={!body.trim()}
          className="px-4 py-2 text-sm rounded transition-colors"
          style={{
            background: body.trim() ? 'rgb(59, 130, 246)' : 'rgba(59, 130, 246, 0.3)',
            color: 'white',
            border: 'none',
            cursor: body.trim() ? 'pointer' : 'not-allowed',
          }}
          onMouseEnter={(e) => {
            if (body.trim()) {
              e.currentTarget.style.background = 'rgb(37, 99, 235)';
            }
          }}
          onMouseLeave={(e) => {
            if (body.trim()) {
              e.currentTarget.style.background = 'rgb(59, 130, 246)';
            }
          }}
        >
          Add single comment
        </button>
        <button
          onClick={() => handleSubmit(true)}
          disabled={!body.trim()}
          className="px-4 py-2 text-sm rounded transition-colors flex items-center gap-1.5"
          style={{
            background: body.trim() ? 'rgb(34, 197, 94)' : 'rgba(34, 197, 94, 0.3)',
            color: 'white',
            border: 'none',
            cursor: body.trim() ? 'pointer' : 'not-allowed',
          }}
          onMouseEnter={(e) => {
            if (body.trim()) {
              e.currentTarget.style.background = 'rgb(22, 163, 74)';
            }
          }}
          onMouseLeave={(e) => {
            if (body.trim()) {
              e.currentTarget.style.background = 'rgb(34, 197, 94)';
            }
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add to review
        </button>
      </div>
    </div>
  );
}
