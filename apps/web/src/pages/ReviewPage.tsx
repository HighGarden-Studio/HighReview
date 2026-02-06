import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Allotment } from 'allotment';
import { FileTree, type FileNode } from '../components/FileTree';
import { AIProgressIndicator, type AIReviewStep } from '../components/AIProgressIndicator';
import { CodeEditor, type CodeReference } from '../components/CodeEditor';
import { DiffEditor } from '../components/DiffEditor';
import { ChatPanel } from '../components/ChatPanel';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageSelector } from '../components/LanguageSelector';
import { EnhancedAIReviewPanel } from '../components/EnhancedAIReviewPanel';
import { PRCommentThread } from '../components/PRCommentThread';
import { ReviewSubmissionModal } from '../components/ReviewSubmissionModal';
import { AIReviewOptionsModal } from '../components/AIReviewOptionsModal';
import { CodeNavigationModal } from '../components/CodeNavigationModal';
import { SearchResultsModal } from '../components/SearchResultsModal';
import { usePendingReview } from '../hooks/usePendingReview';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { registerIndexedProvider, disposeIndexedProvider } from '../utils/indexedLanguageProvider';
import { loadPRFilesIntoMonaco } from '../utils/monacoSetup';
import { detectFunctionLines } from '../utils/aiReviewDecorations';

export interface PRFile {
  path: string;
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface ReviewPageProps {
  worktreePath: string;
  baseBranch?: string;
  repoRoot?: string;
  initialFilePath?: string;
  commentInfo?: any;
  aiReviewOptions?: any;
  owner: string;
  repo: string;
  prNumber: string;
}

interface AIReviewComment {
  file: string;
  line: number;
  severity: 'critical' | 'warning' | 'suggestion';
  category: string;
  message: string;
  suggestion?: string;
}

interface ChangeIntent {
  file?: string;
  level: 'file' | 'block';
  intent: string;
  motivation: string;
  impact?: string;
}

interface CallStackInfo {
  function: string;
  file: string;
  flowchart?: string;
  sequence?: string;
}

interface ImpactAnalysis {
  scope: string;
  affectedAreas: string[];
  breakingChanges?: string[];
  sideEffects?: string[];
}

interface MovedCode {
  from: string;
  to: string;
  lines: number;
}

interface Refactoring {
  type: string;
  description: string;
  files: string[];
}

interface AIReviewResult {
  summary: string;
  criticalIssues: AIReviewComment[];
  warnings: AIReviewComment[];
  suggestions: AIReviewComment[];
  filesReviewed: number;
  totalIssues: number;
  // Enhanced sections
  changeIntents?: ChangeIntent[];
  callStacks?: CallStackInfo[];
  impactAnalysis?: ImpactAnalysis;
  movedCode?: MovedCode[];
  refactorings?: Refactoring[];
}

// Helper function to extract changed line numbers from a unified diff patch
function parseChangedLines(patch: string): Set<number> {
  const changedLines = new Set<number>();
  if (!patch) return changedLines;

  const lines = patch.split('\n');
  let currentLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+,?\d* \+(\d+)(?:,\d+)? @@/);
      if (match) {
        currentLine = parseInt(match[1], 10) - 1;
      }
    } else if (line.startsWith('+')) {
      currentLine++;
      changedLines.add(currentLine);
    } else if (line.startsWith('-')) {
      // Deletions don't increment modified line count for the purpose of highlighting existing lines
    } else {
      currentLine++;
    }
  }

  return changedLines;
}

