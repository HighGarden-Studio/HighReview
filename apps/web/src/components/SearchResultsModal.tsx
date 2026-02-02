import { useState } from 'react';

interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
}

interface SearchResultsModalProps {
  query: string;
  results: SearchResult[];
  isOpen: boolean;
  onClose: () => void;
  onResultClick: (file: string, line: number, column: number, keyword?: string) => void;
  truncated?: boolean;
}

export function SearchResultsModal({
  query,
  results,
  isOpen,
  onClose,
  onResultClick,
  truncated = false,
}: SearchResultsModalProps) {
  const [filter, setFilter] = useState('');

  if (!isOpen) return null;

  // Group results by file
  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.file]) {
      acc[result.file] = [];
    }
    acc[result.file].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  // Filter files and results
  const filteredFiles = Object.keys(groupedResults).filter(file =>
    file.toLowerCase().includes(filter.toLowerCase()) ||
    groupedResults[file].some(r => r.text.toLowerCase().includes(filter.toLowerCase()))
  );

  const totalResults = results.length;
  const fileCount = Object.keys(groupedResults).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl h-[80vh] bg-light-surface dark:bg-dark-surface rounded-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-light-border dark:border-dark-border bg-gradient-to-r from-light-accent-primary to-light-accent-secondary dark:from-dark-accent-primary dark:to-dark-accent-secondary">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Search Results for "{query}"
            </h2>
            <p className="text-sm text-white/80 mt-1">
              {totalResults} result{totalResults !== 1 ? 's' : ''} in {fileCount} file{fileCount !== 1 ? 's' : ''}
              {truncated && ' (truncated to first 1000 matches)'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-white"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Search Filter */}
        <div className="px-6 py-3 border-b border-light-border dark:border-dark-border">
          <input
            type="text"
            placeholder="Filter results..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted focus:outline-none focus:ring-2 focus:ring-light-accent-primary dark:focus:ring-dark-accent-primary"
          />
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-light-text-muted dark:text-dark-text-muted">
              <svg
                className="w-16 h-16 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <p className="text-lg font-medium">No results found</p>
              <p className="text-sm mt-1">Try adjusting your filter</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFiles.map((file) => (
                <div key={file} className="bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border overflow-hidden">
                  {/* File Header */}
                  <div className="px-4 py-2 bg-light-surface dark:bg-dark-surface border-b border-light-border dark:border-dark-border">
                    <div className="flex items-start gap-2">
                      <svg
                        className="w-4 h-4 text-light-accent-primary dark:text-dark-accent-primary flex-shrink-0 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span className="text-sm font-mono font-medium text-light-text-primary dark:text-dark-text-primary break-all flex-1 min-w-0">
                        {file}
                      </span>
                      <span className="text-xs text-light-text-muted dark:text-dark-text-muted whitespace-nowrap flex-shrink-0">
                        {groupedResults[file].length} match{groupedResults[file].length !== 1 ? 'es' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Results */}
                  <div className="divide-y divide-light-border dark:divide-dark-border">
                    {groupedResults[file].map((result, idx) => (
                      <button
                        key={`${result.file}-${result.line}-${idx}`}
                        onClick={() => onResultClick(result.file, result.line, result.column, query)}
                        className="w-full px-4 py-2 text-left hover:bg-light-accent-primary/10 dark:hover:bg-dark-accent-primary/10 transition-colors group"
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-xs font-mono text-light-text-muted dark:text-dark-text-muted flex-shrink-0 mt-0.5">
                            {result.line}:{result.column}
                          </span>
                          <code className="text-xs font-mono text-light-text-secondary dark:text-dark-text-secondary flex-1 break-words">
                            {result.text}
                          </code>
                          <svg
                            className="w-4 h-4 text-light-accent-primary dark:text-dark-accent-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-light-border dark:border-dark-border bg-light-surface-elevated dark:bg-dark-surface-elevated">
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted text-center">
            Click on a result to navigate to that location in the code
          </p>
        </div>
      </div>
    </div>
  );
}
