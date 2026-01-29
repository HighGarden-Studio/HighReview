import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { PRListPage } from './pages/PRListPage';
import { PRDetailPage } from './pages/PRDetailPage';
import { ReviewPage } from './pages/ReviewPage';
import { SettingsPage } from './pages/SettingsPage';

function ReviewPageWrapper() {
  const location = useLocation();
  const state = location.state as {
    worktreePath: string;
    baseBranch: string;
    repoRoot?: string;
    initialFilePath?: string;
    commentInfo?: any;
    aiReviewOptions?: any;
  } | null;

  console.log('[ReviewPageWrapper] Location state:', state);

  if (!state || !state.worktreePath) {
    console.log('[ReviewPageWrapper] No state or no worktreePath, showing error');
    return (
      <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg">
        <div className="text-center">
          <p className="text-light-text-primary dark:text-dark-text-primary text-lg mb-2">
            Invalid review session
          </p>
          <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm">
            Please start a review from a pull request.
          </p>
          <p className="text-light-text-muted dark:text-dark-text-muted text-xs mt-4">
            Debug: state = {JSON.stringify(state)}
          </p>
        </div>
      </div>
    );
  }

  console.log('[ReviewPageWrapper] Rendering ReviewPage with:', {
    worktreePath: state.worktreePath,
    baseBranch: state.baseBranch,
    repoRoot: state.repoRoot
  });

  return (
    <ReviewPage
      worktreePath={state.worktreePath}
      baseBranch={state.baseBranch}
      repoRoot={state.repoRoot}
      initialFilePath={state.initialFilePath}
      commentInfo={state.commentInfo}
      aiReviewOptions={state.aiReviewOptions}
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
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/prs"
          element={
            <ProtectedRoute>
              <PRListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/prs/:owner/:repo/:number"
          element={
            <ProtectedRoute>
              <PRDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/review"
          element={
            <ProtectedRoute>
              <ReviewPageWrapper />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