export function ReviewPage({
  worktreePath,
  baseBranch = 'main',
  repoRoot,
  initialFilePath,
  commentInfo,
  aiReviewOptions,
  owner,
  repo,
  prNumber,
}: ReviewPageProps) {
  const { theme } = useTheme();
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [initialScrollPosition, setInitialScrollPosition] = useState<'top' | 'bottom'>('top');
  const [showChat, setShowChat] = useState(() => {
    const saved = localStorage.getItem('highreview-show-chat');
    return saved !== null ? saved === 'true' : true;
  });
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [aiReviewData, setAIReviewData] = useState<AIReviewResult | null>(null);
  const [aiReviewLoading, setAIReviewLoading] = useState(true); // Start with loading=true to show modal immediately
  const [aiReviewStep, setAIReviewStep] = useState<AIReviewStep>('cloning'); // Start with cloning
  const [chunkedReviewProgress, setChunkedReviewProgress] = useState<any>(null);

  // AbortController for cancelling AI review
  const aiReviewAbortController = useRef<AbortController | null>(null);

  // Panel sizes state (fractions: 0.15 = 15%, 0.50 = 50%, etc.)
  const [panelSizes, setPanelSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem('highreview-panel-sizes');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed;
      } catch (error) {
        console.error('[ReviewPage] Failed to parse saved panel sizes:', error);
      }
    }
    // Default sizes: File Tree (15%) | Editor (50%) | AI Review (20%) | Chat (20%)
    return [0.15, 0.50, 0.20, 0.20];
  });
  const [aiReviewMetadata, setAIReviewMetadata] = useState<{
    commitSha: string;
    options: any;
    timestamp: number;
    isOutdated: boolean;
  } | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [fileFilterMode, setFileFilterMode] = useState<'all' | 'changed'>('all');
  const [highlightLine, setHighlightLine] = useState<number | undefined>(undefined);
  const [highlightColumn, setHighlightColumn] = useState<number | undefined>(undefined);
  const [highlightKeyword, setHighlightKeyword] = useState<string | undefined>(undefined);
  const [pendingFunctionName, setPendingFunctionName] = useState<string | undefined>(undefined);
  const [navigationModal, setNavigationModal] = useState<{
    show: boolean;
    title: string;
    locations: Array<{ file: string; line: number; column: number; text: string }>;
  }>({
    show: false,
    title: '',
    locations: [],
  });
  const [showAIOptionsModal, setShowAIOptionsModal] = useState(false);
  const [highlightedAIReview, setHighlightedAIReview] = useState<{
    type: 'issue' | 'callstack';
    data: AIReviewComment | CallStackInfo;
  } | null>(null);
  const [prComments, setPRComments] = useState<any[]>([]);
  const [activeCommentThread, setActiveCommentThread] = useState<any | null>(null);
  const [searchModal, setSearchModal] = useState<{
    show: boolean;
    query: string;
    results: Array<{ file: string; line: number; column: number; text: string }>;
    loading: boolean;
    truncated: boolean;
  }>({
    show: false,
    query: '',
    results: [],
    loading: false,
    truncated: false,
  });
  const [showPRDetailsModal, setShowPRDetailsModal] = useState(false);

  // Helper functions
  const findFileInTree = useCallback((nodes: FileNode[], path: string): FileNode | null => {
    for (const node of nodes) {
      if (node.path === path && node.type === 'file') {
        return node;
      }
      if (node.type === 'directory' && node.children) {
        const found = findFileInTree(node.children, path);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const findFirstPRFileInTree = useCallback((nodes: FileNode[], changedSet: Set<string>): FileNode | null => {
    for (const node of nodes) {
      if (node.type === 'file' && changedSet.has(node.path)) {
        return node;
      }
      if (node.type === 'directory' && node.children) {
        const found = findFirstPRFileInTree(node.children, changedSet);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // Navigation history state
  const [navigationHistory, setNavigationHistory] = useState<FileNode[]>([]);
  const [navigationPointer, setNavigationPointer] = useState(-1);
  const isNavigatingHistory = useRef(false);

  // Get PR info from location state
  const prInfo = location.state as { owner?: string; repo?: string; prNumber?: string } | null;

  // Fetch PR data (changed files) - must be before useEffects that depend on it
  const { data: prData } = useQuery({
    queryKey: ['pr', prInfo?.owner, prInfo?.repo, prInfo?.prNumber],
    queryFn: async () => {
      if (!prInfo?.owner || !prInfo?.repo || !prInfo?.prNumber) {
        return null;
      }
      const response = await fetch(`/api/prs/${prInfo.owner}/${prInfo.repo}/${prInfo.prNumber}`);
      if (!response.ok) {
        throw new Error('Failed to fetch PR data');
      }
      const data = await response.json();
      return data;
    },
    enabled: !!prInfo?.owner && !!prInfo?.repo && !!prInfo?.prNumber,
  });

  // Fetch file tree
  const { data: treeData, isLoading: treeLoading } = useQuery({
    queryKey: ['fileTree', worktreePath],
    queryFn: async () => {
      const response = await fetch(`/api/fs/tree?path=${encodeURIComponent(worktreePath)}&maxDepth=20`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ReviewPage] File tree fetch failed:', errorText);
        throw new Error('Failed to fetch file tree');
      }
      const data = await response.json();
      return data;
    },
  });

  // Initialize pending review hook
  const {
    comments: pendingComments,
    addComment,
    submitReview,
    isSubmitting,
  } = usePendingReview(
    owner,
    repo,
    parseInt(prNumber || '0')
  );

  // Calculate effective repo root for Monaco model URIs
  const effectiveRepoRoot = repoRoot || worktreePath;

  // Initialize Monaco services and indexed provider on mount
  useEffect(() => {
    // Register indexed language provider
    registerIndexedProvider(worktreePath);

    return () => {
      disposeIndexedProvider();
    };
  }, [worktreePath]);



  // Save panel sizes to localStorage when they change
  useEffect(() => {
    localStorage.setItem('highreview-panel-sizes', JSON.stringify(panelSizes));
  }, [panelSizes]);

  // Persist showChat to localStorage
  useEffect(() => {
    localStorage.setItem('highreview-show-chat', String(showChat));
  }, [showChat]);

  // Force re-layout when panel visibility changes
  useEffect(() => {
    // Trigger a resize event to force panels to recalculate
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }, [showChat]);

  // Map AI review comments to files


  // Get all AI review issues (for passing to editors)
  const aiReviewIssues = useMemo(() => {
    if (!aiReviewData) return [];
    return [
      ...aiReviewData.criticalIssues,
      ...aiReviewData.warnings,
      ...aiReviewData.suggestions,
    ];
  }, [aiReviewData]);

  // Get all AI review call stacks (for passing to editors)
  const aiReviewCallStacks = useMemo(() => {
    if (!aiReviewData?.callStacks) return [];
    return aiReviewData.callStacks;
  }, [aiReviewData]);

  // REMOVED: Old comment decoration system for AI reviews
  // Now using dedicated AI review decoration system with severity colors
  // via aiReviewIssues and aiReviewCallStacks props
  const aiCommentDecorations = useMemo(() => {
    // Only return user comments, NOT AI review data
    // AI review data is handled by the new decoration system with severity colors
    return [];
  }, []);

  // Create Set of changed file paths from PR data
  const changedFilesSet = useMemo(() => {
    if (!prData?.files) return undefined as Set<string> | undefined;
    const set = new Set<string>(prData.files.map((f: any) => f.path));
    return set;
  }, [prData]);

  // Create Map of changed line numbers per file
  const changedLinesMap = useMemo(() => {
    if (!prData?.files) return {};
    const map: Record<string, Set<number>> = {};
    prData.files.forEach((file: any) => {
      if (file.patch) {
        map[file.path] = parseChangedLines(file.patch);
      }
    });
    return map;
  }, [prData]);

  // Create Map of file change statistics with comment counts
  const fileStatsMap = useMemo(() => {
    if (!prData?.files) return undefined;

    // Count comments per file (exclude resolved threads)
    const commentCountByFile = new Map<string, number>();
    prComments.forEach(thread => {
      // Skip resolved threads - they don't need to be shown in the file tree
      if (thread.isResolved) {
        return;
      }

      const currentCount = commentCountByFile.get(thread.file) || 0;
      commentCountByFile.set(thread.file, currentCount + thread.comments.length);
    });

    const map = new Map();
    prData.files.forEach((file: any) => {
      map.set(file.path, {
        additions: file.additions || 0,
        deletions: file.deletions || 0,
        status: file.status,
        commentCount: commentCountByFile.get(file.path) || 0,
      });
    });
    return map;
  }, [prData, prComments]);

  useEffect(() => {
    if (prData?.files && worktreePath && baseBranch && repoRoot) {
      const filesToLoad = prData.files.filter((f: any) => !f.filename.startsWith('.highreview'));
      loadPRFilesIntoMonaco(
        filesToLoad,
        repoRoot,
        worktreePath,
        baseBranch
      ).catch((error) => {
        console.error('[ReviewPage] Failed to load PR files into Monaco:', error);
      });
    }
  }, [prData, worktreePath, baseBranch, repoRoot]);

  // DISABLED: LSP indexing (now using Tree-sitter for code analysis)
  useEffect(() => {
    // LSP indexing disabled - no longer needed with Tree-sitter approach
    // Tree-sitter analyzes code on-demand without pre-indexing
    console.log('[ReviewPage] Skipping LSP indexing (using Tree-sitter instead)');
  }, [prData, prInfo, worktreePath, repoRoot, baseBranch]);

  // Auto-select file if initialFilePath is provided
  useEffect(() => {
    if (initialFilePath && treeData?.tree) {
      const fileNode = findFileInTree(treeData.tree, initialFilePath);
      if (fileNode) {
        setInitialScrollPosition('top');
        setSelectedFile(fileNode);
        // Auto-open chat panel and highlight line if there's comment info
        if (commentInfo) {
          console.log('[ReviewPage] Setting initial comment highlight:', {
            file: initialFilePath,
            line: commentInfo.line,
            originalLine: commentInfo.originalLine,
            position: commentInfo.position,
          });

          setShowChat(true);

          // For diff view: line = modified side, originalLine = original side
          // If line is null, comment is on deleted line (show on original side)
          // If originalLine is null, comment is on added line (show on modified side)
          // We'll pass commentInfo to DiffEditor so it can highlight the correct side
          if (commentInfo.line !== null && commentInfo.line !== undefined) {
            setHighlightLine(commentInfo.line);
          } else if (commentInfo.originalLine) {
            setHighlightLine(commentInfo.originalLine);
          }
        }
      }
    }
  }, [initialFilePath, treeData, commentInfo, findFileInTree]);

  // Default selection: select the first PR file based on tree order if none selected
  useEffect(() => {
    if (!selectedFile && !initialFilePath && treeData?.tree && changedFilesSet) {
      const firstPRFile = findFirstPRFileInTree(treeData.tree, changedFilesSet);
      if (firstPRFile) {
        console.log('[ReviewPage] Auto-selecting first PR file from tree:', firstPRFile.path);
        setInitialScrollPosition('top');
        setSelectedFile(firstPRFile);
      }
    }
  }, [treeData, changedFilesSet, selectedFile, initialFilePath, findFirstPRFileInTree]);

  // Determine if current file is a PR file (for showing diff vs code editor)
  const isPRFile = selectedFile && changedFilesSet?.has(selectedFile.path);

  // Fetch file content
  const { data: contentData, isLoading: contentLoading } = useQuery({
    queryKey: ['fileContent', selectedFile?.path, worktreePath],
    queryFn: async () => {
      if (!selectedFile) return null;
      const fullPath = `${worktreePath}/${selectedFile.path}`;
      const response = await fetch(`/api/fs/content?path=${encodeURIComponent(fullPath)}`);
      if (!response.ok) throw new Error('Failed to fetch file content');
      return response.json();
    },
    enabled: !!selectedFile && !isPRFile, // Only fetch for non-PR files
  });

  // Fetch diff
  const { data: diffData, isLoading: diffLoading, error: diffError } = useQuery({
    queryKey: ['fileDiff', selectedFile?.path, worktreePath, baseBranch, repoRoot, prInfo?.owner, prInfo?.repo, prInfo?.prNumber],
    queryFn: async () => {
      if (!selectedFile) return null;

      const params = new URLSearchParams({
        worktreePath,
        filePath: selectedFile.path,
        baseBranch: baseBranch,
        repoRoot: effectiveRepoRoot || '',
      });

      // Add GitHub PR info for fallback
      if (prInfo?.owner) params.append('owner', prInfo.owner);
      if (prInfo?.repo) params.append('repo', prInfo.repo);
      if (prInfo?.prNumber) params.append('prNumber', prInfo.prNumber.toString());
      if (prData?.pullRequest?.headBranch) params.append('headRef', prData.pullRequest.headBranch);

      const response = await fetch(`/api/fs/diff?${params.toString()}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ReviewPage] Diff fetch failed:', response.status, errorText);
        throw new Error(`Failed to fetch diff: ${response.status}`);
      }

      const data = await response.json();
      console.log('[ReviewPage] Diff data received:', {
        filePath: selectedFile.path,
        hasOriginal: !!data.original,
        originalLength: data.original?.length || 0,
        hasModified: !!data.modified,
        modifiedLength: data.modified?.length || 0,
        originalPreview: data.original?.substring(0, 100) || '(empty)',
        modifiedPreview: data.modified?.substring(0, 100) || '(empty)',
      });
      return data;
    },
    enabled: !!selectedFile && !!isPRFile, // Only fetch for PR files
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache
  });

  const handleFileClick = (node: FileNode) => {
    if (node.type === 'file') {
      setInitialScrollPosition('top');
      setSelectedFile(node);
    }
  };

  const handleNavigateNext = useCallback(() => {
    if (!prData?.files || !selectedFile) return;
    const files = prData.files;
    const currentIndex = files.findIndex((f: any) => f.path === selectedFile.path);
    if (currentIndex >= 0 && currentIndex < files.length - 1) {
      const nextFile = files[currentIndex + 1];
      setInitialScrollPosition('top');
      setSelectedFile({
        path: nextFile.path,
        name: nextFile.filename,
        type: 'file'
      });
    }
  }, [prData, selectedFile]);

  const handleNavigatePrev = useCallback(() => {
    if (!prData?.files || !selectedFile) return;
    const files = prData.files;
    const currentIndex = files.findIndex((f: any) => f.path === selectedFile.path);
    if (currentIndex > 0) {
      const prevFile = files[currentIndex - 1];
      setInitialScrollPosition('bottom');
      setSelectedFile({
        path: prevFile.path,
        name: prevFile.filename,
        type: 'file'
      });
    }
  }, [prData, selectedFile]);

  const handleGoBack = useCallback(() => {
    if (navigationPointer > 0) {
      isNavigatingHistory.current = true;
      const nextPointer = navigationPointer - 1;
      const fileNode = navigationHistory[nextPointer];
      setNavigationPointer(nextPointer);
      setSelectedFile(fileNode);
    }
  }, [navigationHistory, navigationPointer]);

  const handleGoForward = useCallback(() => {
    if (navigationPointer < navigationHistory.length - 1) {
      isNavigatingHistory.current = true;
      const nextPointer = navigationPointer + 1;
      const fileNode = navigationHistory[nextPointer];
      setNavigationPointer(nextPointer);
      setSelectedFile(fileNode);
    }
  }, [navigationHistory, navigationPointer]);

  // Track selected file changes for history
  useEffect(() => {
    if (!selectedFile) return;

    if (isNavigatingHistory.current) {
      isNavigatingHistory.current = false;
      return;
    }

    setNavigationHistory(prev => {
      // Don't add if it's the same as current
      if (navigationPointer >= 0 && prev[navigationPointer]?.path === selectedFile.path) {
        return prev;
      }

      // Add new and clear future history
      const newHistory = prev.slice(0, navigationPointer + 1);
      newHistory.push(selectedFile);
      setNavigationPointer(newHistory.length - 1);
      return newHistory;
    });
  }, [selectedFile, navigationPointer]);

  // Handle keyboard shortcuts for navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd + [ or Alt + Left for Back
      if ((e.metaKey && e.key === '[') || (e.altKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
        handleGoBack();
      }
      // Cmd + ] or Alt + Right for Forward
      if ((e.metaKey && e.key === ']') || (e.altKey && e.key === 'ArrowRight')) {
        e.preventDefault();
        handleGoForward();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleGoBack, handleGoForward]);


  const getLanguageFromFilename = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      json: 'json', html: 'html', css: 'css', scss: 'scss', sass: 'scss', less: 'less',
      md: 'markdown', markdown: 'markdown',
      py: 'python', go: 'go', rs: 'rust', java: 'java',
      cpp: 'cpp', cc: 'cpp', cxx: 'cpp', c: 'c', h: 'c',
      rb: 'ruby', sh: 'shell', bash: 'shell',
      php: 'php', swift: 'swift', kt: 'kotlin', scala: 'scala',
      sql: 'sql', xml: 'xml', yaml: 'yaml', yml: 'yaml',
      vue: 'vue',
    };
    return languageMap[ext || ''] || 'plaintext';
  };

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs-light';



  // Perform AI review on mount if PR info is available
  useEffect(() => {
    // Abort previous request if active
    if (aiReviewAbortController.current) {
      aiReviewAbortController.current.abort();
    }

    console.log('[ReviewPage] AI Review effect triggered:', {
      prInfo,
      worktreePath,
      repoRoot,
      baseBranch,
      language,
      aiReviewOptions,
    });

    const performAIReview = async () => {
      console.log('[ReviewPage] Checking conditions for AI review:', {
        hasOwner: !!prInfo?.owner,
        hasRepo: !!prInfo?.repo,
        hasPrNumber: !!prInfo?.prNumber,
        hasWorktreePath: !!worktreePath,
        hasRepoRoot: !!repoRoot,
        hasPrData: !!prData,
        prInfo,
      });

      // Keep loading state active until all conditions are met
      if (!prInfo?.owner || !prInfo?.repo || !prInfo?.prNumber || !worktreePath || !repoRoot) {
        return; // Keep loading, don't disable it
      }

      // Get current HEAD commit SHA from prData
      const currentHeadSha = prData?.pullRequest?.headRefOid;
      if (!currentHeadSha) {
        return; // Keep loading, wait for prData to load
      }

      // If we already have results for this commit and options, don't re-run
      if (aiReviewData && aiReviewMetadata?.commitSha === currentHeadSha) {
        console.log('[ReviewPage] AI Review already completed for this commit, skipping');
        setAIReviewLoading(false);
        setAIReviewStep('completed');
        return;
      }

      // All conditions met, perform AI review
      setAIReviewStep('preparing');
      setChunkedReviewProgress(null);

      // Create new AbortController for this review
      const abortController = new AbortController();
      aiReviewAbortController.current = abortController;

      try {
        // Brief delay to show "Preparing" step
        await new Promise(resolve => setTimeout(resolve, 500));
        if (abortController.signal.aborted) return;
        setAIReviewStep('analyzing');

        // Brief delay to show "Analyzing" step
        await new Promise(resolve => setTimeout(resolve, 500));
        if (abortController.signal.aborted) return;
        setAIReviewStep('thinking');

        // This is the long blocking call (2-5 minutes) - using streaming for progress updates
        const response = await fetch(
          `/api/prs/${prInfo.owner}/${prInfo.repo}/${prInfo.prNumber}/ai-review/stream`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              worktreePath,
              baseBranch,
              language,
              options: aiReviewOptions,
            }),
            signal: abortController.signal,
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[AI Review] API error:', response.status, errorText);
          throw new Error(`AI review failed: ${response.status}`);
        }

        // Handle streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalReview: any = null;

        if (!reader) {
          throw new Error('Failed to get stream reader');
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const dataLine = line.trim();
            if (!dataLine.startsWith('data: ')) continue;

            try {
              const data = JSON.parse(dataLine.substring(6));
              console.log('[AI Review Stream] Received event:', data.type || data.status);

              if (data.type === 'progress') {
                setChunkedReviewProgress({
                  currentChunk: data.currentChunk,
                  totalChunks: data.totalChunks,
                  currentFiles: data.currentFiles || [],
                  completedFiles: data.completedFiles || [],
                  status: data.status,
                });
                
                // Update overall step based on status if needed
                if (data.status === 'reviewing') setAIReviewStep('thinking');
                else if (data.status === 'summarizing') setAIReviewStep('summarizing');
                else if (data.status === 'merging') setAIReviewStep('finalizing');
              } else if (data.type === 'complete' || data.type === 'cached') {
                finalReview = data.review;
              } else if (data.type === 'metadata') {
                // Handle incremental metadata updates for large reviews
                if (finalReview) {
                  finalReview[data.field] = data.data;
                }
              } else if (data.type === 'error') {
                throw new Error(data.message || 'Stream processing error');
              }
            } catch (e) {
              console.error('[AI Review Stream] Failed to parse SSE data:', e, dataLine);
            }
          }
        }

        setAIReviewStep('finalizing');

        if (!finalReview) {
          throw new Error('No review result received from stream');
        }

        setAIReviewData(finalReview);

        // Set metadata
        setAIReviewMetadata({
          commitSha: currentHeadSha || '',
          options: aiReviewOptions,
          timestamp: Date.now(),
          isOutdated: false,
        });

        setAIReviewStep('completed');
      } catch (error: any) {
        if (abortController.signal.aborted) return;

        console.error('[AI Review] Failed to perform AI review:', error);
        const errorMessage = error?.message || 'Unknown error occurred';

        if (error?.name === 'AbortError' || errorMessage.includes('cancelled') || errorMessage.includes('aborted')) {
          toast('AI Review cancelled', { duration: 3000 });
        } else if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
          // Show different messages for timeout errors
          toast.error(
            'AI Review timed out. This PR may be too large. Try reducing AI review options or reviewing smaller changes.',
            { duration: 8000 }
          );
        } else if (errorMessage.includes('QUOTA_EXCEEDED:')) {
          // Handle quota exceeded errors with user-friendly message
          const cleanMessage = errorMessage.replace(/^.*QUOTA_EXCEEDED:\s*/, '');
          toast.error(
            `API Quota Exceeded\n\n${cleanMessage}\n\nPlease check your API billing or switch to a local provider (LM Studio, Ollama) in Settings.`,
            { 
              duration: 12000,  // Show longer for important message
              style: {
                whiteSpace: 'pre-line',  // Preserve line breaks
              }
            }
          );
        } else {
          toast.error(`AI Review failed: ${errorMessage}`, { duration: 6000 });
        }

        setAIReviewStep('preparing'); // Reset on error
      } finally {
        if (!abortController.signal.aborted) {
          setAIReviewLoading(false);
          aiReviewAbortController.current = null;
        }
      }
    };

    performAIReview();

    return () => {
      if (aiReviewAbortController.current) {
        console.log('[ReviewPage] Aborting ongoing AI review due to unmount/update');
        aiReviewAbortController.current.abort();
      }
    };
  }, [prInfo, worktreePath, repoRoot, baseBranch, language, aiReviewOptions, prData]);

  // Cancel AI review
  const handleCancelAIReview = () => {
    if (aiReviewAbortController.current) {
      aiReviewAbortController.current.abort();
      setAIReviewLoading(false);
      setAIReviewStep('preparing');
    }
  };

  // Cleanup worktree
  const handleCleanupWorktree = async () => {
    if (!prInfo?.owner || !prInfo?.repo || !prInfo?.prNumber) {
      toast.error('Missing PR information');
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to delete the cloned repository?\n\n' +
      'This will remove all local files and worktree for this PR. You will need to clone again to review.'
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `/api/prs/${prInfo.owner}/${prInfo.repo}/${prInfo.prNumber}/cleanup-review`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to cleanup worktree');
      }

      toast.success('Repository cleaned up successfully');

      // Optionally navigate back or refresh
      setTimeout(() => {
        window.history.back();
      }, 1000);
    } catch (error: any) {
      console.error('[Cleanup] Failed to cleanup worktree:', error);
      toast.error(`Cleanup failed: ${error.message}`);
    }
  };

  // Fetch PR comments and reviews
  useEffect(() => {
    const fetchPRComments = async () => {
      if (!prInfo?.owner || !prInfo?.repo || !prInfo?.prNumber) {
        return;
      }

      try {
        const response = await fetch(
          `/api/prs/${prInfo.owner}/${prInfo.repo}/${prInfo.prNumber}/conversation`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch PR comments');
        }

        const data = await response.json();

        // Process and organize comments by file and line
        const processedComments = processComments(data);

        setPRComments(processedComments);
      } catch (error) {
        console.error('[PR Comments] Error fetching comments:', error);
      } finally {
        // prCommentsLoading handled by hook or not needed here
      }
    };

    fetchPRComments();
  }, [prInfo]);



  // Helper function to process and organize comments
  const processComments = (data: any) => {
    const comments: any[] = [];
    const processedCommentIds = new Set<string>(); // Track processed comment IDs to avoid duplicates

    // Process review threads (these have file:line associations and full thread info)
    // This is the primary source of PR comments as it includes all thread information
    if (data.reviewThreads) {
      data.reviewThreads.forEach((thread: any) => {
        // GraphQL returns comments as { nodes: [...] }
        const threadComments = thread.comments?.nodes || [];

        if (threadComments.length > 0) {
          const firstComment = threadComments[0];

          // Use GitHub API's line field directly for line number
          // Skip comments on deleted lines (where line is null)
          const line = firstComment.line;
          if (!line) return;

          if (firstComment.path && line) {
            // Mark all comments in this thread as processed
            threadComments.forEach((c: any) => {
              if (c.id) processedCommentIds.add(c.id);
            });

            comments.push({
              id: thread.id,
              type: 'review_thread',
              file: firstComment.path,
              line: line,
              isResolved: thread.isResolved || false,
              diffHunk: firstComment.diffHunk, // Include diffHunk for rendering
              comments: threadComments.map((c: any) => ({
                id: c.id,
                author: c.author?.login || 'unknown',
                authorAvatar: c.author?.avatarUrl,
                body: c.body,
                createdAt: c.createdAt,
                reactions: c.reactions?.nodes || [],
              })),
            });
          } else {
            console.warn('[PR Comments] Skipping thread - no path or line:', firstComment);
          }
        }
      });
    }

    // Process timeline items - ONLY add comments that weren't already processed in review threads
    // This handles edge cases where comments might not be in threads (shouldn't normally happen)
    if (data.timelineItems) {
      data.timelineItems.forEach((item: any, index: number) => {
        // GraphQL returns comments as { nodes: [...] }
        const itemComments = item.comments?.nodes || [];

        console.log(`[ReviewPage] Processing timeline item ${index}:`, {
          typename: item.__typename,
          hasComments: !!item.comments,
          commentsCount: itemComments.length,
        });

        if (item.__typename === 'PullRequestReview' && itemComments.length > 0) {
          itemComments.forEach((comment: any) => {
            // Skip if this comment was already processed in review threads
            if (processedCommentIds.has(comment.id)) {
              return;
            }

            // Skip comments on deleted lines (where line is null)
            const line = comment.line;
            if (!line) return;

            if (comment.path && line) {
              processedCommentIds.add(comment.id);

              comments.push({
                id: comment.id,
                type: 'review_comment',
                file: comment.path,
                line: line,
                isResolved: false,
                diffHunk: comment.diffHunk, // Include diffHunk for rendering
                comments: [{
                  id: comment.id,
                  author: comment.author?.login || 'unknown',
                  authorAvatar: comment.author?.avatarUrl,
                  body: comment.body,
                  createdAt: comment.createdAt,
                  reactions: comment.reactions?.nodes || [],
                }],
              });
            } else {
              console.warn('[PR Comments] Skipping timeline comment - no path or line:', comment);
            }
          });
        }
      });
    }

    return comments;
  };

  const handleReRunAIReview = () => {
    setShowAIOptionsModal(true);
  };

  const handleStartReviewWithOptions = async (options: any) => {
    if (!prInfo?.owner || !prInfo?.repo || !prInfo?.prNumber) return;

    setShowAIOptionsModal(false);
    setAIReviewLoading(true);
    setAIReviewStep('preparing');
    setChunkedReviewProgress(null);

    try {
      // Brief delay to show "Preparing" step
      await new Promise(resolve => setTimeout(resolve, 500));
      setAIReviewStep('analyzing');

      // Brief delay to show "Analyzing" step
      await new Promise(resolve => setTimeout(resolve, 500));
      setAIReviewStep('thinking');

      // This is the long blocking call (2-5 minutes) - using streaming for progress updates
      const response = await fetch(
        `/api/prs/${prInfo.owner}/${prInfo.repo}/${prInfo.prNumber}/ai-review/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worktreePath,
            baseBranch,
            language,
            options: {
              ...options,
              forceRerun: true, // Force delete existing reviews and generate fresh results
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AI Review] Re-run API error:', response.status, errorText);
        throw new Error(`AI review failed: ${response.status} - ${errorText}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalReview: any = null;

      if (!reader) {
        throw new Error('Failed to get stream reader');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const dataLine = line.trim();
          if (!dataLine.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(dataLine.substring(6));
            if (data.type === 'progress') {
              setChunkedReviewProgress({
                currentChunk: data.currentChunk,
                totalChunks: data.totalChunks,
                currentFiles: data.currentFiles || [],
                completedFiles: data.completedFiles || [],
                status: data.status,
              });
              
              if (data.status === 'reviewing') setAIReviewStep('thinking');
              else if (data.status === 'summarizing') setAIReviewStep('summarizing');
              else if (data.status === 'merging') setAIReviewStep('finalizing');
            } else if (data.type === 'complete' || data.type === 'cached') {
              finalReview = data.review;
            } else if (data.type === 'metadata') {
              if (finalReview) finalReview[data.field] = data.data;
            } else if (data.type === 'error') {
              throw new Error(data.message || 'Stream processing error');
            }
          } catch (e) {
            console.error('[AI Review Stream] Failed to parse SSE data:', e, dataLine);
          }
        }
      }

      setAIReviewStep('finalizing');

      if (!finalReview) {
        throw new Error('No review result received from stream');
      }

      setAIReviewData(finalReview);

      // Get current HEAD commit SHA
      const currentHeadSha = prData?.pullRequest?.headRefOid;

      // Set metadata
      setAIReviewMetadata({
        commitSha: currentHeadSha || '',
        options: aiReviewOptions,
        timestamp: Date.now(),
        isOutdated: false,
      });

      setAIReviewStep('completed');
      toast.success('AI Review completed successfully!');
    } catch (error: any) {
      console.error('[AI Review] Failed to re-run AI review:', error);
      const errorMessage = error?.message || 'Unknown error occurred';

      // Show different messages for timeout errors
      if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
        toast.error(
          'AI Review timed out. This PR may be too large. Try reducing AI review options or reviewing smaller changes.',
          { duration: 8000 }
        );
      } else if (errorMessage.includes('QUOTA_EXCEEDED:')) {
        // Handle quota exceeded errors with user-friendly message
        const cleanMessage = errorMessage.replace(/^.*QUOTA_EXCEEDED:\s*/, '');
        toast.error(
          `API Quota Exceeded\n\n${cleanMessage}\n\nPlease check your API billing or switch to a local provider (LM Studio, Ollama) in Settings.`,
          { 
            duration: 12000, 
            style: { whiteSpace: 'pre-line' }
          }
        );
      } else {
        toast.error(`Failed to re-run AI Review: ${errorMessage}`, { duration: 6000 });
      }
      setAIReviewStep('preparing'); // Reset on error
    } finally {
      setAIReviewLoading(false);
    }
  };



  // Handler for AI review decoration clicks from editor glyph margin
  const handleAIReviewDecorationClick = useCallback((decoration: import('../utils/aiReviewDecorations').AIReviewDecoration) => {

    // Open AI Review panel if not already open
    // setShowAIReview(true); // Always true anyway

    // Set highlighted item
    setHighlightedAIReview({
      type: decoration.type,
      data: decoration.data,
    });

    // Trigger scroll/highlight in EnhancedAIReviewPanel
    // The panel will read the highlightedAIReview state and scroll to it
  }, []);

  const handleSubmitReview = async (
    event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES',
    body: string
  ) => {
    try {
      await submitReview(event, body);
      toast.success('Review submitted successfully!');
      setShowReviewModal(false);
      
      // Navigate back to PR detail page after successful submission
      navigate(`/prs/${owner}/${repo}/${prNumber}`);
    } catch (error) {
      console.error('[ReviewPage] Failed to submit review:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to submit review');
    }
  };



  // Code navigation handlers
  const handleShowReferences = useCallback(async (references: CodeReference[], title: string) => {
    // Convert CodeReference[] to locations format expected by modal
    const locations = await Promise.all(
      references.map(async (ref) => {
        // Extract file path from URI
        const uri = ref.uri;
        let filePath = uri;

        // Remove 'file://' prefix if present
        if (filePath.startsWith('file://')) {
          filePath = filePath.substring(7);
        }

        // Make path relative to worktree if possible
        if (filePath.startsWith(worktreePath)) {
          filePath = filePath.substring(worktreePath.length + 1);
        }

        // Fetch preview text (first 100 chars of the line)
        let previewText = `Line ${ref.range.startLineNumber}`;
        try {
          const fullPath = `${worktreePath}/${filePath}`;
          const response = await fetch(`/api/fs/content?path=${encodeURIComponent(fullPath)}`);
          if (response.ok) {
            const data = await response.json();
            const lines = data.content.split('\n');
            const lineIndex = ref.range.startLineNumber - 1;
            if (lineIndex >= 0 && lineIndex < lines.length) {
              previewText = lines[lineIndex].trim().substring(0, 100);
            }
          }
        } catch (error) {
          console.error('[ReviewPage] Failed to fetch preview:', error);
        }

        return {
          file: filePath,
          line: ref.range.startLineNumber,
          column: ref.range.startColumn,
          text: previewText,
        };
      })
    );

    setNavigationModal({
      show: true,
      title,
      locations,
    });
  }, [worktreePath]);

  // Handle "Find in Project" search
  const handleSearchInProject = useCallback(async (query: string, currentFile: string, currentLine: number) => {
    if (!prInfo) return;

    // Extract file path from URI (remove file:// prefix and worktree path)
    let currentFilePath = currentFile.replace('file://', '');
    if (currentFilePath.startsWith(worktreePath + '/')) {
      currentFilePath = currentFilePath.substring(worktreePath.length + 1);
    }


    // Show loading state
    setSearchModal({
      show: true,
      query,
      results: [],
      loading: true,
      truncated: false,
    });

    try {
      const response = await fetch(
        `/api/prs/${prInfo.owner}/${prInfo.repo}/${prInfo.prNumber}/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            caseSensitive: false,
            wholeWord: true, // Match whole words only
            excludeFile: currentFilePath, // Exclude current file from results
            excludeLine: currentLine, // Exclude current line from results
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();

      console.log('[ReviewPage] Search results received:', {
        query,
        resultCount: data.resultCount,
        truncated: data.truncated,
      });

      setSearchModal({
        show: true,
        query,
        results: data.results || [],
        loading: false,
        truncated: data.truncated || false,
      });
    } catch (error) {
      console.error('[ReviewPage] Search failed:', error);
      toast.error('Failed to search in project');
      setSearchModal({
        show: false,
        query: '',
        results: [],
        loading: false,
        truncated: false,
      });
    }
  }, [prInfo]);

  const handleNavigateToLocation = useCallback((uri: string, line: number, column: number, keyword?: string) => {
    // Extract file path from URI
    let filePath = uri;

    if (filePath.startsWith('file://')) {
      filePath = filePath.substring(7);
    }

    if (filePath.startsWith(worktreePath)) {
      filePath = filePath.substring(worktreePath.length + 1);
    }

    console.log('[ReviewPage] Navigating to location:', { filePath, line, column, keyword });

    // Find the file in the tree and select it
    if (treeData?.tree) {
      const fileNode = findFileInTree(treeData.tree, filePath);
      if (fileNode) {
        setInitialScrollPosition('top');
        setSelectedFile(fileNode);
        setHighlightLine(line); // Highlight the target line
        setHighlightColumn(column); // Set the target column for cursor positioning
        setHighlightKeyword(keyword); // Set keyword for highlighting
        console.log('[ReviewPage] File found, highlighting:', { line, column, keyword });
      } else {
        console.warn(`[ReviewPage] File not found in tree: ${filePath}`);
      }
    }
  }, [worktreePath, treeData, findFileInTree]);

  const handleLocationClick = useCallback((location: { file: string; line: number; column: number; text: string }) => {
    handleNavigateToLocation(`file://${worktreePath}/${location.file}`, location.line, location.column);
  }, [worktreePath, handleNavigateToLocation]);

  // Handle file selection from AI Review panel
  const handleFileSelect = useCallback((file: string, line?: number, functionName?: string) => {
    if (!treeData?.tree) return;

    const fileNode = findFileInTree(treeData.tree, file);
    if (fileNode) {
      setInitialScrollPosition('top');
      setSelectedFile(fileNode);
      setHighlightLine(line);
      setPendingFunctionName(functionName);

      if (line) {
      } else if (functionName) {
      }
    }
  }, [treeData, findFileInTree]);

  // Find function line when pending function name is set and file content is loaded
  useEffect(() => {
    if (!pendingFunctionName || !selectedFile) return;

    // Get file content from either contentData or diffData
    let fileContent: string | undefined;

    if (contentData?.content) {
      fileContent = contentData.content;
    } else if (diffData?.modified) {
      fileContent = diffData.modified;
    }

    if (fileContent) {
      const functionLines = detectFunctionLines(fileContent, pendingFunctionName);

      if (functionLines.length > 0) {
        const targetLine = functionLines[0];
        setHighlightLine(targetLine);
      } else {
        console.warn(`[ReviewPage] Function "${pendingFunctionName}" not found in ${selectedFile.path}`);
      }

      // Clear pending function name after processing
      setPendingFunctionName(undefined);
    }
  }, [pendingFunctionName, selectedFile, contentData, diffData]);

  // Reset highlight line when file changes (unless it's set by handleFileSelect)
  useEffect(() => {
    // Reset after 2 seconds to give editor time to load and scroll
    const timer = setTimeout(() => {
      setHighlightLine(undefined);
    }, 2000);
    return () => clearTimeout(timer);
  }, [selectedFile]);

  // Handle adding comments to the review
  const handleAddComment = useCallback((line: number, body: string) => {
    if (selectedFile) {
      addComment(selectedFile.path, line, body);
      toast.success('Comment added to review');
    }
  }, [selectedFile, addComment]);

  // PR Comment handlers


  const handleReply = useCallback(async (threadId: string, body: string) => {
    if (!prInfo?.owner || !prInfo?.repo || !prInfo?.prNumber) return;

    try {

      // Extract comment ID from thread (first comment in thread)
      const firstCommentId = activeCommentThread?.comments[0]?.id;
      if (!firstCommentId) {
        throw new Error('Cannot find comment ID for reply');
      }

      const response = await fetch(
        `/api/prs/${prInfo.owner}/${prInfo.repo}/${prInfo.prNumber}/comment-reply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body,
            inReplyTo: parseInt(firstCommentId.split('_')[1] || firstCommentId),
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to add reply');
      }

      toast.success('Reply added successfully');

      // Refresh comments
      const commentsResponse = await fetch(
        `/api/prs/${prInfo.owner}/${prInfo.repo}/${prInfo.prNumber}/conversation`
      );
      const data = await commentsResponse.json();
      const processed = processComments(data);
      setPRComments(processed);

      // Update active thread
      const updatedThread = processed.find((t: any) => t.id === threadId);
      if (updatedThread) {
        setActiveCommentThread(updatedThread);
      }
    } catch (error: any) {
      console.error('[ReviewPage] Error adding reply:', error);
      toast.error(`Failed to add reply: ${error.message}`);
    }
  }, [prInfo, activeCommentThread]);

  const handleReact = useCallback(async (commentId: string, reaction: string) => {
    if (!prInfo?.owner || !prInfo?.repo) return;

    try {

      const response = await fetch(
        `/api/prs/${prInfo.owner}/${prInfo.repo}/reactions/add`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commentId: parseInt(commentId.split('_')[1] || commentId),
            reaction,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to add reaction');
      }

      toast.success('Reaction added');

      // Refresh comments
      if (prInfo.prNumber) {
        const commentsResponse = await fetch(
          `/api/prs/${prInfo.owner}/${prInfo.repo}/${prInfo.prNumber}/conversation`
        );
        const data = await commentsResponse.json();
        const processed = processComments(data);
        setPRComments(processed);

        // Update active thread
        if (activeCommentThread) {
          const updatedThread = processed.find((t: any) => t.id === activeCommentThread.id);
          if (updatedThread) {
            setActiveCommentThread(updatedThread);
          }
        }
      }
    } catch (error: any) {
      console.error('[ReviewPage] Error adding reaction:', error);
      toast.error(`Failed to add reaction: ${error.message}`);
    }
  }, [prInfo, activeCommentThread]);

  // Filter comments for current file
  const currentFileComments = useMemo(() => {
    if (!selectedFile) return [];
    return prComments.filter((c: any) => c.file === selectedFile.path);
  }, [prComments, selectedFile]);

  return (
    <div className="h-screen flex flex-col bg-light-bg dark:bg-dark-bg relative">
      {/* Full Screen Loading Spinner */}
      {(treeLoading || aiReviewLoading) && (
        <div className="absolute inset-0 bg-gradient-to-br from-light-bg/95 via-light-bg/90 to-light-bg/95 dark:from-dark-bg/95 dark:via-dark-bg/90 dark:to-dark-bg/95 backdrop-blur-md z-50 flex items-center justify-center">
          <div className="relative max-w-3xl w-full mx-4">
            {/* Gradient border wrapper with animation */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-light-accent-primary via-light-accent-secondary to-light-accent-primary dark:from-dark-accent-primary dark:via-dark-accent-secondary dark:to-dark-accent-primary opacity-75 blur-xl animate-pulse"></div>
            {/* Static content with enhanced styling */}
            <div className="relative flex flex-col items-center gap-6 p-10 bg-light-surface/95 dark:bg-dark-surface/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-light-border/50 dark:border-dark-border/50">
            <div className="relative">
              {/* Outer glow ring */}
              <div className="absolute inset-0 w-20 h-20 bg-gradient-to-r from-light-accent-primary to-light-accent-secondary dark:from-dark-accent-primary dark:to-dark-accent-secondary rounded-full opacity-20 blur-2xl animate-pulse"></div>
              {/* Outer pulsing ring */}
              <div className="absolute inset-0 w-20 h-20 border-4 border-light-accent-primary/30 dark:border-dark-accent-primary/30 rounded-full animate-ping"></div>
              {/* Middle rotating ring */}
              <div className="absolute inset-0 w-20 h-20 border-4 border-light-accent-primary/50 dark:border-dark-accent-primary/50 rounded-full animate-pulse"></div>
              {/* Inner spinning ring - gradient */}
              <div className="w-20 h-20 rounded-full bg-gradient-to-r from-transparent via-light-accent-primary to-transparent dark:via-dark-accent-primary border-4 border-transparent animate-spin" style={{
                backgroundImage: `conic-gradient(from 0deg, transparent, var(--accent-primary), transparent)`
              }}></div>
              {/* Center dot with pulse */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-gradient-to-r from-light-accent-primary to-light-accent-secondary dark:from-dark-accent-primary dark:to-dark-accent-secondary rounded-full animate-pulse shadow-lg"></div>
            </div>
            <div className="text-center w-full">
              <p className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary mb-2 tracking-tight">
                {treeLoading ? 'Loading file tree...' : 'Running AI Review...'}
              </p>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-6">
                {treeLoading ? 'Please wait while we scan the project files' : 'Analyzing code and generating insights'}
              </p>

              {aiReviewLoading && aiReviewStep && (
                <div className="mt-8 space-y-4 text-left bg-light-surface-elevated/50 dark:bg-dark-surface-elevated/50 rounded-xl p-5 border border-light-border/30 dark:border-dark-border/30">
                  {/* Step 0: Cloning repository */}
                  <div className={`flex items-start gap-3 transition-all duration-300 ${
                    aiReviewStep === 'cloning' ? 'opacity-100 scale-105' :
                    ['checkout', 'indexing', 'loading', 'preparing', 'collecting', 'analyzing', 'thinking', 'generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? 'opacity-100' : 'opacity-40'
                  }`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {['checkout', 'indexing', 'loading', 'preparing', 'collecting', 'analyzing', 'thinking', 'generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center shadow-md">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : aiReviewStep === 'cloning' ? (
                        <div className="w-5 h-5 border-2 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin shadow-sm" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-light-border dark:border-dark-border" />
                      )}
                    </div>
                    <div className="flex-1">
                      <span className={`text-sm font-semibold ${
                        aiReviewStep === 'cloning' ? 'text-light-accent-primary dark:text-dark-accent-primary' :
                        ['checkout', 'indexing', 'loading', 'preparing', 'collecting', 'analyzing', 'thinking', 'generating', 'finalizing', 'completed'].includes(aiReviewStep) ? 'text-green-600 dark:text-green-400' :
                        'text-light-text-secondary dark:text-dark-text-secondary'
                      }`}>
                        Cloning repository
                      </span>
                      {aiReviewStep === 'cloning' && (
                        <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
                          Fetching repository from GitHub...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Step 1: Checking out PR */}
                  <div className={`flex items-start gap-3 transition-all duration-300 ${
                    aiReviewStep === 'checkout' ? 'opacity-100 scale-105' :
                    ['indexing', 'loading', 'preparing', 'collecting', 'analyzing', 'thinking', 'generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? 'opacity-100' : 'opacity-40'
                  }`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {['indexing', 'loading', 'preparing', 'collecting', 'analyzing', 'thinking', 'generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center shadow-md">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : aiReviewStep === 'checkout' ? (
                        <div className="w-5 h-5 border-2 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin shadow-sm" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-light-border dark:border-dark-border" />
                      )}
                    </div>
                    <div className="flex-1">
                      <span className={`text-sm font-semibold ${
                        aiReviewStep === 'checkout' ? 'text-light-accent-primary dark:text-dark-accent-primary' :
                        ['indexing', 'loading', 'preparing', 'collecting', 'analyzing', 'thinking', 'generating', 'finalizing', 'completed'].includes(aiReviewStep) ? 'text-green-600 dark:text-green-400' :
                        'text-light-text-secondary dark:text-dark-text-secondary'
                      }`}>
                        Checking out PR
                      </span>
                      {aiReviewStep === 'checkout' && (
                        <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
                          Creating worktree for PR branch...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Step 2: Indexing */}
                  <div className={`flex items-start gap-3 transition-all duration-300 ${
                    aiReviewStep === 'indexing' ? 'opacity-100 scale-105' :
                    ['loading', 'preparing', 'collecting', 'analyzing', 'thinking', 'generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? 'opacity-100' : 'opacity-40'
                  }`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {['loading', 'preparing', 'collecting', 'analyzing', 'thinking', 'generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center shadow-md">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : aiReviewStep === 'indexing' ? (
                        <div className="w-5 h-5 border-2 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin shadow-sm" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-light-border dark:border-dark-border" />
                      )}
                    </div>
                    <div className="flex-1">
                      <span className={`text-sm font-semibold ${
                        aiReviewStep === 'indexing' ? 'text-light-accent-primary dark:text-dark-accent-primary' :
                        ['loading', 'preparing', 'collecting', 'analyzing', 'thinking', 'generating', 'finalizing', 'completed'].includes(aiReviewStep) ? 'text-green-600 dark:text-green-400' :
                        'text-light-text-secondary dark:text-dark-text-secondary'
                      }`}>
                        Indexing files
                      </span>
                      {aiReviewStep === 'indexing' && (
                        <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
                          Scanning project structure...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Step 1: Loading */}
                  <div className={`flex items-start gap-3 transition-all duration-300 ${
                    aiReviewStep === 'loading' ? 'opacity-100 scale-105' :
                    ['preparing', 'collecting', 'analyzing', 'thinking', 'generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? 'opacity-100' : 'opacity-40'
                  }`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {['preparing', 'collecting', 'analyzing', 'thinking', 'generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center shadow-md">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : aiReviewStep === 'loading' ? (
                        <div className="w-5 h-5 border-2 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin shadow-sm" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-light-border dark:border-dark-border" />
                      )}
                    </div>
                    <div className="flex-1">
                      <span className={`text-sm font-semibold ${
                        aiReviewStep === 'loading' ? 'text-light-accent-primary dark:text-dark-accent-primary' :
                        ['preparing', 'collecting', 'analyzing', 'thinking', 'generating', 'finalizing', 'completed'].includes(aiReviewStep) ? 'text-green-600 dark:text-green-400' :
                        'text-light-text-secondary dark:text-dark-text-secondary'
                      }`}>
                        Loading repository
                      </span>
                      {aiReviewStep === 'loading' && (
                        <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
                          Reading changed files...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Step 2: Preparing */}
                  <div className={`flex items-start gap-3 transition-all duration-300 ${
                    aiReviewStep === 'preparing' ? 'opacity-100 scale-105' :
                    ['collecting', 'analyzing', 'thinking', 'generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? 'opacity-100' : 'opacity-40'
                  }`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {['collecting', 'analyzing', 'thinking', 'generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center shadow-md">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : aiReviewStep === 'preparing' ? (
                        <div className="w-5 h-5 border-2 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin shadow-sm" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-light-border dark:border-dark-border" />
                      )}
                    </div>
                    <div className="flex-1">
                      <span className={`text-sm font-semibold ${
                        aiReviewStep === 'preparing' ? 'text-light-accent-primary dark:text-dark-accent-primary' :
                        ['collecting', 'analyzing', 'thinking', 'generating', 'finalizing', 'completed'].includes(aiReviewStep) ? 'text-green-600 dark:text-green-400' :
                        'text-light-text-secondary dark:text-dark-text-secondary'
                      }`}>
                        Preparing review
                      </span>
                      {aiReviewStep === 'preparing' && (
                        <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
                          Setting up analysis environment...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Step 3: Collecting context */}
                  <div className={`flex items-start gap-3 transition-all duration-300 ${
                    aiReviewStep === 'collecting' ? 'opacity-100 scale-105' :
                    ['analyzing', 'thinking', 'generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? 'opacity-100' : 'opacity-40'
                  }`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {['analyzing', 'thinking', 'generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center shadow-md">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : aiReviewStep === 'collecting' ? (
                        <div className="w-5 h-5 border-2 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin shadow-sm" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-light-border dark:border-dark-border" />
                      )}
                    </div>
                    <div className="flex-1">
                      <span className={`text-sm font-semibold ${
                        aiReviewStep === 'collecting' ? 'text-light-accent-primary dark:text-dark-accent-primary' :
                        ['analyzing', 'thinking', 'generating', 'finalizing', 'completed'].includes(aiReviewStep) ? 'text-green-600 dark:text-green-400' :
                        'text-light-text-secondary dark:text-dark-text-secondary'
                      }`}>
                        Collecting context
                      </span>
                      {aiReviewStep === 'collecting' && (
                        <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
                          Gathering related code context...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Step 4: Analyzing */}
                  <div className={`flex items-start gap-3 transition-all duration-300 ${
                    aiReviewStep === 'analyzing' ? 'opacity-100 scale-105' :
                    ['thinking', 'generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? 'opacity-100' : 'opacity-40'
                  }`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {['thinking', 'generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center shadow-md">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : aiReviewStep === 'analyzing' ? (
                        <div className="w-5 h-5 border-2 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin shadow-sm" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-light-border dark:border-dark-border" />
                      )}
                    </div>
                    <div className="flex-1">
                      <span className={`text-sm font-semibold ${
                        aiReviewStep === 'analyzing' ? 'text-light-accent-primary dark:text-dark-accent-primary' :
                        ['thinking', 'generating', 'finalizing', 'completed'].includes(aiReviewStep) ? 'text-green-600 dark:text-green-400' :
                        'text-light-text-secondary dark:text-dark-text-secondary'
                      }`}>
                        Analyzing changes
                      </span>
                      {aiReviewStep === 'analyzing' && (
                        <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
                          Detecting patterns and issues...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Step 5: Thinking */}
                  <div className={`flex items-start gap-3 transition-all duration-300 ${
                    aiReviewStep === 'thinking' ? 'opacity-100 scale-105' :
                    ['generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? 'opacity-100' : 'opacity-40'
                  }`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {['generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center shadow-md">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : aiReviewStep === 'thinking' ? (
                        <div className="w-5 h-5 border-2 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin shadow-sm" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-light-border dark:border-dark-border" />
                      )}
                    </div>
                    <div className="flex-1">
                      <span className={`text-sm font-semibold ${
                        aiReviewStep === 'thinking' ? 'text-light-accent-primary dark:text-dark-accent-primary' :
                        ['generating', 'summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? 'text-green-600 dark:text-green-400' :
                        'text-light-text-secondary dark:text-dark-text-secondary'
                      }`}>
                        AI is reviewing
                      </span>
                      {aiReviewStep === 'thinking' && (
                        <div className="mt-1.5 space-y-1.5">
                          <p className="text-xs text-light-text-muted dark:text-dark-text-muted flex items-center justify-between">
                            <span>Deep analysis in progress...</span>
                            {chunkedReviewProgress && chunkedReviewProgress.totalChunks > 0 && (
                              <span className="text-[10px] font-mono bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 px-1.5 py-0.5 rounded text-light-accent-primary dark:text-dark-accent-primary">
                                Chunk {chunkedReviewProgress.currentChunk}/{chunkedReviewProgress.totalChunks} ({Math.round((chunkedReviewProgress.currentChunk / chunkedReviewProgress.totalChunks) * 100)}%)
                              </span>
                            )}
                          </p>
                          {chunkedReviewProgress && chunkedReviewProgress.currentFiles && chunkedReviewProgress.currentFiles.length > 0 && (
                            <div className="flex items-start gap-1.5 px-2 py-1.5 bg-light-bg/50 dark:bg-dark-bg/50 rounded border border-light-border/20 dark:border-dark-border/20">
                              <div className="mt-1 w-1.5 h-1.5 rounded-full bg-light-accent-primary dark:bg-dark-accent-primary animate-pulse flex-shrink-0" />
                              <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary leading-relaxed line-clamp-2 break-all">
                                <span className="font-medium opacity-70">Analyzing: </span>
                                {chunkedReviewProgress.currentFiles.join(', ')}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 6: Generating */}
                  <div className={`flex items-start gap-3 transition-all duration-300 ${
                    aiReviewStep === 'generating' ? 'opacity-100 scale-105' :
                    ['summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? 'opacity-100' : 'opacity-40'
                  }`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {['finalizing', 'completed'].includes(aiReviewStep) ? (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center shadow-md">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : (aiReviewStep === 'generating' || aiReviewStep === 'summarizing') ? (
                        <div className="w-5 h-5 border-2 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin shadow-sm" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-light-border dark:border-dark-border" />
                      )}
                    </div>
                    <div className="flex-1">
                      <span className={`text-sm font-semibold ${
                        aiReviewStep === 'generating' ? 'text-light-accent-primary dark:text-dark-accent-primary' :
                        ['summarizing', 'finalizing', 'completed'].includes(aiReviewStep) ? 'text-green-600 dark:text-green-400' :
                        'text-light-text-secondary dark:text-dark-text-secondary'
                      }`}>
                        Generating insights
                      </span>
                      {aiReviewStep === 'generating' && (
                        <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
                          Creating review summary...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Step 7: Finalizing */}
                  <div className={`flex items-start gap-3 transition-all duration-300 ${
                    aiReviewStep === 'finalizing' ? 'opacity-100 scale-105' :
                    aiReviewStep === 'completed' ? 'opacity-100' : 'opacity-40'
                  }`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {['completed'].includes(aiReviewStep) ? (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center shadow-md">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : aiReviewStep === 'finalizing' ? (
                        <div className="w-5 h-5 border-2 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin shadow-sm" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-light-border dark:border-dark-border" />
                      )}
                    </div>
                    <div className="flex-1">
                      <span className={`text-sm font-semibold ${
                        aiReviewStep === 'finalizing' ? 'text-light-accent-primary dark:text-dark-accent-primary' :
                        aiReviewStep === 'completed' ? 'text-green-600 dark:text-green-400' :
                        'text-light-text-secondary dark:text-dark-text-secondary'
                      }`}>
                        Finalizing
                      </span>
                      {aiReviewStep === 'finalizing' && (
                        <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
                          Wrapping up review...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Cancel Button */}
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={handleCancelAIReview}
                      className="px-6 py-2.5 bg-light-accent-error/10 dark:bg-dark-accent-error/10
                               text-light-accent-error dark:text-dark-accent-error
                               border border-light-accent-error/30 dark:border-dark-accent-error/30
                               rounded-lg font-medium hover:bg-light-accent-error/20 dark:hover:bg-dark-accent-error/20
                               transition-all duration-200 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Cancel Review
                    </button>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar - VS Code style */}
      <div className="border-b border-[#e5e5e5] dark:border-[#333333] bg-[#f3f3f3] dark:bg-[#252526] px-4 py-2.5">
        <div className="flex items-start gap-4">
          {/* Left Section: PR Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 mb-2">
              <button
                onClick={() => window.history.back()}
                className="p-1.5 rounded hover:bg-[#e0e0e0] dark:hover:bg-[#2d2d30]
                         text-[#424242] dark:text-[#cccccc] transition-colors flex-shrink-0"
                title="Go back"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>

              <div className="w-px h-4 bg-[#d1d1d1] dark:bg-[#454545] mx-0.5" />

              <div className="flex items-center gap-0.5">
                <button
                  onClick={handleGoBack}
                  disabled={navigationPointer <= 0}
                  className={`p-1.5 rounded transition-colors ${
                    navigationPointer > 0 
                      ? 'hover:bg-[#e0e0e0] dark:hover:bg-[#2d2d30] text-[#424242] dark:text-[#cccccc]' 
                      : 'text-[#424242]/30 dark:text-[#cccccc]/30 cursor-not-allowed'
                  }`}
                  title="Go back (Cmd + [)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={handleGoForward}
                  disabled={navigationPointer >= navigationHistory.length - 1}
                  className={`p-1.5 rounded transition-colors ${
                    navigationPointer < navigationHistory.length - 1
                      ? 'hover:bg-[#e0e0e0] dark:hover:bg-[#2d2d30] text-[#424242] dark:text-[#cccccc]' 
                      : 'text-[#424242]/30 dark:text-[#cccccc]/30 cursor-not-allowed'
                  }`}
                  title="Go forward (Cmd + ])"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <div className="w-px h-4 bg-[#d1d1d1] dark:bg-[#454545] mx-0.5" />

              {/* PR Info: Number, State, AI Reviewed Badge */}
              {prData?.pullRequest && prInfo && (
                <>
                  {/* Repository Name */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#f0f7ff] dark:bg-[#1a2b3e] rounded border border-[#007acc]/30 dark:border-[#007acc]/50">
                    <svg className="w-3.5 h-3.5 text-[#007acc] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="text-xs font-bold text-[#007acc] dark:text-[#40a9ff]">
                      {repo}
                    </span>
                  </div>

                  <button
                    onClick={() => setShowPRDetailsModal(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-[#2d2d30] rounded border border-[#d1d1d1] dark:border-[#454545] hover:border-[#007acc] transition-all"
                    title="View PR Details"
                  >
                    <svg className="w-3.5 h-3.5 text-[#007acc] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    <span className="text-xs font-medium text-[#424242] dark:text-[#cccccc]">
                      #{prInfo.prNumber}
                    </span>
                  </button>

                  {/* PR Title */}
                  <button
                    onClick={() => setShowPRDetailsModal(true)}
                    className="text-sm font-semibold text-[#424242] dark:text-[#cccccc] truncate max-w-md hover:text-[#007acc] transition-all text-left"
                    title="View PR Details"
                  >
                    {prData.pullRequest.title}
                  </button>

                  <span className="text-[#8c8c8c]">•</span>

                  {/* PR State Badge */}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${
                      prData.pullRequest.state === 'OPEN'
                        ? 'bg-[#28a745] text-white'
                        : prData.pullRequest.state === 'MERGED'
                        ? 'bg-[#6f42c1] text-white'
                        : 'bg-[#dc3545] text-white'
                    }`}
                  >
                    {prData.pullRequest.state === 'OPEN' ? 'Open' : prData.pullRequest.state === 'MERGED' ? 'Merged' : 'Closed'}
                  </span>

                  {/* AI Reviewed Badge */}
                  {aiReviewData && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-[#6f42c1] text-white" title="AI Review completed">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M13 7H7v6h6V7z" />
                        <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd" />
                      </svg>
                      AI
                    </span>
                  )}

                  {/* Author */}
                  {prData.pullRequest.author && (
                    <>
                      <span className="text-[#8c8c8c]">•</span>
                      <div className="flex items-center gap-1 text-xs text-[#6c757d] dark:text-[#8c8c8c]">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                        <span>{prData.pullRequest.author}</span>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right Section: Action Buttons - VS Code style */}
          <div className="flex flex-shrink-0 items-center gap-1.5">
            {prData?.pullRequest && (
              <a
                href={prData.pullRequest.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[#d1d1d1] dark:border-[#454545] bg-white dark:bg-[#2d2d30] text-[#424242] dark:text-[#cccccc] hover:bg-[#f0f0f0] dark:hover:bg-[#3a3a3d] transition-colors"
                title="View on GitHub"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
                </svg>
                GitHub
              </a>
            )}
            <button
              onClick={() => setShowChat(!showChat)}
              className="px-3 py-1.5 text-xs font-medium rounded border border-[#d1d1d1] dark:border-[#454545] bg-white dark:bg-[#2d2d30] text-[#424242] dark:text-[#cccccc] hover:bg-[#f0f0f0] dark:hover:bg-[#3a3a3d] transition-colors whitespace-nowrap"
            >
              {showChat ? 'Hide' : 'Show'} Chat
            </button>
            {prInfo && (
              <>
                <button
                  onClick={handleReRunAIReview}
                  disabled={aiReviewLoading}
                  className="px-3 py-1.5 text-xs font-medium rounded border flex items-center gap-1.5
                           border-[#007acc] bg-[#007acc] text-white
                           hover:bg-[#005a9e] hover:border-[#005a9e]
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  title={aiReviewData ? "Re-run AI Review" : "Start AI Review"}
                >
                  <svg className={`w-3.5 h-3.5 ${aiReviewLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {aiReviewLoading ? 'Running' : aiReviewData ? 'Re-run' : 'AI Review'}
                </button>
                <button
                  onClick={() => setShowReviewModal(true)}
                  className="px-3 py-1.5 text-xs font-medium rounded border flex items-center gap-1.5
                           border-[#28a745] bg-[#28a745] text-white
                           hover:bg-[#218838] hover:border-[#218838] transition-colors whitespace-nowrap"
                  title="Submit your review to GitHub"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Submit
                  {pendingComments.length > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-white/30">
                      {pendingComments.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={handleCleanupWorktree}
                  disabled={!worktreePath}
                  className="px-3 py-1.5 text-xs font-medium rounded border flex items-center gap-1.5
                           border-[#dc3545] bg-[#dc3545] text-white
                           hover:bg-[#c82333] hover:border-[#c82333]
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  title="Delete cloned repository and cleanup resources"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Cleanup
                </button>
              </>
            )}
            <LanguageSelector />
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* 3-panel resizable layout: File Tree | Editor | Side Panels */}
        <Allotment
            key={`unified-${showChat}-${!!aiReviewData}`}
            className="h-full"
            defaultSizes={panelSizes}
            onChange={(sizes) => {
              if (sizes && sizes.length > 0) {
                setPanelSizes(sizes);
              }
            }}
          >
            {/* File Tree Panel - 15% */}
            <Allotment.Pane
              minSize={200}
              maxSize={600}
              className="bg-[#f3f3f3] dark:bg-[#252526]"
            >
              {treeLoading ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-sm text-light-text-muted dark:text-dark-text-muted">
                    Loading files...
                  </span>
                </div>
              ) : treeData?.tree ? (
                <FileTree
                  nodes={treeData.tree}
                  onFileClick={handleFileClick}
                  selectedPath={selectedFile?.path}
                  changedFiles={changedFilesSet}
                  fileStats={fileStatsMap}
                  filterMode={fileFilterMode}
                  onFilterChange={setFileFilterMode}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <span className="text-sm text-light-text-muted dark:text-dark-text-muted">
                    No files found
                  </span>
                </div>
              )}
            </Allotment.Pane>

            {/* Editor Panel - 50% (expands when other panels are hidden) - VS Code style */}
            <Allotment.Pane
              minSize={300}
              className="bg-white dark:bg-[#1e1e1e]"
            >
              {selectedFile ? (
                /* Single file view (IDE-style) */
                <div className="h-full flex flex-col">
                  {/* VS Code style tab bar */}
                  <div className="h-[35px] border-b border-[#e5e5e5] dark:border-[#333333]
                              flex items-stretch bg-[#ececec] dark:bg-[#2d2d2d]">
                    {/* Active Tab */}
                    <div className="flex items-center gap-1.5 pl-3 pr-2 h-full 
                                bg-white dark:bg-[#1e1e1e] 
                                border-t-2 border-t-[#007acc]
                                border-r border-r-[#e5e5e5] dark:border-r-[#333333]">
                      {/* File Icon from Material Icons */}
                      <span className="flex-shrink-0 opacity-90">
                        {(() => {
                          const filename = selectedFile.name || selectedFile.path.split('/').pop() || '';
                          const ext = filename.split('.').pop()?.toLowerCase();
                          // Simple inline SVG icons for tab
                          if (ext === 'tsx' || ext === 'ts') {
                            return (
                              <svg width="14" height="14" viewBox="0 0 16 16" className="flex-shrink-0">
                                <path fill="#0288d1" d="M2 2v12h12V2zm4 6h3v1H8v4H7V9H6zm5 0h2v1h-2v1h1a1.003 1.003 0 0 1 1 1v1a1.003 1.003 0 0 1-1 1h-2v-1h2v-1h-1a1.003 1.003 0 0 1-1-1V9a1.003 1.003 0 0 1 1-1"/>
                              </svg>
                            );
                          }
                          if (ext === 'jsx' || ext === 'js' || ext === 'mjs') {
                            return (
                              <svg width="14" height="14" viewBox="0 0 16 16" className="flex-shrink-0">
                                <path fill="#ffca28" d="M2 2v12h12V2zm6 6h1v4a1.003 1.003 0 0 1-1 1H7a1.003 1.003 0 0 1-1-1v-1h1v1h1zm3 0h2v1h-2v1h1a1.003 1.003 0 0 1 1 1v1a1.003 1.003 0 0 1-1 1h-2v-1h2v-1h-1a1.003 1.003 0 0 1-1-1V9a1.003 1.003 0 0 1 1-1"/>
                              </svg>
                            );
                          }
                          if (ext === 'json') {
                            return (
                              <svg width="14" height="14" viewBox="0 0 16 16" className="flex-shrink-0">
                                <path fill="#fbc02d" d="M5 3v2.5c0 .83-.67 1.5-1.5 1.5H2v2h1.5c.83 0 1.5.67 1.5 1.5V13h2v-2H6v-1.5c0-.83-.67-1.5-1.5-1.5.83 0 1.5-.67 1.5-1.5V5h1V3zm6 0v2h1v1.5c0 .83.67 1.5 1.5 1.5-.83 0-1.5.67-1.5 1.5V11h-1v2h2v-2.5c0-.83.67-1.5 1.5-1.5H16V7h-1.5c-.83 0-1.5-.67-1.5-1.5V3z"/>
                              </svg>
                            );
                          }
                          if (ext === 'css') {
                            return (
                              <svg width="14" height="14" viewBox="0 0 16 16" className="flex-shrink-0">
                                <path fill="#42a5f5" d="M2 1l1.09 12.27L8 15l4.91-1.73L14 1zm9.47 4.01l-.37 4.14-.1 1.12L8 11.11l-3-1.84-.21-2.12h1.74l.11 1.02 1.36.84 1.36-.84.14-1.56H4.83l-.37-3.6h7.08z"/>
                              </svg>
                            );
                          }
                          if (ext === 'html' || ext === 'htm') {
                            return (
                              <svg width="14" height="14" viewBox="0 0 16 16" className="flex-shrink-0">
                                <path fill="#e44d26" d="M2 1l1.09 12.27L8 15l4.91-1.73L14 1zm9.24 4.01H5.76l.16 1.78h5.16l-.48 5.37L8 13l-2.6-.84-.18-2.01h1.74l.09 1.02 1 .27.95-.27.1-1.14H5.33L4.89 5.11h6.46z"/>
                              </svg>
                            );
                          }
                          if (ext === 'md' || ext === 'markdown') {
                            return (
                              <svg width="14" height="14" viewBox="0 0 16 16" className="flex-shrink-0">
                                <path fill="#519aba" d="M14 3H2c-.55 0-1 .45-1 1v8c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM8.5 10.5L7 9l-1.5 1.5V5.5h1v3l.5-.5.5.5v-3h1zM11 10.5l-2-2.5h1.5V5.5h1V8H13z"/>
                              </svg>
                            );
                          }
                          // Default file icon
                          return (
                            <svg width="14" height="14" viewBox="0 0 16 16" className="flex-shrink-0">
                              <path fill="#6d8086" d="M13 14H3V2h7l3 3z"/>
                              <path fill="#fff" fillOpacity=".3" d="M10 2v3h3z"/>
                            </svg>
                          );
                        })()}
                      </span>
                      {/* File name */}
                      <span className="text-[13px] font-normal text-[#333333] dark:text-[#ffffff] truncate max-w-[200px]">
                        {selectedFile.name || selectedFile.path.split('/').pop()}
                      </span>
                      {/* Modified indicator */}
                      {isPRFile && (
                        <span className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    {/* Breadcrumb path - VS Code style */}
                    <div className="flex items-center px-3 text-[12px] text-[#6c757d] dark:text-[#8c8c8c] gap-1 overflow-hidden">
                      {selectedFile.path.replace(/.*\.highreview-prs\/worktrees\/[^/]+\//, '').split('/').slice(0, -1).map((part, i, arr) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="hover:text-[#007acc] cursor-pointer truncate max-w-[100px]">{part}</span>
                          {i < arr.length - 1 && <span className="text-[#6c757d] dark:text-[#8c8c8c]">/</span>}
                        </span>
                      ))}
                    </div>
                    {/* File stats on right side */}
                    <div className="ml-auto flex items-center gap-2 pr-3">
                      {isPRFile && fileStatsMap?.get(selectedFile.path) && (() => {
                        const stats = fileStatsMap.get(selectedFile.path)!;
                        return (
                          <>
                            {/* Status badge (M/A/D/R) - VS Code style */}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              stats.status === 'added' ? 'bg-[#28a745]/20 text-[#28a745] dark:text-[#4ec263]' :
                              stats.status === 'removed' ? 'bg-[#dc3545]/20 text-[#dc3545] dark:text-[#f14c4c]' :
                              stats.status === 'renamed' ? 'bg-[#ffc107]/20 text-[#946800] dark:text-[#ffc107]' :
                              'bg-[#007acc]/20 text-[#007acc] dark:text-[#3794ff]'
                            }`}>
                              {stats.status === 'added' ? 'Added' :
                               stats.status === 'removed' ? 'Deleted' :
                               stats.status === 'renamed' ? 'Renamed' :
                               'Modified'}
                            </span>
                            {/* Change stats */}
                            {(stats.additions > 0 || stats.deletions > 0) && (
                              <div className="flex items-center gap-1 text-[11px] font-mono font-medium">
                                {stats.additions > 0 && (
                                  <span className="text-[#28a745] dark:text-[#4ec263]">+{stats.additions}</span>
                                )}
                                {stats.deletions > 0 && (
                                  <span className="text-[#dc3545] dark:text-[#f14c4c]">-{stats.deletions}</span>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex-1">
                    {(() => {
                      if (contentLoading || diffLoading) {
                        return (
                          <div className="flex items-center justify-center h-full">
                            <span className="text-sm text-light-text-muted dark:text-dark-text-muted">
                              Loading...
                            </span>
                          </div>
                        );
                      }

                      if (isPRFile) {
                        if (diffData) {
                          // Determine which side to highlight based on commentInfo
                          const highlightLines = commentInfo ? {
                            original: commentInfo.originalLine || undefined,
                            modified: commentInfo.line || undefined,
                          } : undefined;

                          console.log('[ReviewPage] Rendering DiffEditor with data:', {
                            filePath: selectedFile.path,
                            hasOriginal: !!diffData.original,
                            originalLength: diffData.original?.length || 0,
                            hasModified: !!diffData.modified,
                            modifiedLength: diffData.modified?.length || 0,
                          });

                          return (
                            <DiffEditor
                              key={`diff-${selectedFile.path}`}
                              original={diffData.original || ''}
                              modified={diffData.modified || ''}
                              language={getLanguageFromFilename(selectedFile.path)}
                              theme={monacoTheme}
                              highlightLine={highlightLine}
                              highlightLines={highlightLines}
                              highlightColumn={highlightColumn}
                              highlightKeyword={highlightKeyword}
                              filePath={selectedFile.path}
                              repoRoot={worktreePath}
                              worktreePath={worktreePath}
                              comments={aiCommentDecorations}
                              onAddComment={handleAddComment}
                              onShowReferences={handleShowReferences}
                              onNavigateToLocation={handleNavigateToLocation}
                              onSearchInProject={handleSearchInProject}
                              aiReviewIssues={aiReviewIssues}
                              aiReviewCallStacks={aiReviewCallStacks}
                              onAIReviewClick={handleAIReviewDecorationClick}
                              prComments={currentFileComments}
                              onNavigateNext={handleNavigateNext}
                              onNavigatePrev={handleNavigatePrev}
                              initialScrollPosition={initialScrollPosition}
                            />
                          );
                        } else if (diffError) {
                          return (
                            <div className="flex items-center justify-center h-full">
                              <div className="text-center">
                                <span className="text-sm text-red-600 dark:text-red-400 block mb-2">
                                  Failed to load diff
                                </span>
                                <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                                  {diffError.message}
                                </span>
                              </div>
                            </div>
                          );
                        } else {
                          return (
                            <div className="flex items-center justify-center h-full">
                              <span className="text-sm text-light-text-muted dark:text-dark-text-muted">
                                No diff data available
                              </span>
                            </div>
                          );
                        }
                      }

                      if (contentData) {
                        return (
                          <CodeEditor
                            key={`code-${selectedFile.path}`}
                            value={contentData.content}
                            language={getLanguageFromFilename(selectedFile.path)}
                            theme={monacoTheme}
                            highlightLine={highlightLine || commentInfo?.line}
                            highlightColumn={highlightColumn}
                            highlightKeyword={highlightKeyword}
                            comments={aiCommentDecorations}
                            filePath={selectedFile.path}
                            repoRoot={worktreePath}
                            worktreePath={worktreePath}
                            onAddComment={handleAddComment}
                            onShowReferences={handleShowReferences}
                            onNavigateToLocation={handleNavigateToLocation}
                            onSearchInProject={handleSearchInProject}
                            aiReviewIssues={aiReviewIssues}
                            aiReviewCallStacks={aiReviewCallStacks}
                            onAIReviewClick={handleAIReviewDecorationClick}
                            prComments={currentFileComments}
                            onNavigateNext={handleNavigateNext}
                            onNavigatePrev={handleNavigatePrev}
                            initialScrollPosition={initialScrollPosition}
                          />
                        );
                      }

                      return (
                        <div className="flex items-center justify-center h-full">
                          <span className="text-sm text-light-text-muted dark:text-dark-text-muted">
                            No content available
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <span className="text-sm text-light-text-muted dark:text-dark-text-muted">
                    Select a file to view
                  </span>
                </div>
              )}
            </Allotment.Pane>

            {/* AI Review Panel (AI Code Review) - 20% - VS Code style */}
            <Allotment.Pane
              visible={true}
              minSize={250}
              snap
              className="bg-[#f3f3f3] dark:bg-[#252526]"
            >
              {aiReviewLoading ? (
                <div className="h-full flex flex-col">
                  {/* Header for loading state - VS Code style */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#e5e5e5] dark:border-[#333333] bg-[#e8e8e8] dark:bg-[#2d2d30]">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded flex items-center justify-center bg-[#007acc]/10 dark:bg-[#007acc]/20">
                        <span className="text-sm">🤖</span>
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold text-[#424242] dark:text-[#cccccc]">AI Code Review</h3>
                        <p className="text-[10px] text-[#6c757d] dark:text-[#8c8c8c]">Analyzing code...</p>
                      </div>
                    </div>
                  </div>
                  {/* Progress Indicator */}
                  <div className="flex-1 p-4 overflow-y-auto">
                    <AIProgressIndicator
                      isActive={aiReviewLoading}
                      currentStep={aiReviewStep}
                      chunkedReviewProgress={chunkedReviewProgress}
                      onComplete={() => {
                      }}
                    />
                  </div>
                </div>
              ) : aiReviewData ? (
                <EnhancedAIReviewPanel
                  review={aiReviewData}
                  metadata={aiReviewMetadata}
                  currentCommitSha={prData?.pullRequest?.headRefOid}
                  onClose={() => {}} // AI Review panel always visible
                  onRerun={handleReRunAIReview}
                  highlightedItem={highlightedAIReview}
                  onHighlightedItemProcessed={() => setHighlightedAIReview(null)}
                  onFileSelect={handleFileSelect}
                  changedLines={changedLinesMap}
                />
              ) : (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#e5e5e5] dark:border-[#333333] bg-[#e8e8e8] dark:bg-[#2d2d30]">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded flex items-center justify-center bg-[#007acc]/10 dark:bg-[#007acc]/20">
                        <span className="text-sm">🤖</span>
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold text-[#424242] dark:text-[#cccccc]">AI Code Review</h3>
                        <p className="text-[10px] text-[#6c757d] dark:text-[#8c8c8c]">Ready to analyze</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center max-w-xs">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#e0e0e0] dark:bg-[#3a3a3d] flex items-center justify-center">
                        <span className="text-2xl">🔍</span>
                      </div>
                      <h3 className="text-sm font-semibold text-[#424242] dark:text-[#cccccc] mb-1.5">
                        No AI Review Available
                      </h3>
                      <p className="text-xs text-[#6c757d] dark:text-[#8c8c8c] mb-3">
                        AI review will be automatically generated when you open a PR, or you can manually trigger it.
                      </p>
                      <button
                        onClick={handleReRunAIReview}
                        className="px-3 py-1.5 bg-[#007acc] text-white text-xs font-medium rounded hover:bg-[#005a9e] transition-colors"
                      >
                        Run AI Review
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Allotment.Pane>

            {/* Chat Panel (AI Assistant) - 20% - VS Code style */}
            <Allotment.Pane
              visible={showChat}
              minSize={250}
              snap
              className="bg-[#f3f3f3] dark:bg-[#252526]"
            >
              <ChatPanel
                sessionId={sessionId}
                worktreePath={worktreePath}
                onClose={() => setShowChat(false)}
                prContext={prInfo && prData?.pullRequest ? {
                  owner: prInfo.owner!,
                  repo: prInfo.repo!,
                  prNumber: parseInt(prInfo.prNumber!),
                  title: prData.pullRequest.title,
                  description: prData.pullRequest.body || '',
                } : undefined}
                aiReviewData={aiReviewData}
                changedFiles={prData?.files ? prData.files.map((f: any) => f.path) : undefined}
              />
            </Allotment.Pane>
          </Allotment>
      </div>

      {/* Modals */}
      {/* Review Submission Modal */}
      {showReviewModal && (
        <ReviewSubmissionModal
          commentCount={pendingComments.length}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmitReview}
          onCancel={() => setShowReviewModal(false)}
        />
      )}

      {/* AI Review Options Modal */}
      <AIReviewOptionsModal
        isOpen={showAIOptionsModal}
        onClose={() => setShowAIOptionsModal(false)}
        onConfirm={handleStartReviewWithOptions}
      />

      {/* Code Navigation Modal */}
      {navigationModal.show && (
        <CodeNavigationModal
          title={navigationModal.title}
          locations={navigationModal.locations}
          onLocationClick={handleLocationClick}
          onClose={() => setNavigationModal({ show: false, title: '', locations: [] })}
        />
      )}

      {/* PR Comment Thread Panel */}
      {activeCommentThread && (
        <PRCommentThread
          thread={activeCommentThread}
          currentUser={prData?.pullRequest?.author?.login}
          onReply={handleReply}
          onReact={handleReact}
          onResolve={async (_threadId: string) => {
            try {
              // TODO: Implement resolve functionality
              toast.success('Thread resolved');
              setActiveCommentThread(null);
            } catch (error) {
              console.error('[ReviewPage] Error resolving thread:', error);
              toast.error('Failed to resolve thread');
            }
          }}
          onClose={() => setActiveCommentThread(null)}
        />
      )}



      {/* Search Results Modal */}
      <SearchResultsModal
        query={searchModal.query}
        results={searchModal.results}
        isOpen={searchModal.show}
        onClose={() => setSearchModal({ ...searchModal, show: false })}
        onResultClick={(file, line, column) => {
          handleNavigateToLocation(`file://${worktreePath}/${file}`, line, column, searchModal.query);
          setSearchModal({ ...searchModal, show: false });
        }}
        truncated={searchModal.truncated}
      />

      {/* PR Details Modal */}
      {showPRDetailsModal && prData?.pullRequest && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-light-surface dark:bg-dark-surface w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl border border-light-border dark:border-dark-border flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#007acc]/10 rounded-lg">
                  <svg className="w-5 h-5 text-[#007acc]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
                    <span className="text-[#007acc]">#{prInfo?.prNumber}</span>
                    <span className="text-light-border dark:text-dark-border">|</span>
                    {prData.pullRequest.title}
                  </h2>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      prData.pullRequest.state === 'OPEN' ? 'bg-green-500/10 text-green-500' : 
                      prData.pullRequest.state === 'MERGED' ? 'bg-purple-500/10 text-purple-500' : 'bg-red-500/10 text-red-500'
                    }`}>
                      {prData.pullRequest.state}
                    </span>
                    <span className="text-xs text-light-text-muted dark:text-dark-text-muted flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                      {prData.pullRequest.author}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowPRDetailsModal(false)}
                className="p-2 hover:bg-light-bg-hover dark:hover:bg-dark-bg-hover rounded-full transition-colors"
              >
                <svg className="w-6 h-6 text-light-text-secondary dark:text-dark-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-8 bg-light-surface dark:bg-dark-surface custom-scrollbar">
              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-[#007acc] prose-pre:bg-light-bg dark:prose-pre:bg-dark-bg prose-pre:border prose-pre:border-light-border dark:prose-pre:border-dark-border">
                {prData.pullRequest.body ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                    {prData.pullRequest.body}
                  </ReactMarkdown>
                ) : (
                  <p className="italic text-light-text-muted dark:text-dark-text-muted">No description provided.</p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg flex justify-between items-center">
              <div className="text-xs text-light-text-muted dark:text-dark-text-muted">
                {prData.pullRequest.url && (
                  <a 
                    href={prData.pullRequest.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-[#007acc] transition-colors"
                  >
                    View on GitHub
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
              <button
                onClick={() => setShowPRDetailsModal(false)}
                className="px-6 py-2 bg-[#007acc] text-white rounded-lg font-semibold hover:bg-[#005a9e] transition-all shadow-md shadow-[#007acc]/20"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
