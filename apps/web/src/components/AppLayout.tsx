import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSelector } from './LanguageSelector';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const { data: authStatus } = useQuery({
    queryKey: ['authStatus'],
    queryFn: async () => {
      const response = await fetch('/api/auth/status');
      if (!response.ok) throw new Error('Failed to check auth status');
      return response.json();
    },
    // Don't refetch too often for layout
    staleTime: 60000,
  });

  return (
    <div className="h-screen flex flex-col bg-light-bg dark:bg-dark-bg transition-colors duration-200">
      {/* Global Header */}
      <header className="flex-none border-b border-light-border dark:border-dark-border bg-light-surface/80 dark:bg-dark-surface/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo & Branding */}
          <div 
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate('/')}
          >
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-light-accent-primary to-light-accent-secondary dark:from-dark-accent-primary dark:to-dark-accent-secondary flex items-center justify-center text-white font-bold text-lg shadow-md">
              H
            </div>
            <div>
              <h1 className="text-lg font-bold text-light-text-primary dark:text-dark-text-primary leading-tight">
                HighReview
              </h1>
              <p className="text-[10px] text-light-text-muted dark:text-dark-text-muted leading-tight">
                Local-first PR Review
              </p>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {/* User Profile (if authenticated) */}
            {authStatus?.authenticated && authStatus?.user && (
              <div className="hidden md:flex items-center gap-2 mr-2 px-3 py-1.5 rounded-full bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border">
                {authStatus.user.avatarUrl ? (
                  <img
                    src={authStatus.user.avatarUrl}
                    alt={authStatus.user.username}
                    className="w-5 h-5 rounded-full"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-light-accent-primary/20 dark:bg-dark-accent-primary/20" />
                )}
                <span className="text-xs font-medium text-light-text-primary dark:text-dark-text-primary max-w-[100px] truncate">
                  {authStatus.user.username}
                </span>
              </div>
            )}

            {/* Settings Button */}
            <button
              onClick={() => navigate('/settings')}
              className={`p-2 rounded-lg transition-colors ${
                location.pathname === '/settings'
                  ? 'bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 text-light-accent-primary dark:text-dark-accent-primary'
                  : 'hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated text-light-text-secondary dark:text-dark-text-secondary'
              }`}
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            </button>

            <div className="w-px h-6 bg-light-border dark:bg-dark-border mx-1" />

            <LanguageSelector />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {children}
      </main>
    </div>
  );
}
