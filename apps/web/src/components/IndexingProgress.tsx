import { useEffect, useState } from 'react';

interface IndexingProgressProps {
  repoPath: string;
  onComplete?: (stats: any) => void;
  onError?: (error: string) => void;
}

interface ProgressData {
  current: number;
  total: number;
  file: string;
  percentage: number;
}

export function IndexingProgress({ repoPath, onComplete, onError }: IndexingProgressProps) {
  const [status, setStatus] = useState<'idle' | 'indexing' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState<ProgressData>({
    current: 0,
    total: 0,
    file: '',
    percentage: 0,
  });
  const [stats, setStats] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const abortController = new AbortController();

    const startIndexing = async () => {
      setStatus('indexing');

      try {
        // Start SSE connection
        const response = await fetch('/api/indexing/start-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ repoPath }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to start indexing: ${response.statusText}`);
        }

        // Read SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('Failed to get response reader');
        }

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6);
              try {
                const data = JSON.parse(dataStr);

                if (data.status === 'started') {
                  console.log('[IndexingProgress] Indexing started');
                } else if (data.status === 'completed') {
                  setStats(data.stats);
                  setStatus('completed');
                  onComplete?.(data.stats);
                } else if (data.status === 'error') {
                  setErrorMessage(data.error);
                  setStatus('error');
                  onError?.(data.error);
                } else if (data.current !== undefined) {
                  // Progress update
                  setProgress({
                    current: data.current,
                    total: data.total,
                    file: data.file,
                    percentage: data.percentage,
                  });
                }
              } catch (e) {
                console.error('[IndexingProgress] Failed to parse SSE data:', e);
              }
            }
          }
        }
      } catch (error: any) {
        if (error.name === 'AbortError') return;
        console.error('[IndexingProgress] Error:', error);
        setErrorMessage(error.message);
        setStatus('error');
        onError?.(error.message);
      }
    };

    startIndexing();

    return () => {
      abortController.abort();
    };
  }, [repoPath, onComplete, onError]);

  // Auto-hide after 3 seconds when completed
  useEffect(() => {
    if (status === 'completed') {
      const timer = setTimeout(() => {
        onComplete?.(stats);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status, onComplete, stats]);

  if (status === 'idle') {
    return null;
  }

  if (status === 'error') {
    return (
      <div className="fixed bottom-4 right-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 shadow-lg max-w-md z-[100]">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg
              className="w-5 h-5 text-red-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293-1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
              Indexing Failed
            </h3>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl max-w-md w-full mx-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <svg
                className="w-12 h-12 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Indexing Complete
              </h3>
              {stats && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Successfully indexed <span className="font-semibold text-green-600 dark:text-green-400">{stats.totalSymbols} symbols</span> in <span className="font-semibold">{stats.totalFiles} files</span>
                </p>
              )}
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-500">
                This window will close automatically...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Indexing in progress
  return (
    <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-lg max-w-md z-[100]">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <div className="w-5 h-5 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full border border-blue-500/30 relative overflow-hidden">
              <div className="absolute inset-x-0 h-[1px] bg-blue-500 animate-scanner" />
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Indexing Repository
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
            {progress.file || 'Starting...'}
          </p>
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
              <span>
                {progress.current} / {progress.total} files
              </span>
              <span>{progress.percentage}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
