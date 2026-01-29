import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageSelector } from '../components/LanguageSelector';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage, languageNames } from '../contexts/LanguageContext';

export function HomePage() {
  const { theme } = useTheme();
  const { language } = useLanguage();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['hello'],
    queryFn: async () => {
      const response = await fetch('/api/hello');
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
  });

  const { data: authStatus } = useQuery({
    queryKey: ['authStatus'],
    queryFn: async () => {
      const response = await fetch('/api/auth/status');
      if (!response.ok) throw new Error('Failed to check auth status');
      return response.json();
    },
  });

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="min-h-screen transition-colors duration-200 bg-light-bg dark:bg-dark-bg">
      {/* Header */}
      <header className="border-b border-light-border dark:border-dark-border bg-light-surface/80 dark:bg-dark-surface/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-light-accent-primary to-light-accent-secondary dark:from-dark-accent-primary dark:to-dark-accent-secondary flex items-center justify-center text-white font-bold text-lg shadow-lg">
              H
            </div>
            <div>
              <h1 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary">
                HighReview
              </h1>
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                Local-first PR Review Tool
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {authStatus?.authenticated && (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">
                    {authStatus.user.username}
                  </p>
                  <button
                    onClick={handleLogout}
                    className="text-xs text-light-text-muted dark:text-dark-text-muted hover:text-light-accent-error dark:hover:text-dark-accent-error"
                  >
                    Logout
                  </button>
                </div>
                {authStatus.user.avatarUrl && (
                  <img
                    src={authStatus.user.avatarUrl}
                    alt={authStatus.user.username}
                    className="w-8 h-8 rounded-full"
                  />
                )}
              </div>
            )}

            <LanguageSelector />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Welcome Card */}
          <div className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-2xl p-8 shadow-lg">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 rounded-xl bg-light-accent-primary/10 dark:bg-dark-accent-primary/10">
                <svg
                  className="w-8 h-8 text-light-accent-primary dark:text-dark-accent-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary mb-2">
                  Welcome to HighReview
                </h2>
                <p className="text-light-text-secondary dark:text-dark-text-secondary">
                  A powerful code review tool that uses{' '}
                  <code className="px-2 py-1 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-accent-primary dark:text-dark-accent-primary">
                    git worktree
                  </code>{' '}
                  to provide an isolated, context-aware review environment.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border">
                <div className="text-2xl mb-2">🚀</div>
                <h3 className="font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
                  Zero Distraction
                </h3>
                <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
                  Never touches your working directory
                </p>
              </div>
              <div className="p-4 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border">
                <div className="text-2xl mb-2">⚡</div>
                <h3 className="font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
                  Lightweight
                </h3>
                <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
                  Fast and minimal resource usage
                </p>
              </div>
              <div className="p-4 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border">
                <div className="text-2xl mb-2">🤖</div>
                <h3 className="font-semibold text-light-text-primary dark:text-dark-text-primary mb-1">
                  AI-Powered
                </h3>
                <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
                  Context-aware code insights
                </p>
              </div>
            </div>
          </div>

          {/* System Status Card */}
          <div className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-2xl p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
              System Status
            </h2>

            <div className="space-y-3">
              {/* Backend Status */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      data
                        ? 'bg-light-accent-success dark:bg-dark-accent-success'
                        : isLoading
                          ? 'bg-light-accent-warning dark:bg-dark-accent-warning animate-pulse'
                          : 'bg-light-accent-error dark:bg-dark-accent-error'
                    }`}
                  />
                  <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
                    Backend Server
                  </span>
                </div>
                <div className="text-right">
                  {isLoading && (
                    <span className="text-sm text-light-text-muted dark:text-dark-text-muted">
                      Connecting...
                    </span>
                  )}
                  {error && (
                    <span className="text-sm text-light-accent-error dark:text-dark-accent-error">
                      Error: {(error as Error).message}
                    </span>
                  )}
                  {data && (
                    <span className="text-sm text-light-accent-success dark:text-dark-accent-success font-medium">
                      Connected
                    </span>
                  )}
                </div>
              </div>

              {/* Frontend Status */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-light-accent-success dark:bg-dark-accent-success" />
                  <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
                    Frontend Client
                  </span>
                </div>
                <span className="text-sm text-light-accent-success dark:text-dark-accent-success font-medium">
                  Active
                </span>
              </div>

              {/* Theme Status */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-light-accent-primary dark:bg-dark-accent-primary" />
                  <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
                    Theme
                  </span>
                </div>
                <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary font-medium capitalize">
                  {theme}
                </span>
              </div>

              {/* Language Status */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-light-accent-secondary dark:bg-dark-accent-secondary" />
                  <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
                    Language
                  </span>
                </div>
                <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary font-medium">
                  {languageNames[language]}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-2xl p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
              Quick Actions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => navigate('/prs')}
                className="group relative overflow-hidden px-6 py-4 bg-gradient-to-br from-light-accent-primary to-light-accent-secondary dark:from-dark-accent-primary dark:to-dark-accent-secondary text-white rounded-lg font-medium hover:shadow-lg transition-all"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  <div className="text-left">
                    <div className="font-semibold">View Pull Requests</div>
                    <div className="text-xs opacity-90">Review requested PRs</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate('/settings')}
                className="px-6 py-4 bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary rounded-lg font-medium hover:bg-light-border dark:hover:bg-dark-border transition-colors border border-light-border dark:border-dark-border"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <div className="text-left">
                    <div className="font-semibold">Settings</div>
                    <div className="text-xs text-light-text-muted dark:text-dark-text-muted">
                      Configure AI & repositories
                    </div>
                  </div>
                </div>
              </button>

              <button
                onClick={() =>
                  navigate('/review', {
                    state: {
                      worktreePath: '/Users/highgarden/.highreview/worktrees/example',
                      baseBranch: 'main',
                      repoRoot: '/Users/highgarden/Developments/AI/HighReview',
                    },
                  })
                }
                className="px-6 py-4 bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary rounded-lg font-medium hover:bg-light-border dark:hover:bg-dark-border transition-colors border border-light-border dark:border-dark-border"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                  <div className="text-left">
                    <div className="font-semibold">Code Review (Demo)</div>
                    <div className="text-xs text-light-text-muted dark:text-dark-text-muted">
                      Test review interface
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Info Footer */}
          <div className="text-center space-y-2">
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
              Frontend:{' '}
              <code className="text-light-accent-primary dark:text-dark-accent-primary">
                localhost:5173
              </code>
              {' • '}
              Backend:{' '}
              <code className="text-light-accent-primary dark:text-dark-accent-primary">
                localhost:8765
              </code>
            </p>
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
              Phase A: GitHub Integration
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
