import { useState } from 'react';
import { MarkdownEditor } from './MarkdownEditor';

interface ReviewSubmissionModalProps {
  commentCount: number;
  isSubmitting: boolean;
  onSubmit: (event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES', body: string) => Promise<void>;
  onCancel: () => void;
}

export function ReviewSubmissionModal({
  commentCount,
  isSubmitting,
  onSubmit,
  onCancel,
}: ReviewSubmissionModalProps) {
  const [event, setEvent] = useState<'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'>('COMMENT');
  const [body, setBody] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(event, body);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-light-surface dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-light-border dark:border-dark-border">
          <h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
            Submit Review
          </h2>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Event Selection */}
          <div>
            <label className="block text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-2">
              Review Type
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-3 p-3 rounded border border-light-border dark:border-dark-border hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="event"
                  value="COMMENT"
                  checked={event === 'COMMENT'}
                  onChange={(e) => setEvent(e.target.value as any)}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                    💬 Comment
                  </div>
                  <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    Submit general feedback without explicit approval
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded border border-light-border dark:border-dark-border hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="event"
                  value="APPROVE"
                  checked={event === 'APPROVE'}
                  onChange={(e) => setEvent(e.target.value as any)}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-green-600 dark:text-green-400">
                    ✅ Approve
                  </div>
                  <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    Submit feedback and approve merging these changes
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded border border-light-border dark:border-dark-border hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="event"
                  value="REQUEST_CHANGES"
                  checked={event === 'REQUEST_CHANGES'}
                  onChange={(e) => setEvent(e.target.value as any)}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-red-600 dark:text-red-400">
                    🚫 Request Changes
                  </div>
                  <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    Submit feedback that must be addressed before merging
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Review Summary */}
          <div>
            <label
              htmlFor="review-body"
              className="block text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-2"
            >
              Review Summary (Optional)
            </label>
            <MarkdownEditor
              value={body}
              onChange={setBody}
              placeholder="Leave a comment with your overall feedback... (Markdown supported)"
              height={200}
              preview="live"
            />
          </div>

          {/* Summary */}
          <div className="p-4 rounded-md bg-light-surface-elevated dark:bg-dark-surface-elevated">
            <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              You have <strong className="text-light-text-primary dark:text-dark-text-primary">{commentCount}</strong> pending comment{commentCount !== 1 ? 's' : ''} that will be submitted with this review.
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-light-border dark:border-dark-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm rounded-md
                     bg-light-surface-elevated dark:bg-dark-surface-elevated
                     text-light-text-primary dark:text-dark-text-primary
                     hover:bg-light-surface dark:hover:bg-dark-surface
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="px-4 py-2 text-sm rounded-md
                     bg-light-accent-primary dark:bg-dark-accent-primary
                     text-white
                     hover:opacity-90
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-opacity
                     flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Submitting...
              </>
            ) : (
              'Submit Review'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
