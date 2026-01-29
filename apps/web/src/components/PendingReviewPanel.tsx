import { PendingComment } from '../hooks/usePendingReview';

interface PendingReviewPanelProps {
  comments: PendingComment[];
  onEditComment: (id: string) => void;
  onDeleteComment: (id: string) => void;
  onSubmitReview: () => void;
}

export function PendingReviewPanel({
  comments,
  onEditComment,
  onDeleteComment,
  onSubmitReview,
}: PendingReviewPanelProps) {
  // Group comments by file
  const commentsByFile = comments.reduce((acc, comment) => {
    if (!acc[comment.file]) {
      acc[comment.file] = [];
    }
    acc[comment.file].push(comment);
    return acc;
  }, {} as Record<string, PendingComment[]>);

  return (
    <div className="h-full flex flex-col bg-light-surface dark:bg-dark-surface">
      {/* Header */}
      <div className="p-4 border-b border-light-border dark:border-dark-border">
        <h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
            />
          </svg>
          Pending Review
          {comments.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-light-accent-primary dark:bg-dark-accent-primary text-white">
              {comments.length}
            </span>
          )}
        </h2>
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
          {comments.length === 0
            ? 'No pending comments'
            : `${comments.length} comment${comments.length === 1 ? '' : 's'} ready to submit`}
        </p>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <svg
              className="w-16 h-16 text-light-text-muted dark:text-dark-text-muted mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
              Add inline comments to files to build your review
            </p>
          </div>
        ) : (
          <div className="divide-y divide-light-border dark:divide-dark-border">
            {Object.entries(commentsByFile).map(([file, fileComments]) => (
              <div key={file} className="p-4">
                {/* File Header */}
                <div className="flex items-center gap-2 mb-3">
                  <svg
                    className="w-4 h-4 text-light-text-muted dark:text-dark-text-muted flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary truncate">
                    {file}
                  </span>
                  <span className="text-xs text-light-text-muted dark:text-dark-text-muted flex-shrink-0">
                    ({fileComments.length})
                  </span>
                </div>

                {/* Comments for this file */}
                <div className="space-y-3">
                  {fileComments.map((comment) => (
                    <div
                      key={comment.id}
                      className="pl-6 border-l-2 border-light-accent-primary dark:border-dark-accent-primary"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-secondary dark:text-dark-text-secondary">
                            Line {comment.line}
                          </span>
                          {comment.isAI && (
                            <span
                              className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              title="Converted from AI suggestion"
                            >
                              🤖 AI
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => onEditComment(comment.id)}
                            className="p-1 rounded hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated
                                     text-light-text-muted dark:text-dark-text-muted
                                     hover:text-light-text-primary dark:hover:text-dark-text-primary
                                     transition-colors"
                            title="Edit comment"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => onDeleteComment(comment.id)}
                            className="p-1 rounded hover:bg-red-500/10
                                     text-light-text-muted dark:text-dark-text-muted
                                     hover:text-red-600 dark:hover:text-red-400
                                     transition-colors"
                            title="Delete comment"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary whitespace-pre-wrap line-clamp-3">
                        {comment.body}
                      </p>
                      <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                        {new Date(comment.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with Submit Button */}
      {comments.length > 0 && (
        <div className="p-4 border-t border-light-border dark:border-dark-border">
          <button
            onClick={onSubmitReview}
            className="w-full px-4 py-2 rounded-md
                     bg-green-600 hover:bg-green-700
                     text-white font-medium
                     transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Submit Review ({comments.length} comment{comments.length === 1 ? '' : 's'})
          </button>
        </div>
      )}
    </div>
  );
}
