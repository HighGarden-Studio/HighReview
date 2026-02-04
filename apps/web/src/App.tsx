import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { PRListPage } from './pages/PRListPage';
import { PRDetailPage } from './pages/PRDetailPage';
import { ReviewPage } from './pages/ReviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { AppLayout } from './components/AppLayout';

function ReviewPageWrapper() {
  const { owner, repo, number } = useParams<{ owner: string; repo: string; number: string }>();
  const location = useLocation();
  const state = location.state as {
    worktreePath: string;
    baseBranch: string;
    repoRoot?: string;
    initialFilePath?: string;
    commentInfo?: any;
    aiReviewOptions?: any;
  } | null;

  // Query to setup/fetch review data if state is missing
  const { data: reviewData, isLoading, error } = useQuery({
    queryKey: ['reviewSetup', owner, repo, number],
    queryFn: async () => {
      if (state?.worktreePath) return state; // Use state if available
      if (!owner || !repo || !number) throw new Error('Missing parameters');

      const response = await fetch(`/api/prs/${owner}/${repo}/${number}/setup-review`, {
        method: 'POST', // Only creating setup if needed, or getting existing
      });
      
      if (!response.ok) {
        throw new Error('Failed to setup review environment');
      }
      
      return response.json();
    },
    enabled: !!owner && !!repo && !!number,
    initialData: state ? state : undefined,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-light-text-secondary dark:text-dark-text-secondary">
            Preparing review environment...
          </p>
        </div>
      </div>
    );
  }

  if (error || !reviewData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-2">
            Failed to load review session
          </p>
          <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm">
            {(error as Error)?.message || 'Unknown error'}
          </p>
          <button 
            onClick={() => window.location.href = `/prs/${owner}/${repo}/${number}`}
            className="mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
          >
            Return to PR Detail
          </button>
        </div>
      </div>
    );
  }

  return (
    <ReviewPage
      worktreePath={reviewData.worktreePath}
      baseBranch={reviewData.baseBranch || 'main'} // Fallback if API response structure varies
      repoRoot={reviewData.repoRoot} // Ensure API returns this
      initialFilePath={state?.initialFilePath} // Keep specific state params if they exist (though on direct load they wont)
      commentInfo={state?.commentInfo}
      aiReviewOptions={state?.aiReviewOptions}
      owner={owner || ''}
      repo={repo || ''}
      prNumber={number || '0'}
    />
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data: authStatus, isLoading } = useQuery({
    queryKey: ['authStatus'],
    queryFn: async () => {
      const response = await fetch('/api/auth/status');
      if (!response.ok) throw new Error('Failed to check auth status');
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg">
        <div className="text-light-text-primary dark:text-dark-text-primary">Loading...</div>
      </div>
    );
  }

  if (!authStatus?.authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// ... (keep ReviewPageWrapper and ProtectedRoute)

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--toast-bg, #334155)',
            color: 'var(--toast-text, #f1f5f9)',
            border: '1px solid var(--toast-border, #475569)',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#f1f5f9',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#f1f5f9',
            },
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout>
                <HomePage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/prs"
          element={
            <ProtectedRoute>
              <AppLayout>
                <PRListPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/prs/:owner/:repo/:number"
          element={
            <ProtectedRoute>
              <AppLayout>
                <PRDetailPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/review/:owner/:repo/:number"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ReviewPageWrapper />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <AppLayout>
                <SettingsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
