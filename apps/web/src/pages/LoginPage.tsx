import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

export function LoginPage() {
  const navigate = useNavigate();
  const [instructions, setInstructions] = useState<any>(null);

  // Check if user is already authenticated
  const { data: authStatus, isLoading, refetch } = useQuery({
    queryKey: ['authStatus'],
    queryFn: async () => {
      const response = await fetch('/api/auth/status');
      if (!response.ok) throw new Error('Failed to check auth status');
      return response.json();
    },
    refetchInterval: 3000, // Check every 3 seconds
  });

  useEffect(() => {
    // Fetch setup instructions
    fetch('/api/auth/setup-instructions')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch (e) {
          console.error('Failed to parse JSON:', text);
          throw new Error('Invalid JSON response');
        }
      })
      .then((data) => setInstructions(data))
      .catch((error) => {
        console.error('Failed to fetch setup instructions:', error);
      });
  }, []);

  useEffect(() => {
    // If already authenticated, redirect to home
    if (authStatus?.authenticated) {
      navigate('/', { replace: true });
    }
  }, [authStatus, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg">
        <div className="text-light-text-primary dark:text-dark-text-primary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg p-6">
      <div className="max-w-3xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-light-text-primary dark:text-dark-text-primary mb-2">
            HighReview
          </h1>
          <p className="text-light-text-secondary dark:text-dark-text-secondary">
            Local-First Contextual Code Reviewer
          </p>
        </div>

        <div className="bg-light-surface dark:bg-dark-surface rounded-lg shadow-lg p-8 border border-light-border dark:border-dark-border">
          <h2 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-6">
            Setup GitHub CLI
          </h2>

          {!authStatus?.authenticated && (
            <div className="mb-6 p-4 bg-light-accent-warning/10 dark:bg-dark-accent-warning/10 border border-light-accent-warning dark:border-dark-accent-warning rounded-lg">
              <p className="text-sm text-light-text-primary dark:text-dark-text-primary">
                <strong>GitHub CLI not authenticated.</strong> Please follow the steps below to
                set up GitHub CLI.
              </p>
            </div>
          )}

          {instructions && (
            <div className="space-y-6">
              {instructions.instructions.map((instruction: any, index: number) => (
                <div
                  key={index}
                  className="border border-light-border dark:border-dark-border rounded-lg p-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-light-accent-primary dark:bg-dark-accent-primary text-white flex items-center justify-center font-bold">
                      {instruction.step}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
                        {instruction.title}
                      </h3>
                      <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-3">
                        {instruction.description}
                      </p>
                      <div className="bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-md p-3 font-mono text-sm text-light-accent-primary dark:text-dark-accent-primary">
                        {instruction.command}
                      </div>

                      {instruction.alternatives && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                            Alternatives:
                          </p>
                          {instruction.alternatives.map((alt: any, altIndex: number) => (
                            <div
                              key={altIndex}
                              className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary"
                            >
                              <span className="font-semibold">{alt.platform}:</span>
                              <code className="bg-light-surface-elevated dark:bg-dark-surface-elevated px-2 py-1 rounded text-xs">
                                {alt.command}
                              </code>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-light-border dark:border-dark-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  After running{' '}
                  <code className="px-2 py-1 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-accent-primary dark:text-dark-accent-primary">
                    gh auth login
                  </code>
                  , this page will automatically redirect.
                </p>
              </div>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-light-accent-primary dark:bg-dark-accent-primary text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Check Again
              </button>
            </div>
          </div>
        </div>

        {instructions && (
          <div className="mt-6 text-center">
            <a
              href={instructions.documentationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-light-accent-primary dark:text-dark-accent-primary hover:underline"
            >
              View GitHub CLI Documentation →
            </a>
          </div>
        )}

        <div className="mt-8 p-4 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border">
          <h3 className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
            Why GitHub CLI?
          </h3>
          <ul className="text-sm text-light-text-secondary dark:text-dark-text-secondary space-y-1">
            <li>✅ No OAuth App configuration required</li>
            <li>✅ Uses your existing GitHub authentication</li>
            <li>✅ More secure - no tokens stored in the app</li>
            <li>✅ Works with private and organization repositories</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
