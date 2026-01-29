import { useState } from 'react';
import { ReviewPage } from './pages/ReviewPage';
import { ThemeToggle } from './components/ThemeToggle';

function App() {
  const [showDemo, setShowDemo] = useState(false);
  const [demoPath, setDemoPath] = useState('/Users/highgarden/Developments/AI/HighReview');

  if (showDemo) {
    return <ReviewPage worktreePath={demoPath} />;
  }

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="max-w-2xl w-full bg-light-surface dark:bg-dark-surface
                      rounded-2xl shadow-lg p-8 border border-light-border dark:border-dark-border">
        <h1 className="text-3xl font-bold text-light-text-primary dark:text-dark-text-primary mb-4">
          HighReview Demo
        </h1>
        <p className="text-light-text-secondary dark:text-dark-text-secondary mb-6">
          Enter a directory path to explore files with Monaco Editor
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-2">
              Directory Path
            </label>
            <input
              type="text"
              value={demoPath}
              onChange={(e) => setDemoPath(e.target.value)}
              className="w-full px-4 py-2 rounded-lg
                       bg-light-surface-elevated dark:bg-dark-surface-elevated
                       border border-light-border dark:border-dark-border
                       text-light-text-primary dark:text-dark-text-primary
                       focus:outline-none focus:ring-2 focus:ring-light-accent-primary dark:focus:ring-dark-accent-primary"
              placeholder="/path/to/directory"
            />
          </div>

          <button
            onClick={() => setShowDemo(true)}
            className="w-full px-6 py-3 rounded-lg bg-light-accent-primary dark:bg-dark-accent-primary
                     text-white font-medium hover:opacity-90 transition-opacity"
          >
            Open Directory
          </button>
        </div>

        <div className="mt-8 p-4 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated">
          <h3 className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
            Features:
          </h3>
          <ul className="text-sm text-light-text-secondary dark:text-dark-text-secondary space-y-1">
            <li>• File tree navigation</li>
            <li>• Syntax highlighting with Monaco Editor</li>
            <li>• Dark/Light theme support</li>
            <li>• UTF-8 encoding support (한글 포함)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;
