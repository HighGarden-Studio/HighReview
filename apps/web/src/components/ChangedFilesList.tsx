import { useState, useMemo } from 'react';
import { FileStatusBadge } from './FileStatusBadge';

interface PRFile {
  path: string;
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface ChangedFilesListProps {
  files: PRFile[];
  selectedFile?: string;
  onFileSelect: (file: PRFile) => void;
  aiComments?: Map<string, number>;
}

type FilterType = 'all' | 'modified' | 'added' | 'removed';

export function ChangedFilesList({
  files,
  selectedFile,
  onFileSelect,
  aiComments,
}: ChangedFilesListProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // Group files by directory
  const filesByDir = useMemo(() => {
    const grouped = new Map<string, PRFile[]>();

    files.forEach(file => {
      const parts = file.path.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '/';

      if (!grouped.has(dir)) {
        grouped.set(dir, []);
      }
      grouped.get(dir)!.push(file);
    });

    return grouped;
  }, [files]);

  // Filter files
  const filteredFiles = useMemo(() => {
    let filtered = files;

    // Apply status filter
    if (filter !== 'all') {
      filtered = filtered.filter(f => f.status === filter);
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(f => f.path.toLowerCase().includes(query));
    }

    return filtered;
  }, [files, filter, searchQuery]);

  const toggleDir = (dir: string) => {
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(dir)) {
      newExpanded.delete(dir);
    } else {
      newExpanded.add(dir);
    }
    setExpandedDirs(newExpanded);
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const iconMap: Record<string, string> = {
      ts: '📘', tsx: '📘', js: '📙', jsx: '📙',
      json: '📋', md: '📝', css: '🎨', scss: '🎨',
      html: '🌐', py: '🐍', go: '🔵', rs: '⚙️',
      java: '☕', kt: '🔷', rb: '💎',
    };
    return iconMap[ext || ''] || '📄';
  };

  const getStatusCounts = () => {
    return {
      all: files.length,
      modified: files.filter(f => f.status === 'modified').length,
      added: files.filter(f => f.status === 'added').length,
      removed: files.filter(f => f.status === 'removed').length,
    };
  };

  const counts = getStatusCounts();

  return (
    <div className="h-full flex flex-col bg-light-surface-elevated dark:bg-dark-surface-elevated">
      {/* Header */}
      <div className="p-3 border-b border-light-border dark:border-dark-border">
        <h2 className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
          Changed Files ({filteredFiles.length})
        </h2>

        {/* Search */}
        <div className="relative mb-2">
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 text-sm rounded-md
                     bg-light-surface dark:bg-dark-surface
                     border border-light-border dark:border-dark-border
                     text-light-text-primary dark:text-dark-text-primary
                     placeholder-light-text-muted dark:placeholder-dark-text-muted
                     focus:outline-none focus:ring-2 focus:ring-light-accent-primary dark:focus:ring-dark-accent-primary"
          />
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-light-text-muted dark:text-dark-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Filter buttons */}
        <div className="flex gap-1">
          {(['all', 'modified', 'added', 'removed'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                filter === f
                  ? 'bg-light-accent-primary dark:bg-dark-accent-primary text-white'
                  : 'bg-light-surface dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {filteredFiles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-light-text-muted dark:text-dark-text-muted">
              {searchQuery ? 'No files found' : 'No changed files'}
            </span>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredFiles.map((file) => {
              const aiCommentCount = aiComments?.get(file.path) || 0;
              const isSelected = selectedFile === file.path;

              return (
                <button
                  key={file.path}
                  onClick={() => onFileSelect(file)}
                  className={`w-full text-left px-2 py-2 rounded transition-colors ${
                    isSelected
                      ? 'bg-light-accent-primary/20 dark:bg-dark-accent-primary/20 border-l-2 border-light-accent-primary dark:border-dark-accent-primary'
                      : 'hover:bg-light-surface dark:hover:bg-dark-surface'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base flex-shrink-0 mt-0.5">
                      {getFileIcon(file.filename)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary truncate">
                          {file.filename}
                        </span>
                        {aiCommentCount > 0 && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 font-semibold">
                            🤖 {aiCommentCount}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-light-text-muted dark:text-dark-text-muted truncate mb-1">
                        {file.path.split('/').slice(0, -1).join('/')}
                      </div>
                      <FileStatusBadge
                        status={file.status}
                        additions={file.additions}
                        deletions={file.deletions}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
