import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
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
import { ChangedFilesList } from '../components/ChangedFilesList';
import { ReviewSubmissionModal } from '../components/ReviewSubmissionModal';
import { CodeNavigationModal } from '../components/CodeNavigationModal';
import { usePendingReview } from '../hooks/usePendingReview';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { initializeMonacoServices, startLanguageClient, stopLanguageClient } from '../utils/lsp';
import { loadPRFilesIntoMonaco } from '../utils/monacoSetup';
import { detectFunctionLines } from '../utils/aiReviewDecorations';

interface PRFile {
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

export function ReviewPage({
  worktreePath,
  baseBranch = 'main',
  repoRoot,
  initialFilePath,
  commentInfo,
  aiReviewOptions,
}: ReviewPageProps) {
  console.log('[ReviewPage] Component rendered with props:', {
    worktreePath,
    baseBranch,
    repoRoot,
    initialFilePath,
    commentInfo
  });

  const { theme } = useTheme();
  const { language } = useLanguage();
  const location = useLocation();
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [showChat, setShowChat] = useState(() => {
    const saved = localStorage.getItem('highreview-show-chat');
    return saved !== null ? saved === 'true' : true;
  });
  const [showAIReview, setShowAIReview] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [aiReviewData, setAIReviewData] = useState<AIReviewResult | null>(null);
  const [aiReviewLoading, setAIReviewLoading] = useState(false);
  const [aiReviewStep, setAIReviewStep] = useState<AIReviewStep>('preparing');
  const [aiReviewMetadata, setAIReviewMetadata] = useState<{
    commitSha: string;
    options: any;
    timestamp: number;
    isOutdated: boolean;
  } | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [fileFilterMode, setFileFilterMode] = useState<'all' | 'changed'>('all');
  const [highlightLine, setHighlightLine] = useState<number | undefined>(undefined);
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
  const [highlightedAIReview, setHighlightedAIReview] = useState<{
    type: 'issue' | 'callstack';
    data: AIReviewComment | CallStackInfo;
  } | null>(null);

  // Get PR info from location state
  const prInfo = location.state as { owner?: string; repo?: string; prNumber?: string } | null;
  console.log('[ReviewPage] PR info from location state:', prInfo);

  // Initialize pending review hook
  const {
    comments: pendingComments,
    addComment,
    updateComment,
    removeComment,
    clearAll,
    submitReview,
    isSubmitting,
    submitError,
  } = usePendingReview(
    prInfo?.owner || '',
    prInfo?.repo || '',
    parseInt(prInfo?.prNumber || '0')
  );

  // Initialize LSP connection
  useEffect(() => {
    initializeMonacoServices();
    startLanguageClient(worktreePath).catch((error) => {
      console.error('[LSP] Failed to start language client:', error);
    });
    return () => {
      stopLanguageClient();
    };
  }, [worktreePath]);

  // Reset panel sizes on mount to ensure proper layout
  useEffect(() => {
    // FORCE clear ALL HighReview related storage
    console.log('[ReviewPage] Clearing ALL saved panel sizes to reset layout');

    // Clear all highreview-related localStorage keys
    Object.keys(localStorage).forEach(key => {
      if (key.includes('highreview') || key.includes('panel')) {
        console.log('[ReviewPage] Removing localStorage key:', key);
        localStorage.removeItem(key);
      }
    });

    // Clear sessionStorage too
    Object.keys(sessionStorage).forEach(key => {
      if (key.includes('highreview') || key.includes('panel')) {
        console.log('[ReviewPage] Removing sessionStorage key:', key);
        sessionStorage.removeItem(key);
      }
    });
  }, []);

  // Persist showChat to localStorage
  useEffect(() => {
    localStorage.setItem('highreview-show-chat', String(showChat));
  }, [showChat]);

  // Force re-layout when panel visibility changes
  useEffect(() => {
    console.log('[ReviewPage] Panel visibility changed - showChat:', showChat, 'showAIReview:', showAIReview);
    // Trigger a resize event to force panels to recalculate
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }, [showChat, showAIReview]);

  // Fetch file tree
  const { data: treeData, isLoading: treeLoading, error: treeError } = useQuery({
    queryKey: ['fileTree', worktreePath],
    queryFn: async () => {
      console.log('[ReviewPage] Fetching file tree for:', worktreePath);
      const response = await fetch(`/api/fs/tree?path=${encodeURIComponent(worktreePath)}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ReviewPage] File tree fetch failed:', errorText);
        throw new Error('Failed to fetch file tree');
      }
      const data = await response.json();
      console.log('[ReviewPage] File tree loaded:', data);
      return data;
    },
  });

  console.log('[ReviewPage] Tree state:', { treeData, treeLoading, treeError });

  // Fetch PR data (changed files)
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
      console.log('[ReviewPage] PR data loaded:', data);
      return data;
    },
    enabled: !!prInfo?.owner && !!prInfo?.repo && !!prInfo?.prNumber,
  });

  // Map AI review comments to files
  const aiCommentsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (aiReviewData) {
      const allComments = [
        ...aiReviewData.criticalIssues,
        ...aiReviewData.warnings,
        ...aiReviewData.suggestions,
      ];
      allComments.forEach(comment => {
        map.set(comment.file, (map.get(comment.file) || 0) + 1);
      });
    }
    return map;
  }, [aiReviewData]);

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
    if (!prData?.files) return undefined;
    return new Set(prData.files.map(f => f.path));
  }, [prData]);

  // Create Map of file change statistics
  const fileStatsMap = useMemo(() => {
    if (!prData?.files) return undefined;
    const map = new Map();
    prData.files.forEach(file => {
      map.set(file.path, {
        additions: file.additions || 0,
        deletions: file.deletions || 0,
        status: file.status,
      });
    });
    return map;
  }, [prData]);

  // Load all PR files into Monaco for better code navigation
  useEffect(() => {
    if (prData?.files && worktreePath && baseBranch && repoRoot) {
      console.log('[ReviewPage] Loading PR files into Monaco for code navigation');
      loadPRFilesIntoMonaco(
        prData.files,
        repoRoot,
        worktreePath,
        baseBranch
      ).catch((error) => {
        console.error('[ReviewPage] Failed to load PR files into Monaco:', error);
      });
    }
  }, [prData, worktreePath, baseBranch, repoRoot]);

  // Auto-select file if initialFilePath is provided
  useEffect(() => {
    if (initialFilePath && treeData?.tree) {
      const findFileInTree = (nodes: FileNode[], path: string): FileNode | null => {
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
      };

      const fileNode = findFileInTree(treeData.tree, initialFilePath);
      if (fileNode) {
        setSelectedFile(fileNode);
        // Auto-open chat panel if there's comment info
        if (commentInfo) {
          setShowChat(true);
        }
      }
    }
  }, [initialFilePath, treeData, commentInfo]);

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

      const effectiveRepoRoot = repoRoot || worktreePath;
      console.log('[ReviewPage] Fetching diff for:', {
        selectedFile: selectedFile.path,
        worktreePath,
        baseBranch,
        effectiveRepoRoot,
        isPRFile,
        prInfo,
      });

      const params = new URLSearchParams({
        worktreePath,
        filePath: selectedFile.path,
        baseBranch,
        repoRoot: effectiveRepoRoot,
      });

      // Add GitHub PR info for fallback
      if (prInfo?.owner) params.append('owner', prInfo.owner);
      if (prInfo?.repo) params.append('repo', prInfo.repo);
      if (prInfo?.prNumber) params.append('prNumber', prInfo.prNumber.toString());
      if (prData?.pullRequest?.headBranch) params.append('headRef', prData.pullRequest.headBranch);

      console.log('[ReviewPage] Diff API URL:', `/api/fs/diff?${params.toString()}`);

      const response = await fetch(`/api/fs/diff?${params.toString()}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ReviewPage] Diff fetch failed:', response.status, errorText);
        throw new Error(`Failed to fetch diff: ${response.status}`);
      }

      const data = await response.json();
      console.log('[ReviewPage] Diff data received:', {
        file: selectedFile.path,
        hasOriginal: !!data.original,
        hasModified: !!data.modified,
        originalLength: data.original?.length,
        modifiedLength: data.modified?.length,
        originalPreview: data.original?.substring(0, 100),
        modifiedPreview: data.modified?.substring(0, 100),
      });

      return data;
    },
    enabled: !!selectedFile && !!isPRFile, // Only fetch for PR files
    staleTime: 0, // Always fetch fresh data
    cacheTime: 0, // Don't cache
  });

