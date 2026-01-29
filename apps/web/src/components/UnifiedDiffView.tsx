import React, { useState, useEffect, useRef, RefObject, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UnifiedFileSection } from './UnifiedFileSection';
import { useFileIntersection } from '../hooks/useFileIntersection';

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

interface AIReviewResult {
  criticalIssues: AIReviewComment[];
  warnings: AIReviewComment[];
  suggestions: AIReviewComment[];
  [key: string]: any;
}

interface UnifiedDiffViewProps {
  files: PRFile[];
  worktreePath: string;
  baseBranch: string;
  repoRoot: string;
  owner: string;
  repo: string;
  prNumber: string;
  headRef?: string;
  aiReviewData?: AIReviewResult | null;
  onFileInView: (filename: string) => void;
  onViewInSplit?: (file: PRFile) => void;
  onAddComment?: (file: string, line: number, body: string) => void;
}

export function UnifiedDiffView({
  files,
  worktreePath,
  baseBranch,
  repoRoot,
  owner,
  repo,
  prNumber,
  headRef,
  aiReviewData,
  onFileInView,
  onViewInSplit,
  onAddComment,
}: UnifiedDiffViewProps) {
  const [fileRefs] = useState<Map<string, RefObject<HTMLDivElement>>>(
    () => new Map(files.map(f => [f.path, { current: null }]))
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Group AI comments by file
  const commentsByFile = useMemo(() => {
    const map = new Map<string, AIReviewComment[]>();
    if (aiReviewData) {
      const allComments = [
        ...aiReviewData.criticalIssues,
        ...aiReviewData.warnings,
        ...aiReviewData.suggestions,
      ];
      allComments.forEach(comment => {
        if (!map.has(comment.file)) {
          map.set(comment.file, []);
        }
        map.get(comment.file)!.push(comment);
      });
    }
    return map;
  }, [aiReviewData]);

  // Track file in view
  useFileIntersection(fileRefs, (filename) => {
    setSelectedFile(filename);
    onFileInView(filename);
  });

  // Scroll to file function
  const scrollToFile = (filename: string) => {
    const ref = fileRefs.get(filename);
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="h-full flex flex-col bg-light-surface dark:bg-dark-surface">
      {/* Sticky Jump to File Dropdown */}
      <div className="sticky top-0 z-20 bg-light-surface-elevated dark:bg-dark-surface-elevated border-b border-light-border dark:border-dark-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary">
            Jump to file:
          </span>
          <select
            value={selectedFile || ''}
            onChange={(e) => scrollToFile(e.target.value)}
            className="flex-1 px-2 py-1 text-sm rounded font-mono
                     bg-light-surface dark:bg-dark-surface
                     border border-light-border dark:border-dark-border
                     text-light-text-primary dark:text-dark-text-primary
                     focus:outline-none focus:ring-2 focus:ring-light-accent-primary dark:focus:ring-dark-accent-primary"
          >
            {files.map(file => {
              const statusBadge =
                file.status === 'added' ? '[A]' :
                file.status === 'removed' ? '[D]' :
                file.status === 'renamed' ? '[R]' :
                '[M]';
              const changes = `+${file.additions || 0} -${file.deletions || 0}`;
              return (
                <option key={file.path} value={file.path}>
                  {statusBadge} {file.path} ({changes})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Scrollable File Sections */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
      >
        {files.map(file => {
          const ref = fileRefs.get(file.path);
          return (
            <FileDiffSection
              key={file.path}
              ref={ref as RefObject<HTMLDivElement>}
              file={file}
              worktreePath={worktreePath}
              baseBranch={baseBranch}
              repoRoot={repoRoot}
              owner={owner}
              repo={repo}
              headRef={headRef}
              aiComments={commentsByFile.get(file.path)}
              onViewInSplit={() => onViewInSplit?.(file)}
              onAddComment={onAddComment}
            />
          );
        })}
      </div>
    </div>
  );
}

// Separate component to handle individual file diff fetching
interface FileDiffSectionProps {
  file: PRFile;
  worktreePath: string;
  baseBranch: string;
  repoRoot: string;
  owner?: string;
  repo?: string;
  headRef?: string;
  aiComments?: AIReviewComment[];
  onViewInSplit?: () => void;
  onAddComment?: (file: string, line: number, body: string) => void;
}

const FileDiffSection = React.forwardRef<HTMLDivElement, FileDiffSectionProps>(
  ({ file, worktreePath, baseBranch, repoRoot, owner, repo, headRef, aiComments, onViewInSplit, onAddComment }, ref) => {
    // Fetch diff for this specific file
    const { data: diffData, isLoading } = useQuery({
      queryKey: ['fileDiff', worktreePath, file.path, baseBranch, owner, repo, headRef],
      queryFn: async () => {
        const params: Record<string, string> = {
          worktreePath,
          filePath: file.path,
          baseBranch,
          repoRoot,
        };

        // Add optional GitHub API params for fallback
        if (owner) params.owner = owner;
        if (repo) params.repo = repo;
        if (headRef) params.headRef = headRef;

        const response = await fetch(
          `/api/fs/diff?${new URLSearchParams(params)}`
        );
        if (!response.ok) {
          throw new Error('Failed to fetch diff');
        }
        return response.json();
      },
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    });

    return (
      <UnifiedFileSection
        ref={ref}
        file={file}
        worktreePath={worktreePath}
        baseBranch={baseBranch}
        repoRoot={repoRoot}
        originalContent={diffData?.original}
        modifiedContent={diffData?.modified}
        isLoading={isLoading}
        aiComments={aiComments}
        onViewInSplit={onViewInSplit}
        onAddComment={onAddComment}
      />
    );
  }
);

FileDiffSection.displayName = 'FileDiffSection';
