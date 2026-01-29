import { useState, forwardRef } from 'react';
import { DiffEditor } from './DiffEditor';
import { FileStatusBadge } from './FileStatusBadge';
import { CommentForm } from './CommentForm';
import { useTheme } from '../contexts/ThemeContext';

interface PRFile {
  path: string;
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface AIReviewComment {
  file: string;
  line: number;
  severity: 'critical' | 'warning' | 'suggestion';
  category: string;
  message: string;
  suggestion?: string;
}

interface UnifiedFileSectionProps {
  file: PRFile;
  worktreePath: string;
  baseBranch: string;
  repoRoot: string;
  originalContent?: string;
  modifiedContent?: string;
  isLoading?: boolean;
  aiComments?: AIReviewComment[];
  onViewInSplit?: () => void;
  onAddComment?: (file: string, line: number, body: string) => void;
}

export const UnifiedFileSection = forwardRef<HTMLDivElement, UnifiedFileSectionProps>(
  (
    {
      file,
      worktreePath,
      baseBranch,
      repoRoot,
      originalContent,
      modifiedContent,
      isLoading,
      aiComments,
      onViewInSplit,
      onAddComment,
    },
    ref
  ) => {
    const { theme } = useTheme();
    const [isExpanded, setIsExpanded] = useState(true);
    const [commentLine, setCommentLine] = useState<number | null>(null);

    const getLanguageFromFilename = (filename: string): string => {
      const ext = filename.split('.').pop()?.toLowerCase();
      const languageMap: Record<string, string> = {
        ts: 'typescript',
        tsx: 'typescript',
        js: 'javascript',
        jsx: 'javascript',
        json: 'json',
        html: 'html',
        css: 'css',
        scss: 'scss',
        sass: 'scss',
        less: 'less',
        md: 'markdown',
        markdown: 'markdown',
        py: 'python',
        go: 'go',
        rs: 'rust',
        java: 'java',
        cpp: 'cpp',
        cc: 'cpp',
        cxx: 'cpp',
        c: 'c',
        h: 'c',
        rb: 'ruby',
        sh: 'shell',
        bash: 'shell',
        php: 'php',
        swift: 'swift',
        kt: 'kotlin',
        scala: 'scala',
        sql: 'sql',
        xml: 'xml',
        yaml: 'yaml',
        yml: 'yaml',
      };
      return languageMap[ext || ''] || 'plaintext';
    };

    const aiCommentCount = aiComments?.length || 0;

    return (
      <div
        ref={ref}
        className="border-b border-light-border dark:border-dark-border"
        data-filename={file.path}
      >
        {/* Sticky File Header */}
        <div className="sticky top-0 z-10 bg-light-surface-elevated dark:bg-dark-surface-elevated border-b border-light-border dark:border-dark-border">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex-shrink-0 p-1 hover:bg-light-surface dark:hover:bg-dark-surface rounded transition-colors"
                aria-label={isExpanded ? 'Collapse file' : 'Expand file'}
              >
                <svg
                  className={`w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary truncate">
                {file.path}
              </span>
              <FileStatusBadge
                status={file.status}
                additions={file.additions}
                deletions={file.deletions}
              />
              {aiCommentCount > 0 && (
                <span className="flex-shrink-0 px-2 py-0.5 text-xs rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 font-semibold">
                  🤖 {aiCommentCount}
                </span>
              )}
            </div>
            {onViewInSplit && (
              <button
                onClick={onViewInSplit}
                className="flex-shrink-0 px-3 py-1 text-xs rounded
                         bg-light-surface dark:bg-dark-surface
                         hover:bg-light-accent-primary/10 dark:hover:bg-dark-accent-primary/10
                         text-light-text-secondary dark:text-dark-text-secondary
                         hover:text-light-accent-primary dark:hover:text-dark-accent-primary
                         transition-colors"
              >
                View in Split
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Content */}
        {isExpanded && (
          <div className="bg-light-surface dark:bg-dark-surface">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <span className="text-sm text-light-text-muted dark:text-dark-text-muted">
                  Loading diff...
                </span>
              </div>
            ) : originalContent !== undefined && modifiedContent !== undefined ? (
              <>
                <div style={{ height: '600px' }}>
                  <DiffEditor
                    original={originalContent}
                    modified={modifiedContent}
                    language={getLanguageFromFilename(file.filename)}
                    theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                    height="600px"
                    filePath={file.path}
                    repoRoot={repoRoot}
                    onAddComment={(line) => setCommentLine(line)}
                  />
                </div>
                {commentLine !== null && onAddComment && (
                  <div className="p-4 border-t border-light-border dark:border-dark-border">
                    <CommentForm
                      file={file.path}
                      line={commentLine}
                      onSubmit={(body) => {
                        onAddComment(file.path, commentLine, body);
                        setCommentLine(null);
                      }}
                      onCancel={() => setCommentLine(null)}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center py-20">
                <span className="text-sm text-light-text-muted dark:text-dark-text-muted">
                  Unable to load diff
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

UnifiedFileSection.displayName = 'UnifiedFileSection';
