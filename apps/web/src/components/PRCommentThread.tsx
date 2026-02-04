import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { MarkdownEditor } from './MarkdownEditor';

interface PRComment {
  id: string;
  author: string;
  authorAvatar?: string;
  body: string;
  createdAt: string;
  reactions: Array<{ content: string; user: { login: string } }>;
}

interface PRCommentThreadProps {
  thread: {
    id: string;
    file: string;
    line: number;
    comments: PRComment[];
    isResolved: boolean;
  };
  currentUser?: string;
  onReply: (threadId: string, body: string) => Promise<void>;
  onReact: (commentId: string, reaction: string) => Promise<void>;
  onResolve?: (threadId: string) => Promise<void>;
  onClose: () => void;
  inline?: boolean; // If true, renders inline in editor (no absolute positioning)
}

const REACTIONS = ['👍', '👎', '😄', '🎉', '😕', '❤️', '🚀', '👀'];

// Map GitHub reaction content strings to emojis
const REACTION_EMOJI_MAP: Record<string, string> = {
  'THUMBS_UP': '👍',
  'THUMBS_DOWN': '👎',
  'LAUGH': '😄',
  'HOORAY': '🎉',
  'CONFUSED': '😕',
  'HEART': '❤️',
  'ROCKET': '🚀',
  'EYES': '👀',
  '+1': '👍',
  '-1': '👎',
};

const getReactionEmoji = (content: string): string => {
  return REACTION_EMOJI_MAP[content] || content;
};

