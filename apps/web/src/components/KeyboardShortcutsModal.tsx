import { KEYBOARD_SHORTCUTS } from '../hooks/useKeyboardShortcuts';

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  const formatKey = (key: string) => {
    return key.replace('Cmd/Ctrl', isMac ? 'Cmd' : 'Ctrl');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-light-surface dark:bg-dark-surface rounded-lg shadow-2xl w-[600px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-light-border dark:border-dark-border">
          <div>
            <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
              Keyboard Shortcuts
            </h2>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
              Speed up your code review workflow
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated
                     text-light-text-muted dark:text-dark-text-muted
                     hover:text-light-text-primary dark:hover:text-dark-text-primary
                     transition-colors"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Navigation */}
            <div>
              <h3 className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
                Navigation
              </h3>
              <div className="space-y-2">
                {KEYBOARD_SHORTCUTS.navigation.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-md bg-light-surface-elevated dark:bg-dark-surface-elevated"
                  >
                    <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                      {shortcut.description}
                    </span>
                    <kbd className="px-3 py-1.5 text-sm font-mono rounded bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary">
                      {formatKey(shortcut.key)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>

            {/* Comments */}
            <div>
              <h3 className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                  />
                </svg>
                Comments & Review
              </h3>
              <div className="space-y-2">
                {KEYBOARD_SHORTCUTS.comments.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-md bg-light-surface-elevated dark:bg-dark-surface-elevated"
                  >
                    <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                      {shortcut.description}
                    </span>
                    <kbd className="px-3 py-1.5 text-sm font-mono rounded bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary">
                      {formatKey(shortcut.key)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>

            {/* Panels */}
            <div>
              <h3 className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                  />
                </svg>
                Panels
              </h3>
              <div className="space-y-2">
                {KEYBOARD_SHORTCUTS.panels.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-md bg-light-surface-elevated dark:bg-dark-surface-elevated"
                  >
                    <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                      {shortcut.description}
                    </span>
                    <kbd className="px-3 py-1.5 text-sm font-mono rounded bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary">
                      {formatKey(shortcut.key)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>

            {/* General */}
            <div>
              <h3 className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                General
              </h3>
              <div className="space-y-2">
                {KEYBOARD_SHORTCUTS.general.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-md bg-light-surface-elevated dark:bg-dark-surface-elevated"
                  >
                    <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                      {shortcut.description}
                    </span>
                    <kbd className="px-3 py-1.5 text-sm font-mono rounded bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary">
                      {formatKey(shortcut.key)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-light-border dark:border-dark-border">
          <div className="flex items-center gap-2 text-xs text-light-text-muted dark:text-dark-text-muted">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              Press <kbd className="px-1.5 py-0.5 text-xs font-mono rounded bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border">?</kbd> anytime to show this dialog
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
