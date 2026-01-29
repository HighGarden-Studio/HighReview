import { useState } from 'react';
import { MarkdownEditor } from './MarkdownEditor';

interface CommentFormProps {
  file: string;
  line: number;
  initialBody?: string;
  aiSuggestions?: string[];
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

export function CommentForm({
  file,
  line,
  initialBody = '',
  aiSuggestions = [],
  onSubmit,
  onCancel,
}: CommentFormProps) {
  const [body, setBody] = useState(initialBody);

  const handleSubmit = (addToReview: boolean) => {
    if (!body.trim()) return;
    onSubmit(body);
  };

  const insertSuggestion = (suggestion: string) => {
    setBody((prev) => (prev ? `${prev}\n\n${suggestion}` : suggestion));
  };

  return (
    <div className="border border-light-border dark:border-dark-border rounded-md bg-light-surface dark:bg-dark-surface p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
          Comment on {file}:{line}
        </span>
      </div>

      {/* AI Suggestions */}
      {aiSuggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
            AI Suggestions:
          </span>
          {aiSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => insertSuggestion(suggestion)}
              className="text-xs px-2 py-1 rounded
                       bg-blue-500/10 hover:bg-blue-500/20
                       text-blue-600 dark:text-blue-400
                       border border-blue-500/20
                       transition-colors"
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
        height={150}
        preview="live"
      />

      {/* Character Count */}
      <div className="mt-1 text-xs text-light-text-muted dark:text-dark-text-muted text-right">
        {body.length} / 65536 characters
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-md
                   bg-light-surface-elevated dark:bg-dark-surface-elevated
                   hover:bg-light-border dark:hover:bg-dark-border
                   text-light-text-primary dark:text-dark-text-primary
                   transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => handleSubmit(false)}
          disabled={!body.trim()}
          className="px-3 py-1.5 text-sm rounded-md
                   bg-light-accent-primary dark:bg-dark-accent-primary
                   hover:bg-light-accent-primary/90 dark:hover:bg-dark-accent-primary/90
                   text-white
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
        >
          Add single comment
        </button>
        <button
          onClick={() => handleSubmit(true)}
          disabled={!body.trim()}
          className="px-3 py-1.5 text-sm rounded-md
                   bg-green-600 hover:bg-green-700
                   text-white
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors flex items-center gap-1"
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