export function PRCommentThread({
  thread,
  onReply,
  onReact,
  onResolve,
  onClose,
  inline = false,
}: PRCommentThreadProps) {
  const [replyBody, setReplyBody] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Debug: Log when isReplying changes
  useEffect(() => {
    console.log('[PRCommentThread] isReplying changed:', isReplying, {
      threadId: thread.id,
      inline,
      commentsCount: thread.comments.length,
    });
  }, [isReplying, thread.id, inline, thread.comments.length]);

  const handleReply = async () => {
    if (!replyBody.trim() || submitting) return;

    setSubmitting(true);
    try {
      await onReply(thread.id, replyBody);
      setReplyBody('');
      setIsReplying(false);
    } catch (error) {
      console.error('[PRCommentThread] Error submitting reply:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReact = async (commentId: string, reaction: string) => {
    try {
      await onReact(commentId, reaction);
      setShowReactionPicker(null);
    } catch (error) {
      console.error('[PRCommentThread] Error adding reaction:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const groupReactions = (reactions: Array<{ content: string; user: { login: string } }>) => {
    const grouped = new Map<string, string[]>();
    reactions.forEach((r) => {
      const users = grouped.get(r.content) || [];
      users.push(r.user.login);
      grouped.set(r.content, users);
    });
    return Array.from(grouped.entries()).map(([content, users]) => ({ content, users }));
  };

  return (
    <div
      className={inline
        ? "w-full bg-light-surface dark:bg-dark-surface rounded-md border border-light-border dark:border-dark-border overflow-hidden"
        : "absolute right-4 top-16 w-96 max-h-[80vh] overflow-y-auto bg-light-surface dark:bg-dark-surface rounded-lg shadow-2xl border-2 border-light-accent-primary dark:border-dark-accent-primary z-50"
      }
    >
      {/* Header */}
      <div className={inline
        ? "bg-light-surface-elevated dark:bg-dark-surface-elevated border-b border-light-border dark:border-dark-border px-3 py-2 flex items-center justify-between"
        : "sticky top-0 bg-light-surface dark:bg-dark-surface border-b border-light-border dark:border-dark-border px-4 py-3 flex items-center justify-between"
      }>
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-light-accent-primary dark:text-dark-accent-primary" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
          </svg>
          <div>
            <div className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">
              {thread.comments.length} comment{thread.comments.length !== 1 ? 's' : ''}
            </div>
            <div className="text-xs text-light-text-muted dark:text-dark-text-muted font-mono">
              {thread.file}:{thread.line}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {thread.isResolved ? (
            <span className="px-2 py-1 text-xs font-medium rounded bg-green-500/10 text-green-600 dark:text-green-400">
              ✓ Resolved
            </span>
          ) : onResolve ? (
            <button
              onClick={() => onResolve(thread.id)}
              className="px-2 py-1 text-xs font-medium rounded bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 transition-colors"
            >
              Resolve
            </button>
          ) : null}
          {!inline && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className={inline ? "p-3 space-y-2" : "px-4 py-3 space-y-4"}>
        {thread.comments.map((comment) => (
          <div key={comment.id} className="flex gap-2">
            {/* Avatar */}
            <img
              src={comment.authorAvatar || 'https://github.com/identicons/default.png'}
              alt={comment.author}
              className="w-8 h-8 rounded-full flex-shrink-0"
            />

            {/* Comment Bubble */}
            <div className="flex-1 min-w-0 border border-light-border dark:border-dark-border rounded-md overflow-hidden">
              {/* Comment Header */}
              <div className="px-3 py-2 bg-light-surface-elevated dark:bg-dark-surface-elevated border-b border-light-border dark:border-dark-border">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-light-text-primary dark:text-dark-text-primary">
                    {comment.author}
                  </span>
                  <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                    {formatDate(comment.createdAt)}
                  </span>
                </div>
              </div>

              {/* Comment Body */}
              <div className="px-3 py-2 bg-light-surface dark:bg-dark-surface">
                <div className="prose prose-sm dark:prose-invert max-w-none text-light-text-primary dark:text-dark-text-primary">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    components={{
                      pre: ({ children }) => <div className="my-4 not-prose">{children}</div>,
                      p: ({node, children, ...props}) => {
                        const hasCodeBlock = React.Children.toArray(children).some((child: any) => {
                          return child?.props?.className?.includes('language-');
                        });
                        const Element = hasCodeBlock ? 'div' : 'p';
                        return (
                          <Element className="mb-2 last:mb-0 text-light-text-primary dark:text-dark-text-primary leading-relaxed" {...props}>
                            {children}
                          </Element>
                        );
                      },
                      code: ({node, inline, className, children, ...props}: any) => {
                        if (inline || !className) {
                          return (
                            <code className="px-1.5 py-0.5 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary font-mono text-xs border border-light-border dark:border-dark-border" {...props}>
                              {children}
                            </code>
                          );
                        }
                        // Block code: render as plain code block without syntax highlighting
                        return (
                          <code className="block px-3 py-2 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary font-mono text-xs border border-light-border dark:border-dark-border overflow-x-auto" {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {comment.body}
                  </ReactMarkdown>
                </div>

                {/* Reactions */}
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {groupReactions(comment.reactions).map((reaction) => (
                    <button
                      key={reaction.content}
                      onClick={() => handleReact(comment.id, reaction.content)}
                      className="px-2 py-1 text-xs rounded bg-light-surface-elevated dark:bg-dark-surface-elevated hover:bg-light-border dark:hover:bg-dark-border transition-colors flex items-center gap-1"
                      title={reaction.users.join(', ')}
                    >
                      <span>{getReactionEmoji(reaction.content)}</span>
                      <span className="text-light-text-muted dark:text-dark-text-muted">
                        {reaction.users.length}
                      </span>
                    </button>
                  ))}

                  {/* Add Reaction Button */}
                  <div className="relative">
                    <button
                      onClick={() => setShowReactionPicker(showReactionPicker === comment.id ? null : comment.id)}
                      className="px-2 py-1 text-xs rounded border border-light-border dark:border-dark-border hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors"
                    >
                      😊 +
                    </button>

                    {showReactionPicker === comment.id && (
                      <div className="absolute left-0 mt-1 p-2 bg-light-surface dark:bg-dark-surface rounded-lg shadow-lg border border-light-border dark:border-dark-border z-10 flex gap-1">
                        {REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleReact(comment.id, emoji)}
                            className="text-xl hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated rounded p-1 transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reply Form */}
      {!thread.isResolved && (
        <div
          className={inline
            ? "bg-light-surface-elevated dark:bg-dark-surface-elevated border-t border-light-border dark:border-dark-border px-3 py-3"
            : "sticky bottom-0 bg-light-surface dark:bg-dark-surface border-t border-light-border dark:border-dark-border px-4 py-3"
          }
        >
          {!isReplying ? (
            <button
              onClick={() => setIsReplying(true)}
              className="w-full px-3 py-2 text-sm text-left rounded-md border border-light-border dark:border-dark-border hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors text-light-text-muted dark:text-dark-text-muted"
            >
              Write a reply...
            </button>
          ) : (
            <div className="space-y-2">
              <MarkdownEditor
                value={replyBody}
                onChange={setReplyBody}
                placeholder="Write a reply... (Markdown supported)"
                height={120}
                preview="edit"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setIsReplying(false);
                    setReplyBody('');
                  }}
                  disabled={submitting}
                  className="px-3 py-1.5 text-sm rounded-md bg-light-surface-elevated dark:bg-dark-surface-elevated hover:bg-light-border dark:hover:bg-dark-border text-light-text-primary dark:text-dark-text-primary transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReply}
                  disabled={!replyBody.trim() || submitting}
                  className="px-3 py-1.5 text-sm rounded-md bg-light-accent-primary dark:bg-dark-accent-primary hover:bg-light-accent-primary/90 dark:hover:bg-dark-accent-primary/90 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Replying...' : 'Reply'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
