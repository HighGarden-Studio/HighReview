interface InlineCommentButtonProps {
  line: number;
  onClick: (line: number) => void;
  hasComment?: boolean;
  isAIComment?: boolean;
}

export function InlineCommentButton({
  line,
  onClick,
  hasComment = false,
  isAIComment = false,
}: InlineCommentButtonProps) {
  return (
    <button
      onClick={() => onClick(line)}
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full transition-all
        ${
          hasComment
            ? isAIComment
              ? 'bg-blue-500 text-white'
              : 'bg-yellow-500 text-white'
            : 'bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-muted dark:text-dark-text-muted hover:bg-light-accent-primary dark:hover:bg-dark-accent-primary hover:text-white'
        }`}
      title={
        hasComment
          ? isAIComment
            ? 'AI comment on this line'
            : 'Pending comment on this line'
          : 'Add comment to this line'
      }
      style={{
        fontSize: '10px',
        lineHeight: '1',
      }}
    >
      {hasComment ? (isAIComment ? '🤖' : '💬') : '+'}
    </button>
  );
}
