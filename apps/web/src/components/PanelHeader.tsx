import { ReactNode } from 'react';

interface PanelHeaderProps {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  onCollapse?: () => void;
  isCollapsed?: boolean;
}

export function PanelHeader({
  title,
  icon,
  actions,
  onCollapse,
  isCollapsed,
}: PanelHeaderProps) {
  return (
    <div className="h-10 border-b border-light-border dark:border-dark-border
                    flex items-center justify-between px-3
                    bg-light-surface-elevated dark:bg-dark-surface-elevated">
      <div className="flex items-center gap-2">
        {icon && <span className="text-light-text-secondary dark:text-dark-text-secondary">{icon}</span>}
        <h2 className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">
          {title}
        </h2>
      </div>

      <div className="flex items-center gap-2">
        {actions}
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="p-1 rounded hover:bg-light-surface dark:hover:bg-dark-surface
                     text-light-text-muted dark:text-dark-text-muted
                     hover:text-light-text-primary dark:hover:text-dark-text-primary
                     transition-colors"
            aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isCollapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              )}
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
