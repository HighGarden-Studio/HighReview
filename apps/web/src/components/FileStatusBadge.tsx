interface FileStatusBadgeProps {
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions?: number;
  deletions?: number;
}

export function FileStatusBadge({ status, additions = 0, deletions = 0 }: FileStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'added':
        return {
          label: 'A',
          color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
          border: 'border-green-600 dark:border-green-400',
        };
      case 'removed':
        return {
          label: 'D',
          color: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
          border: 'border-red-600 dark:border-red-400',
        };
      case 'renamed':
        return {
          label: 'R',
          color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30',
          border: 'border-yellow-600 dark:border-yellow-400',
        };
      case 'modified':
      default:
        return {
          label: 'M',
          color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
          border: 'border-blue-600 dark:border-blue-400',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded border ${config.color} ${config.border}`}
      >
        {config.label}
      </span>
      <div className="flex items-center gap-1 text-xs font-mono">
        {additions > 0 && (
          <span className="text-green-600 dark:text-green-400">+{additions}</span>
        )}
        {deletions > 0 && (
          <span className="text-red-600 dark:text-red-400">-{deletions}</span>
        )}
      </div>
    </div>
  );
}