  const handleFileClick = (node: FileNode) => {
    if (node.type === 'file') {
      setSelectedFile(node);
    }
  };

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
    };
    return languageMap[ext || ''] || 'plaintext';
  };

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs-light';

  const codeContext = selectedFile && contentData ? {
    filePath: selectedFile.path,
    fileContent: contentData.content,
  } : undefined;

  // Perform AI review on mount if PR info is available
  useEffect(() => {
    console.log('[AI Review useEffect] TRIGGERED with dependencies:', {
      prInfo,
      worktreePath,
      repoRoot,
      baseBranch,
      language,
      aiReviewOptions,
    });

    const performAIReview = async () => {
      console.log('[AI Review] Checking conditions...', {
        hasOwner: !!prInfo?.owner,
        hasRepo: !!prInfo?.repo,
        hasPrNumber: !!prInfo?.prNumber,
        hasWorktreePath: !!worktreePath,
        hasRepoRoot: !!repoRoot,
        prInfo,
      });

      if (!prInfo?.owner || !prInfo?.repo || !prInfo?.prNumber || !worktreePath || !repoRoot) {
        console.log('[AI Review] Missing required info, skipping AI review');
        return;
      }

      // Get current HEAD commit SHA from prData
      const currentHeadSha = prData?.pullRequest?.headRefOid;
      if (!currentHeadSha) {
        console.log('[AI Review] Missing HEAD commit SHA, skipping AI review');
        return;
      }

      // Generate cache key with commit SHA and options
      const optionsHash = JSON.stringify(aiReviewOptions || {});
      const reviewKey = `ai-review-${prInfo.owner}-${prInfo.repo}-${prInfo.prNumber}-${currentHeadSha}-${optionsHash}`;
      const cachedData = localStorage.getItem(reviewKey);

      if (cachedData) {
        try {
          console.log('[AI Review] Using cached review');
          const cached = JSON.parse(cachedData);
          console.log('[AI Review] Parsed cached review:', cached);
          setAIReviewData(cached.review);
          setAIReviewMetadata({
            commitSha: cached.commitSha,
            options: cached.options,
            timestamp: cached.timestamp,
            isOutdated: cached.commitSha !== currentHeadSha,
          });
          setShowAIReview(true);
          console.log('[AI Review] Set showAIReview to true');
          return;
        } catch (error) {
          console.error('[AI Review] Failed to parse cached review:', error);
        }
      }

      // Perform AI review
      console.log('[AI Review] Starting AI review...');
      setAIReviewLoading(true);
      setAIReviewStep('preparing');

      try {
        // Brief delay to show "Preparing" step
        await new Promise(resolve => setTimeout(resolve, 500));
        setAIReviewStep('analyzing');

        // Brief delay to show "Analyzing" step
        await new Promise(resolve => setTimeout(resolve, 500));
        setAIReviewStep('thinking');

        // This is the long blocking call (2-5 minutes)
        console.log('[AI Review] Starting API call (this may take 2-5 minutes)...');
        const response = await fetch(
          `/api/prs/${prInfo.owner}/${prInfo.repo}/${prInfo.prNumber}/ai-review`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              worktreePath,
              baseBranch,
              language,
              options: aiReviewOptions,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[AI Review] API error:', response.status, errorText);
          throw new Error(`AI review failed: ${response.status}`);
        }

        console.log('[AI Review] API call completed, parsing response...');
        setAIReviewStep('finalizing');

        const result = await response.json();
        console.log('[AI Review] Review completed:', result);
        setAIReviewData(result.review);
        setShowAIReview(true);

        // Get current HEAD commit SHA
        const currentHeadSha = prData?.pullRequest?.headRefOid;

        // Cache the review result with metadata
        const cacheData = {
          review: result.review,
          commitSha: currentHeadSha,
          options: aiReviewOptions,
          timestamp: Date.now(),
        };
        const optionsHash = JSON.stringify(aiReviewOptions || {});
        const cacheKey = `ai-review-${prInfo.owner}-${prInfo.repo}-${prInfo.prNumber}-${currentHeadSha}-${optionsHash}`;
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));

        // Set metadata
        setAIReviewMetadata({
          commitSha: currentHeadSha || '',
          options: aiReviewOptions,
          timestamp: Date.now(),
          isOutdated: false,
        });

        setAIReviewStep('completed');
      } catch (error) {
        console.error('[AI Review] Failed to perform AI review:', error);
        setAIReviewStep('preparing'); // Reset on error
      } finally {
        setAIReviewLoading(false);
      }
    };

    performAIReview();
  }, [prInfo, worktreePath, repoRoot, baseBranch, language, aiReviewOptions]);

  const handleReRunAIReview = async () => {
    if (!prInfo?.owner || !prInfo?.repo || !prInfo?.prNumber) return;

    setAIReviewLoading(true);
    setAIReviewStep('preparing');

    try {
      // Brief delay to show "Preparing" step
      await new Promise(resolve => setTimeout(resolve, 500));
      setAIReviewStep('analyzing');

      // Brief delay to show "Analyzing" step
      await new Promise(resolve => setTimeout(resolve, 500));
      setAIReviewStep('thinking');

      // This is the long blocking call (2-5 minutes)
      console.log('[AI Review] Starting re-run API call (this may take 2-5 minutes)...');
      const response = await fetch(
        `/api/prs/${prInfo.owner}/${prInfo.repo}/${prInfo.prNumber}/ai-review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worktreePath,
            baseBranch,
            language,
            options: aiReviewOptions,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('AI review failed');
      }

      console.log('[AI Review] Re-run API call completed, parsing response...');
      setAIReviewStep('finalizing');

      const result = await response.json();
      setAIReviewData(result.review);

      // Get current HEAD commit SHA
      const currentHeadSha = prData?.pullRequest?.headRefOid;

      // Update cached review with metadata
      const cacheData = {
        review: result.review,
        commitSha: currentHeadSha,
        options: aiReviewOptions,
        timestamp: Date.now(),
      };
      const optionsHash = JSON.stringify(aiReviewOptions || {});
      const cacheKey = `ai-review-${prInfo.owner}-${prInfo.repo}-${prInfo.prNumber}-${currentHeadSha}-${optionsHash}`;
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));

      // Set metadata
      setAIReviewMetadata({
        commitSha: currentHeadSha || '',
        options: aiReviewOptions,
        timestamp: Date.now(),
        isOutdated: false,
      });

      setAIReviewStep('completed');
    } catch (error) {
      console.error('[AI Review] Failed to re-run AI review:', error);
      setAIReviewStep('preparing'); // Reset on error
    } finally {
      setAIReviewLoading(false);
    }
  };

  const handleAICommentClick = (comment: AIReviewComment) => {
    // Find and select the file in the tree
    if (treeData?.tree) {
      const findFileInTree = (nodes: FileNode[], path: string): FileNode | null => {
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
      };

      const fileNode = findFileInTree(treeData.tree, comment.file);
      if (fileNode) {
        setSelectedFile(fileNode);
        setLayoutMode('editor');
        // TODO: Scroll to line number when CodeEditor supports it
      }
    }
  };

  // Handler for AI review decoration clicks from editor glyph margin
  const handleAIReviewDecorationClick = useCallback((decoration: import('../utils/aiReviewDecorations').AIReviewDecoration) => {
    console.log('[ReviewPage] AI review decoration clicked:', decoration);

    // Open AI Review panel if not already open
    setShowAIReview(prev => {
      if (!prev) return true;
      return prev;
    });

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
    } catch (error) {
      console.error('[ReviewPage] Failed to submit review:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to submit review');
    }
  };

  // Helper function to find file in tree
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

  const handleNavigateToLocation = useCallback((uri: string, line: number, column: number) => {
    // Extract file path from URI
    let filePath = uri;

    if (filePath.startsWith('file://')) {
      filePath = filePath.substring(7);
    }

    if (filePath.startsWith(worktreePath)) {
      filePath = filePath.substring(worktreePath.length + 1);
    }

    // Find the file in the tree and select it
    if (treeData?.tree) {
      const fileNode = findFileInTree(treeData.tree, filePath);
      if (fileNode) {
        setSelectedFile(fileNode);
        setLayoutMode('editor');
        // TODO: Scroll to the specific line when editor supports it
        console.log(`[ReviewPage] Navigating to ${filePath}:${line}:${column}`);
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
      setSelectedFile(fileNode);
      setHighlightLine(line);
      setPendingFunctionName(functionName);

      if (line) {
        console.log(`[ReviewPage] Selecting file ${file} and highlighting line ${line}`);
      } else if (functionName) {
        console.log(`[ReviewPage] Selecting file ${file} and will search for function ${functionName}`);
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
      console.log(`[ReviewPage] Searching for function "${pendingFunctionName}" in ${selectedFile.path}`);
      const functionLines = detectFunctionLines(fileContent, pendingFunctionName);

      if (functionLines.length > 0) {
        const targetLine = functionLines[0];
        console.log(`[ReviewPage] Found function "${pendingFunctionName}" at line ${targetLine}`);
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

  return (
    <div className="h-screen flex flex-col bg-light-bg dark:bg-dark-bg">
      {/* Toolbar */}
      <div className="h-12 border-b border-light-border dark:border-dark-border
                      bg-light-surface dark:bg-dark-surface flex items-center px-4 gap-4 justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => window.history.back()}
            className="p-1.5 rounded-md hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated
                     text-light-text-primary dark:text-dark-text-primary transition-colors flex-shrink-0"
            title="Go back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>

          {/* PR Info */}
          {prData?.pullRequest && prInfo && (
            <div className="flex items-center gap-3 flex-shrink-0 px-3 py-1 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-md">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-light-accent-primary dark:text-dark-accent-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <span className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">
                  #{prInfo.prNumber}
                </span>
              </div>

              <div className="h-4 w-px bg-light-border dark:bg-dark-border"></div>

              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary truncate max-w-md" title={prData.pullRequest.title}>
                  {prData.pullRequest.title}
                </span>
                {prData.pullRequest.author && (
                  <div className="flex items-center gap-1.5 text-xs text-light-text-muted dark:text-dark-text-muted">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                    <span>{prData.pullRequest.author}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Separator */}
          {prData && prInfo && (
            <div className="h-6 w-px bg-light-border dark:bg-dark-border"></div>
          )}

          {/* Worktree Path */}
          <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary truncate">
            {worktreePath}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowChat(!showChat)}
            className="px-3 py-1 text-sm rounded-md transition-colors
                     bg-light-surface-elevated dark:bg-dark-surface-elevated
                     text-light-text-primary dark:text-dark-text-primary"
          >
            {showChat ? 'Hide' : 'Show'} AI Chat
          </button>
          {prInfo && (
            <>
              <button
                onClick={() => setShowAIReview(!showAIReview)}
                className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-2 ${
                  showAIReview
                    ? 'bg-light-accent-primary dark:bg-dark-accent-primary text-white'
                    : 'bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                {showAIReview ? 'Hide' : 'Show'} AI Review
                {aiReviewData && aiReviewData.totalIssues > 0 && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-white/20">
                    {aiReviewData.totalIssues}
                  </span>
                )}
              </button>
              <button
                onClick={handleReRunAIReview}
                disabled={aiReviewLoading}
                className="px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-2
                         bg-light-surface-elevated dark:bg-dark-surface-elevated
                         text-light-text-primary dark:text-dark-text-primary
                         hover:bg-light-border dark:hover:bg-dark-border
                         disabled:opacity-50 disabled:cursor-not-allowed"
                title="Re-run AI Review"
              >
                <svg className={`w-4 h-4 ${aiReviewLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {aiReviewLoading ? 'Running...' : 'Re-run'}
              </button>
              <button
                onClick={() => setShowReviewModal(true)}
                className="px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-2
                         bg-green-600 hover:bg-green-700 text-white font-medium"
                title="Submit your review to GitHub"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Submit Review
                {pendingComments.length > 0 && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-white/20">
                    {pendingComments.length}
                  </span>
                )}
              </button>
            </>
          )}
          <LanguageSelector />
          <ThemeToggle />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* 3-panel resizable layout: File Tree | Editor | Side Panels */}
        <Allotment
            key={`unified-${showChat}-${showAIReview}-${!!aiReviewData}`}
            className="h-full"
          >
            {/* File Tree Panel - 15% */}
            <Allotment.Pane
              minSize={200}
              maxSize={600}
              preferredSize="15%"
              className="bg-light-surface-elevated dark:bg-dark-surface-elevated"
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

            {/* Editor Panel - 50% (expands when other panels are hidden) */}
            <Allotment.Pane
              minSize={300}
              preferredSize="50%"
              className="bg-light-surface dark:bg-dark-surface"
            >
              {selectedFile ? (
                /* Single file view (IDE-style) */
                <div className="h-full flex flex-col">
                  <div className="h-10 border-b border-light-border dark:border-dark-border
                              flex items-center justify-between px-4 bg-light-surface-elevated dark:bg-dark-surface-elevated">
                    <span className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">
                      {selectedFile.path}
                    </span>
                    {isPRFile && fileStatsMap?.get(selectedFile.path) && (() => {
                      const stats = fileStatsMap.get(selectedFile.path)!;
                      return (
                        <div className="flex items-center gap-2">
                          {/* Status badge (M/A/D/R) */}
                          <span className={`text-xs px-2 py-1 rounded font-medium ${
                            stats.status === 'added' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                            stats.status === 'removed' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                            stats.status === 'renamed' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                            'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                          }`}>
                            {stats.status === 'added' ? 'Added' :
                             stats.status === 'removed' ? 'Deleted' :
                             stats.status === 'renamed' ? 'Renamed' :
                             'Modified'}
                          </span>
                          {/* Change stats */}
                          {(stats.additions > 0 || stats.deletions > 0) && (
                            <div className="flex items-center gap-1 text-xs font-mono">
                              {stats.additions > 0 && (
                                <span className="text-green-600 dark:text-green-400">+{stats.additions}</span>
                              )}
                              {stats.deletions > 0 && (
                                <span className="text-red-600 dark:text-red-400">-{stats.deletions}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex-1">
                    {(() => {
                      console.log('[ReviewPage] Editor render decision:', {
                        selectedFile: selectedFile.path,
                        isPRFile,
                        contentLoading,
                        diffLoading,
                        hasDiffData: !!diffData,
                        hasContentData: !!contentData,
                        diffError,
                        diffOriginalLength: diffData?.original?.length,
                        diffModifiedLength: diffData?.modified?.length,
                      });

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
                          console.log('[ReviewPage] Rendering DiffEditor for PR file');
                          return (
                            <DiffEditor
                              key={`diff-${selectedFile.path}`}
                              original={diffData.original || ''}
                              modified={diffData.modified || ''}
                              language={getLanguageFromFilename(selectedFile.path)}
                              theme={monacoTheme}
                              highlightLine={highlightLine}
                              filePath={selectedFile.path}
                              repoRoot={repoRoot || worktreePath}
                              comments={aiCommentDecorations}
                              onAddComment={handleAddComment}
                              onShowReferences={handleShowReferences}
                              onNavigateToLocation={handleNavigateToLocation}
                              aiReviewIssues={aiReviewIssues}
                              aiReviewCallStacks={aiReviewCallStacks}
                              onAIReviewClick={handleAIReviewDecorationClick}
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
                        console.log('[ReviewPage] Rendering CodeEditor for regular file');
                        return (
                          <CodeEditor
                            key={`code-${selectedFile.path}`}
                            value={contentData.content}
                            language={getLanguageFromFilename(selectedFile.path)}
                            theme={monacoTheme}
                            highlightLine={highlightLine || commentInfo?.line}
                            comments={aiCommentDecorations}
                            filePath={selectedFile.path}
                            repoRoot={repoRoot || worktreePath}
                            onAddComment={handleAddComment}
                            onShowReferences={handleShowReferences}
                            onNavigateToLocation={handleNavigateToLocation}
                            aiReviewIssues={aiReviewIssues}
                            aiReviewCallStacks={aiReviewCallStacks}
                            onAIReviewClick={handleAIReviewDecorationClick}
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

            {/* AI Review Panel (AI Code Review) - 20% */}
            <Allotment.Pane
              visible={showAIReview && (!!aiReviewData || aiReviewLoading)}
              minSize={250}
              preferredSize="20%"
              snap
              className="bg-light-surface-elevated dark:bg-dark-surface-elevated"
            >
              {aiReviewLoading ? (
                <div className="h-full flex flex-col">
                  {/* Header for loading state */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border bg-gradient-to-r from-light-accent-primary to-light-accent-secondary dark:from-dark-accent-primary dark:to-dark-accent-secondary">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                        <span className="text-white text-lg">🤖</span>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold">AI Code Review</h3>
                        <p className="text-white/80 text-xs">Analyzing code...</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAIReview(false)}
                      className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-white"
                    >
                      ✕
                    </button>
                  </div>
                  {/* Progress Indicator */}
                  <div className="flex-1 p-4 overflow-y-auto">
                    <AIProgressIndicator
                      isActive={aiReviewLoading}
                      currentStep={aiReviewStep}
                      onComplete={() => {
                        console.log('[ReviewPage] AI review progress completed');
                      }}
                    />
                  </div>
                </div>
              ) : aiReviewData ? (
                <EnhancedAIReviewPanel
                  review={aiReviewData}
                  metadata={aiReviewMetadata}
                  currentCommitSha={prData?.pullRequest?.headRefOid}
                  onClose={() => setShowAIReview(false)}
                  onRerun={handleReRunAIReview}
                  highlightedItem={highlightedAIReview}
                  onHighlightedItemProcessed={() => setHighlightedAIReview(null)}
                  onFileSelect={handleFileSelect}
                />
              ) : null}
            </Allotment.Pane>

            {/* Chat Panel (AI Assistant) - 20% */}
            <Allotment.Pane
              visible={showChat}
              minSize={250}
              preferredSize="20%"
              snap
              className="bg-light-surface-elevated dark:bg-dark-surface-elevated"
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

      {/* Code Navigation Modal */}
      {navigationModal.show && (
        <CodeNavigationModal
          title={navigationModal.title}
          locations={navigationModal.locations}
          onLocationClick={handleLocationClick}
          onClose={() => setNavigationModal({ show: false, title: '', locations: [] })}
        />
      )}
    </div>
  );
}
