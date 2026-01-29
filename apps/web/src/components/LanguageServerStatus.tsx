import { useState, useEffect } from 'react';

interface LanguageServerInfo {
  installed: boolean;
  instructions: string;
}

interface LanguageServersStatus {
  servers: Record<string, LanguageServerInfo>;
  allInstalled: boolean;
}

export function LanguageServerStatus() {
  const [status, setStatus] = useState<LanguageServersStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    checkLanguageServers();
  }, []);

  const checkLanguageServers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8765/api/lsp/check-all');
      const data = await response.json();
      setStatus(data);

      // Auto-expand if not all servers are installed
      if (!data.allInstalled) {
        setIsExpanded(true);
      }
    } catch (error) {
      console.error('[LanguageServerStatus] Failed to check servers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Checking language servers...
          </span>
        </div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const installedCount = Object.values(status.servers).filter(s => s.installed).length;
  const totalCount = Object.keys(status.servers).length;

  return (
    <div className="bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border overflow-hidden">
      {/* Header */}
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-light-surface dark:hover:bg-dark-surface transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            status.allInstalled
              ? 'bg-green-500'
              : installedCount > 0
              ? 'bg-yellow-500'
              : 'bg-red-500'
          }`}></div>
          <span className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">
            Language Servers
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-light-surface dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary">
            {installedCount}/{totalCount} installed
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              checkLanguageServers();
            }}
            className="px-3 py-1 text-xs rounded bg-light-surface dark:bg-dark-surface hover:bg-light-accent-primary/10 dark:hover:bg-dark-accent-primary/10 text-light-text-secondary dark:text-dark-text-secondary transition-colors"
            title="Refresh status"
          >
            🔄 Refresh
          </button>
          <svg
            className={`w-5 h-5 text-light-text-secondary dark:text-dark-text-secondary transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-light-border dark:border-dark-border">
          <div className="p-4 space-y-3">
            {Object.entries(status.servers).map(([lang, info]) => (
              <div
                key={lang}
                className="p-3 bg-light-surface dark:bg-dark-surface rounded-lg border border-light-border dark:border-dark-border"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      info.installed ? 'bg-green-500' : 'bg-red-500'
                    }`}></div>
                    <span className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary capitalize">
                      {lang}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    info.installed
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400'
                  }`}>
                    {info.installed ? 'Installed' : 'Not Installed'}
                  </span>
                </div>

                {!info.installed && (
                  <div className="mt-2 p-2 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded text-xs">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-light-text-secondary dark:text-dark-text-secondary font-semibold">
                        Installation:
                      </span>
                    </div>
                    <code className="block p-2 bg-light-surface dark:bg-dark-surface rounded font-mono text-light-text-primary dark:text-dark-text-primary overflow-x-auto">
                      {info.instructions}
                    </code>
                    {lang === 'typescript' && (
                      <p className="mt-2 text-light-text-muted dark:text-dark-text-muted">
                        <strong>Note:</strong> TypeScript language server is required for JavaScript/TypeScript code navigation.
                      </p>
                    )}
                    {lang === 'ruby' && (
                      <p className="mt-2 text-light-text-muted dark:text-dark-text-muted">
                        <strong>Note:</strong> Solargraph provides IntelliSense, code completion, and go-to-definition for Ruby.
                      </p>
                    )}
                    {lang === 'java' && (
                      <p className="mt-2 text-light-text-muted dark:text-dark-text-muted">
                        <strong>Note:</strong> Eclipse JDT Language Server provides full IDE features for Java development.
                      </p>
                    )}
                  </div>
                )}

                {info.installed && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-light-text-muted dark:text-dark-text-muted">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>
                      Code navigation features enabled for {lang}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-4 bg-light-surface dark:bg-dark-surface border-t border-light-border dark:border-dark-border">
            <div className="flex items-start gap-2 text-xs text-light-text-muted dark:text-dark-text-muted">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="mb-1">
                  Language servers enable advanced code navigation features like "Go to Definition", "Find Usages", and "Find Implementations".
                </p>
                <p>
                  The project indexing system provides basic navigation without language servers, but installing them significantly improves accuracy and performance.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
