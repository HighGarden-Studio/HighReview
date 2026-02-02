import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import mermaid from 'mermaid';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageSelector } from '../components/LanguageSelector';
import { Toast } from '../components/Toast';
import { AIReviewOptionsModal, type AIReviewOptions } from '../components/AIReviewOptionsModal';
import { CommentEditor } from '../components/CommentEditor';
import { useTheme } from '../contexts/ThemeContext';

type Tab = 'conversation' | 'commits' | 'checks' | 'files';

interface ToastMessage {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

// Helper function to get language from file path
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: { [key: string]: string } = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    java: 'java',
    go: 'go',
    rs: 'rust',
    css: 'css',
    scss: 'css',
    json: 'json',
    md: 'markdown',
    html: 'markup',
    xml: 'markup',
    yml: 'yaml',
    yaml: 'yaml',
  };
  return languageMap[ext || ''] || 'javascript';
}

// Helper function to extract line numbers from diffHunk
function extractLineNumbers(diffHunk: string): { startLine: number; endLine: number } | null {
  if (!diffHunk) return null;

  // Parse the diff header like "@@ -44,4 +44,12 @@" or "@@ -44 +44,12 @@"
  // The format is: @@ -oldStart,oldLines +newStart,newLines @@
  const headerMatch = diffHunk.match(/@@ -\d+,?\d* \+(\d+)(?:,(\d+))? @@/);
  if (!headerMatch) return null;

  const startLine = parseInt(headerMatch[1], 10);
  const lineCount = headerMatch[2] ? parseInt(headerMatch[2], 10) : 1;
  const endLine = startLine + lineCount - 1;

  return { startLine, endLine };
}

// Helper function to render diff with line numbers and syntax highlighting
function renderDiffWithLineNumbers(diffHunk: string, isDarkMode: boolean, filePath?: string): JSX.Element {
  if (!diffHunk) return <></>;

  const lines = diffHunk.split('\n');
  const headerMatch = lines[0].match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);

  if (!headerMatch) {
    return <pre className="text-xs font-mono p-3 overflow-x-auto">{diffHunk}</pre>;
  }

  let newLineNum = parseInt(headerMatch[2], 10);
  const contentLines = lines.slice(1);

  // Determine language for syntax highlighting
  const language = filePath ? getLanguageFromPath(filePath) : 'javascript';
  const prismLanguage = Prism.languages[language] || Prism.languages.javascript;

  return (
    <div className="font-mono text-xs">
      {contentLines.map((line, idx) => {
        const isAddition = line.startsWith('+');
        const isDeletion = line.startsWith('-');
        const isContext = line.startsWith(' ');

        let lineNumber = null;
        if (isAddition || isContext) {
          lineNumber = newLineNum;
          newLineNum++;
        }

        const bgClass = isDarkMode
          ? isAddition
            ? 'bg-green-900/30 border-l-2 border-green-500'
            : isDeletion
            ? 'bg-red-900/30 border-l-2 border-red-500'
            : 'bg-transparent'
          : isAddition
          ? 'bg-green-100 border-l-2 border-green-600'
          : isDeletion
          ? 'bg-red-100 border-l-2 border-red-600'
          : 'bg-transparent';

        const symbol = isAddition ? '+' : isDeletion ? '-' : ' ';
        const content = line.substring(1);

        // Apply syntax highlighting to the code content
        let highlightedContent: string;
        try {
          highlightedContent = Prism.highlight(content, prismLanguage, language);
        } catch (error) {
          highlightedContent = content;
        }

        return (
          <div key={idx} className={`flex ${bgClass}`}>
            <span className="inline-block w-12 px-2 text-right text-light-text-muted dark:text-dark-text-muted select-none flex-shrink-0">
              {lineNumber || ''}
            </span>
            <span className={`inline-block w-6 px-1 flex-shrink-0 font-bold ${
              isDarkMode
                ? isAddition
                  ? 'text-green-300'
                  : isDeletion
                  ? 'text-red-300'
                  : 'text-gray-400'
                : isAddition
                ? 'text-green-700'
                : isDeletion
                ? 'text-red-700'
                : 'text-gray-600'
            }`}>
              {symbol}
            </span>
            <span
              className="flex-1 px-2 whitespace-pre overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: highlightedContent }}
              style={{
                filter: isAddition
                  ? 'brightness(1.1)'
                  : isDeletion
                  ? 'brightness(0.9)'
                  : 'none'
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// Helper function to convert GitHub reaction content to emoji
function reactionToEmoji(content: string): string {
  const emojiMap: { [key: string]: string } = {
    THUMBS_UP: '👍',
    THUMBS_DOWN: '👎',
    LAUGH: '😄',
    HOORAY: '🎉',
    CONFUSED: '😕',
    HEART: '❤️',
    ROCKET: '🚀',
    EYES: '👀',
  };
  return emojiMap[content] || content;
}

// Helper function to group reactions by emoji
function groupReactions(reactions?: { nodes: Array<{ content: string; user: { login: string } }> }) {
  if (!reactions?.nodes || reactions.nodes.length === 0) return [];

  const grouped: { [key: string]: { emoji: string; count: number; users: string[] } } = {};

  reactions.nodes.forEach(reaction => {
    const emoji = reactionToEmoji(reaction.content);
    if (!grouped[emoji]) {
      grouped[emoji] = { emoji, count: 0, users: [] };
    }
    grouped[emoji].count++;
    grouped[emoji].users.push(reaction.user.login);
  });

  return Object.values(grouped);
}

// Helper function to process mentions in markdown text
function processMentions(text: string): string {
  // Convert @username to **@username** to make it bold, which we'll then style
  return text.replace(/(@[\w-]+)/g, '**$1**');
}

// Helper function to render text with mentions highlighted (for ReactMarkdown components)
function renderTextWithMentions(children: any): any {
  // Handle different types of children
  if (typeof children === 'string') {
    const parts = children.split(/(@[\w-]+)/g);
    if (parts.length === 1) return children;

    return parts.map((part, idx) => {
      if (part.match(/^@[\w-]+$/)) {
        return (
          <span
            key={idx}
            className="font-semibold text-light-accent-primary dark:text-dark-accent-primary hover:underline cursor-pointer"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  }

  // Handle arrays of children
  if (Array.isArray(children)) {
    return children.map((child, idx) =>
      typeof child === 'string' ? (
        <span key={idx}>{renderTextWithMentions(child)}</span>
      ) : child
    );
  }

  return children;
}

// Helper function to organize review comments into threads
interface CommentThread {
  topLevelComment: any;
  replies: any[];
}

function organizeCommentsIntoThreads(comments: any[]): CommentThread[] {
  if (!comments || comments.length === 0) return [];

  // Create a map of comment ID to comment for quick lookupconst commentMap = new Map(comments.map(c => [c.id, c]));

  // Separate top-level comments and replies
  const topLevelComments: any[] = [];
  const repliesByParentId = new Map<string, any[]>();

  comments.forEach(comment => {
    if (comment.replyTo?.id) {
      // This is a reply
      const parentId = comment.replyTo.id;
      if (!repliesByParentId.has(parentId)) {
        repliesByParentId.set(parentId, []);
      }
      repliesByParentId.get(parentId)!.push(comment);
    } else {
      // This is a top-level comment
      topLevelComments.push(comment);
    }
  });

  // Build threads
  return topLevelComments.map(topComment => ({
    topLevelComment: topComment,
    replies: repliesByParentId.get(topComment.id) || []
  }));
}

// Mermaid diagram component
function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    if (ref.current && chart) {
      const renderDiagram = async () => {
        try {
          const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
          const { svg } = await mermaid.render(id, chart);
          setSvg(svg);
        } catch (error) {
          console.error('Mermaid rendering error:', error);
          setSvg(`<pre class="text-red-500">Error rendering diagram: ${error}</pre>`);
        }
      };
      renderDiagram();
    }
  }, [chart]);

  return (
    <div
      ref={ref}
      className="my-4 flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function PRDetailPage() {
  const { owner, repo, number } = useParams<{ owner: string; repo: string; number: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('conversation');
  const [isSettingUpReview, setIsSettingUpReview] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [showAIOptionsModal, setShowAIOptionsModal] = useState(false);
  const [pendingReviewData, setPendingReviewData] = useState<{ initialFilePath?: string; commentInfo?: any } | null>(null);
  const { theme } = useTheme();

  // Detect current theme for syntax highlighting
  const isDarkMode = theme === 'dark';

  // Check if AI Review exists for this PR via API
  const { data: aiReviewCheck } = useQuery({
    queryKey: ['ai-review-check', owner, repo, number],
    queryFn: async () => {
      if (!owner || !repo || !number) {
        return { exists: false };
      }
      try {
        const response = await fetch(`/api/prs/${owner}/${repo}/${number}/ai-review/check`);
        if (!response.ok) {
          console.error('[PRDetailPage] Failed to check AI review:', response.status);
          return { exists: false };
        }
        const data = await response.json();
        console.log('[PRDetailPage] AI review check result:', data);
        return data;
      } catch (error) {
        console.error('[PRDetailPage] Error checking AI review:', error);
        return { exists: false };
      }
    },
    enabled: !!(owner && repo && number),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  const hasAIReview = aiReviewCheck?.exists || false;

  // Initialize Mermaid with theme
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: isDarkMode ? 'dark' : 'default',
      securityLevel: 'loose',
      fontSize: 14,
    });
  }, [isDarkMode]);

  const { data: prData, isLoading } = useQuery({
    queryKey: ['pr', owner, repo, number],
    queryFn: async () => {
      const response = await fetch(`/api/prs/${owner}/${repo}/${number}`);
      if (!response.ok) throw new Error('Failed to fetch PR details');
      return response.json();
    },
  });

  const { data: authStatus } = useQuery({
    queryKey: ['authStatus'],
    queryFn: async () => {
      const response = await fetch('/api/auth/status');
      if (!response.ok) throw new Error('Failed to check auth status');
      return response.json();
    },
  });

  const { data: conversationData, isLoading: loadingConversation } = useQuery({
    queryKey: ['pr-conversation', owner, repo, number],
    queryFn: async () => {
      const response = await fetch(`/api/prs/${owner}/${repo}/${number}/conversation`);
      if (!response.ok) throw new Error('Failed to fetch conversation');
      const data = await response.json();
      console.log('[Conversation] Loaded conversation data:', data);
      console.log('[Conversation] Data structure keys:', Object.keys(data));

      // Extract conversation items from timelineItems and reviewThreads
      const timelineItems = data.timelineItems || [];
      const reviewThreads = data.reviewThreads || [];
      console.log('[Conversation] Timeline items count:', timelineItems.length);
      console.log('[Conversation] Review threads count:', reviewThreads.length);

      // Process timeline items and review threads
      const conversationItems: any[] = [];

      // Add timeline items (IssueComment and PullRequestReview)
      timelineItems.forEach((item: any, index: number) => {
        console.log(`[Timeline ${index}] Type: ${item.__typename}, ID: ${item.id}`);

        if (item.__typename === 'PullRequestReview') {
          console.log(`[Review ${index}] ID: ${item.id}, Has body: ${!!item.body}, Total comments: ${item.comments?.nodes?.length || 0}`);
          conversationItems.push(item);
        } else if (item.__typename === 'IssueComment') {
          console.log(`[IssueComment ${index}] ID: ${item.id}, Author: ${item.author?.login}`);
          conversationItems.push(item);
        }
      });

      // Add review threads (file-specific comment threads)
      reviewThreads.forEach((thread: any, index: number) => {
        const commentCount = thread.comments?.nodes?.length || 0;
        console.log(`[ReviewThread ${index}] ID: ${thread.id}, Comments: ${commentCount}, Resolved: ${thread.isResolved}`);
        if (commentCount > 0) {
          conversationItems.push(thread);
        }
      });

      // Sort conversation items chronologically by createdAt timestamp
      conversationItems.sort((a, b) => {
        const aTime = new Date(a.createdAt || a.comments?.nodes?.[0]?.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || b.comments?.nodes?.[0]?.createdAt || 0).getTime();
        return aTime - bTime;
      });

      console.log('[Conversation] Sorted conversation items chronologically');

      // Calculate total comment count (including all replies)
      let totalCommentCount = 0;
      conversationItems.forEach((item) => {
        if (item.__typename === 'IssueComment') {
          totalCommentCount += 1;
        } else if (item.__typename === 'PullRequestReview') {
          // Count review body as 1 if it exists
          // Note: inline comments are NOT counted here as they're already in PullRequestReviewThread
          if (item.body) totalCommentCount += 1;
        } else if (item.__typename === 'PullRequestReviewThread') {
          // Count all comments in thread (including replies)
          if (item.comments?.nodes) {
            totalCommentCount += item.comments.nodes.length;
          }
        }
      });

      console.log('[Conversation] Total conversation items:', conversationItems.length);
      console.log('[Conversation] Total comment count (including replies):', totalCommentCount);

      // Return data with conversation array for rendering
      return {
        ...data,
        conversation: conversationItems,
        totalCommentCount,
      };
    },
    enabled: activeTab === 'conversation' && !!owner && !!repo && !!number,
  });

  const handleShowAIOptionsModal = (initialFilePath?: string, commentInfo?: any) => {
    setPendingReviewData({ initialFilePath, commentInfo });
    setShowAIOptionsModal(true);
  };

  const handleStartReviewWithOptions = async (options: AIReviewOptions) => {
    if (!prData || isSettingUpReview) return;

    setIsSettingUpReview(true);
    setToast({ message: 'Setting up review environment... This may take a moment.', type: 'info' });

    try {
      // Call setup-review endpoint to create worktree
      const response = await fetch(`/api/prs/${owner}/${repo}/${number}/setup-review`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to setup review environment');
      }

      const data = await response.json();

      setToast({ message: 'Review environment ready! Loading...', type: 'success' });

      // Small delay to show success message
      setTimeout(() => {
        navigate('/review', {
          state: {
            worktreePath: data.worktreePath,
            baseBranch: prData.pullRequest.baseRefName,
            repoRoot: data.repoPath,
            prNumber: number,
            owner,
            repo,
            initialFilePath: pendingReviewData?.initialFilePath || undefined,
            commentInfo: pendingReviewData?.commentInfo || undefined,
            aiReviewOptions: options,
          },
        });
      }, 1000);
    } catch (error: any) {
      console.error('Failed to start review:', error);
      setToast({ message: error.message || 'Failed to setup review environment', type: 'error' });
      setIsSettingUpReview(false);
    }
  };

  const handleFilePathClick = async (filePath: string, comment: any) => {
    console.log('[PRDetail] Comment clicked:', {
      path: comment.path,
      line: comment.line,
      originalLine: comment.originalLine,
      position: comment.position,
      diffHunk: comment.diffHunk?.substring(0, 100),
    });

    handleShowAIOptionsModal(filePath, {
      body: comment.body,
      line: comment.line,
      originalLine: comment.originalLine,
      position: comment.position,
      path: comment.path,
      diffHunk: comment.diffHunk,
      author: comment.author,
      createdAt: comment.createdAt,
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Reaction handling
  const [reactionPickerOpen, setReactionPickerOpen] = useState<string | null>(null);
  const currentUser = authStatus?.username;

  const handleReactionClick = async (commentId: string, reactionContent: string, currentReactions: any) => {
    if (!owner || !repo || !currentUser) return;

    try {
      // Convert emoji to GitHub reaction content format
      const githubReactionContent = emojiToReactionContent(reactionContent);

      // Check if current user already reacted with this emoji
      const userHasReacted = currentReactions.nodes?.some(
        (r: any) => r.content === githubReactionContent && r.user?.login === currentUser
      );

      if (userHasReacted) {
        // Remove reaction
        await fetch(`/api/prs/${owner}/${repo}/reactions/remove`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commentId, reactionContent: githubReactionContent }),
        });
        setToast({ message: 'Reaction removed', type: 'success' });
      } else {
        // Add reaction
        await fetch(`/api/prs/${owner}/${repo}/reactions/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commentId, reactionContent: githubReactionContent }),
        });
        setToast({ message: 'Reaction added', type: 'success' });
      }

      // Refetch conversation data and PR data to update reactions
      queryClient.invalidateQueries({ queryKey: ['pr-conversation', owner, repo, number] });
      queryClient.invalidateQueries({ queryKey: ['pr', owner, repo, number] });
    } catch (error: any) {
      console.error('Failed to toggle reaction:', error);
      setToast({ message: 'Failed to update reaction', type: 'error' });
    }
  };

  const handleAddReaction = async (commentId: string, emoji: string, reactionContent: string) => {
    if (!owner || !repo) return;

    try {
      await fetch(`/api/prs/${owner}/${repo}/reactions/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, reactionContent }),
      });
      setToast({ message: 'Reaction added', type: 'success' });
      setReactionPickerOpen(null);

      // Refetch conversation data
      queryClient.invalidateQueries({ queryKey: ['pr-conversation', owner, repo, number] });
    } catch (error: any) {
      console.error('Failed to add reaction:', error);
      setToast({ message: 'Failed to add reaction', type: 'error' });
    }
  };

  // Common GitHub reactions
  const availableReactions = [
    { emoji: '👍', content: 'THUMBS_UP' },
    { emoji: '👎', content: 'THUMBS_DOWN' },
    { emoji: '😄', content: 'LAUGH' },
    { emoji: '🎉', content: 'HOORAY' },
    { emoji: '😕', content: 'CONFUSED' },
    { emoji: '❤️', content: 'HEART' },
    { emoji: '🚀', content: 'ROCKET' },
    { emoji: '👀', content: 'EYES' },
  ];

  // Convert emoji to GitHub reaction content
  const emojiToReactionContent = (emoji: string): string => {
    const reaction = availableReactions.find(r => r.emoji === emoji);
    return reaction?.content || emoji;
  };

  // Comment writing
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [commentText, setCommentText] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNewComment, setShowNewComment] = useState(false);

  const handleSubmitComment = async (commentId?: string, inReplyTo?: number) => {
    if (!owner || !repo || !number) return;

    const text = commentId ? commentText[commentId] : commentText['new'];
    if (!text || text.trim() === '') {
      setToast({ message: 'Comment cannot be empty', type: 'error' });
      return;
    }

    setIsSubmitting(true);

    try {
      if (inReplyTo) {
        // Reply to a comment
        await fetch(`/api/prs/${owner}/${repo}/${number}/comment-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text, inReplyTo }),
        });
        setToast({ message: 'Reply added successfully', type: 'success' });
      } else {
        // Add a general comment
        await fetch(`/api/prs/${owner}/${repo}/${number}/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
        });
        setToast({ message: 'Comment added successfully', type: 'success' });
      }

      // Clear the text and close the input
      setCommentText((prev) => ({ ...prev, [commentId || 'new']: '' }));
      setReplyingTo(null);
      setShowNewComment(false);

      // Refetch conversation data
      queryClient.invalidateQueries({ queryKey: ['pr-conversation', owner, repo, number] });
    } catch (error: any) {
      console.error('Failed to submit comment:', error);
      setToast({ message: 'Failed to submit comment', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelComment = (commentId?: string) => {
    setCommentText((prev) => ({ ...prev, [commentId || 'new']: '' }));
    setReplyingTo(null);
    setShowNewComment(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-light-text-secondary dark:text-dark-text-secondary">
            Loading PR details...
          </p>
        </div>
      </div>
    );
  }

  if (!prData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light-bg dark:bg-dark-bg">
        <div className="text-center">
          <p className="text-light-text-primary dark:text-dark-text-primary text-lg">
            PR not found
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg">
      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* AI Review Options Modal */}
      <AIReviewOptionsModal
        isOpen={showAIOptionsModal}
        onClose={() => {
          setShowAIOptionsModal(false);
          setPendingReviewData(null);
        }}
        onConfirm={handleStartReviewWithOptions}
      />

      {/* Header */}
      <header className="border-b border-light-border dark:border-dark-border bg-light-surface/80 dark:bg-dark-surface/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => navigate('/')}
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-light-accent-primary to-light-accent-secondary dark:from-dark-accent-primary dark:to-dark-accent-secondary flex items-center justify-center text-white font-bold text-lg shadow-lg">
                H
              </div>
              <div>
                <h1 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary">
                  HighReview
                </h1>
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                  Pull Request #{number}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {authStatus?.authenticated && (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">
                    {authStatus.user.username}
                  </p>
                </div>
              </div>
            )}
            <LanguageSelector />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => navigate('/prs')}
            className="mb-4 flex items-center gap-2 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-accent-primary dark:hover:text-dark-accent-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to PR List
          </button>

          {/* PR Header Card */}
          <div className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-md mb-4 overflow-hidden">
            {/* Header Section */}
            <div className="bg-light-surface-elevated dark:bg-dark-surface-elevated border-b border-light-border dark:border-dark-border p-6">
              <div className="flex gap-4">
                {/* Left Section: 90% */}
                <div className="flex-1">
                  {/* First Row: PR Title + Author Info */}
                  <div className="mb-4">
                    <h1 className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary mb-2">
                      {prData.pullRequest.title}
                    </h1>
                    <div className="flex items-center gap-4 text-sm text-light-text-muted dark:text-dark-text-muted">
                      <span className="font-medium">
                        {owner}/{repo} #{number}
                      </span>
                      <span>•</span>
                      <span>
                        <span className="font-medium text-light-text-secondary dark:text-dark-text-secondary">{prData.pullRequest.author}</span>
                        {' '}wants to merge into{' '}
                        <span className="font-medium text-light-text-secondary dark:text-dark-text-secondary">{prData.pullRequest.baseRefName}</span>
                      </span>
                      {prData.pullRequest.createdAt && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Created {new Date(prData.pullRequest.createdAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Second Row: View on GitHub + Status Badges */}
                  <div className="flex items-center gap-3">
                    <a
                      href={prData.pullRequest.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full bg-white dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary border border-light-border dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-border transition-colors"
                      title="View on GitHub"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
                      </svg>
                      View on GitHub
                    </a>
                    <span
                      className={`px-3 py-1 text-xs font-medium rounded-full ${
                        prData.pullRequest.state === 'OPEN'
                          ? 'bg-light-accent-success/10 text-light-accent-success dark:bg-dark-accent-success/10 dark:text-dark-accent-success border border-light-accent-success/20 dark:border-dark-accent-success/20'
                          : 'bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-muted dark:text-dark-text-muted border border-light-border dark:border-dark-border'
                      }`}
                    >
                      {prData.pullRequest.state === 'OPEN' ? 'Open' : 'Closed'}
                    </span>
                    {hasAIReview && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 dark:from-purple-400/10 dark:to-blue-400/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 dark:border-purple-400/30" title="AI Review completed">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M13 7H7v6h6V7z" />
                          <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd" />
                        </svg>
                        AI Reviewed
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Section: 10% - Start Review Button (Full Height) */}
                <div className="w-[10%] min-w-[120px]">
                  <button
                    onClick={() => handleShowAIOptionsModal()}
                    disabled={isSettingUpReview}
                    className="w-full h-full px-4 py-3 bg-gradient-to-br from-light-accent-primary to-light-accent-secondary dark:from-dark-accent-primary dark:to-dark-accent-secondary text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-2"
                  >
                    {isSettingUpReview && (
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    <span className="text-sm whitespace-nowrap">{isSettingUpReview ? 'Setting up...' : 'Start Review'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Body Section */}
            {prData.pullRequest.body && (
              <div className="p-6">
                <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-light-text-primary dark:prose-headings:text-dark-text-primary prose-p:text-light-text-primary dark:prose-p:text-dark-text-primary prose-a:text-light-accent-primary dark:prose-a:text-dark-accent-primary prose-strong:text-light-text-primary dark:prose-strong:text-dark-text-primary prose-code:text-light-accent-secondary dark:prose-code:text-dark-accent-secondary prose-pre:bg-light-surface-elevated dark:prose-pre:bg-dark-surface-elevated prose-li:text-light-text-primary dark:prose-li:text-dark-text-primary">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    rehypePlugins={[rehypeRaw, rehypeSanitize]}
                    components={{
                      h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-4 text-light-text-primary dark:text-dark-text-primary" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-xl font-bold mb-3 pb-2 border-b border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-lg font-bold mb-2 text-light-text-primary dark:text-dark-text-primary" {...props} />,
                      h4: ({node, ...props}) => <h4 className="text-base font-bold mb-2 text-light-text-primary dark:text-dark-text-primary" {...props} />,
                      h5: ({node, ...props}) => <h5 className="text-sm font-bold mb-1 text-light-text-primary dark:text-dark-text-primary" {...props} />,
                      h6: ({node, ...props}) => <h6 className="text-xs font-bold mb-1 text-light-text-primary dark:text-dark-text-primary" {...props} />,
                      p: ({node, ...props}) => <p className="mb-4 leading-normal text-light-text-primary dark:text-dark-text-primary" {...props} />,
                      a: ({node, ...props}) => <a className="text-light-accent-primary dark:text-dark-accent-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                      strong: ({node, children, ...props}) => {
                        const text = typeof children === 'string' ? children : String(children);
                        if (text.match(/^@[\w-]+$/)) {
                          return (
                            <span className="font-semibold text-light-accent-primary dark:text-dark-accent-primary hover:underline cursor-pointer">
                              {children}
                            </span>
                          );
                        }
                        return <strong className="font-bold text-light-text-primary dark:text-dark-text-primary" {...props}>{children}</strong>;
                      },
                      em: ({node, ...props}) => <em className="italic" {...props} />,
                      code: ({node, inline, className, children, ...props}: any) => {
                        const match = /language-(\w+)/.exec(className || '');
                        const language = match ? match[1] : 'text';

                        if (inline) {
                          return (
                            <code className="px-1.5 py-0.5 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary font-mono text-xs border border-light-border dark:border-dark-border" {...props}>
                              {children}
                            </code>
                          );
                        }

                        // Handle Mermaid diagrams
                        if (language === 'mermaid') {
                          return <MermaidDiagram chart={String(children)} />;
                        }

                        return (
                          <SyntaxHighlighter
                            style={isDarkMode ? oneDark : oneLight}
                            language={language}
                            PreTag="div"
                            customStyle={{
                              margin: 0,
                              borderRadius: '0.5rem',
                              fontSize: '0.875rem',
                            }}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        );
                      },
                      pre: ({ children }) => <div className="my-4">{children}</div>,
                      ul: ({node, ...props}) => <ul className="list-disc ml-1.5 mb-4 space-y-1 text-light-text-primary dark:text-dark-text-primary marker:text-light-text-primary dark:marker:text-dark-text-primary [&_ul]:list-[circle] [&_ul]:ml-1.5 [&_ul_ul]:list-[square] [&_ul_ul]:ml-1.5" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal ml-1.5 mb-4 space-y-1 text-light-text-primary dark:text-dark-text-primary marker:text-light-text-primary dark:marker:text-dark-text-primary [&_ol]:ml-1.5" {...props} />,
                      li: ({node, children, ...props}) => {
                        // Check if this is a task list item
                        const className = node?.properties?.className;
                        const hasCheckbox = Array.isArray(className) ? className.includes('task-list-item') : typeof className === 'string' && className.includes('task-list-item');
                        if (hasCheckbox) {
                          return (
                            <li className="flex items-center gap-2 text-light-text-primary dark:text-dark-text-primary list-none pl-0" {...props}>
                              {children}
                            </li>
                          );
                        }
                        return <li className="text-light-text-primary dark:text-dark-text-primary pl-0" {...props}>{children}</li>;
                      },
                      input: ({node, ...props}) => {
                        // Style checkboxes in task lists
                        if (props.type === 'checkbox') {
                          return (
                            <input
                              type="checkbox"
                              disabled
                              className="mr-2 h-4 w-4 rounded border-light-border dark:border-dark-border"
                              {...props}
                            />
                          );
                        }
                        return <input {...props} />;
                      },
                      blockquote: ({node, children, ...props}) => {
                        // Check if this is a GitHub alert/admonition
                        const childrenText = String(children);
                        const alertMatch = childrenText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/);

                        if (alertMatch) {
                          const alertType = alertMatch[1].toLowerCase();
                          const alertStyles = {
                            note: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100',
                            tip: 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100',
                            important: 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-100',
                            warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-100',
                            caution: 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100',
                          };
                          const alertIcons = {
                            note: '💡',
                            tip: '✅',
                            important: '⚠️',
                            warning: '⚠️',
                            caution: '🚫',
                          };
                          const style = alertStyles[alertType as keyof typeof alertStyles] || alertStyles.note;
                          const icon = alertIcons[alertType as keyof typeof alertIcons] || '📝';

                          return (
                            <div className={`border-l-4 ${style} p-4 rounded-r-lg my-4`}>
                              <div className="flex items-start gap-2">
                                <span className="text-xl flex-shrink-0">{icon}</span>
                                <div className="flex-1">
                                  <div className="font-bold uppercase text-sm mb-1">{alertType}</div>
                                  <div className="not-italic">{children}</div>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return <blockquote className="border-l-4 border-light-accent-primary dark:border-dark-accent-primary pl-4 italic my-4 text-light-text-primary dark:text-dark-text-primary" {...props}>{children}</blockquote>;
                      },
                      hr: ({node, ...props}) => <hr className="my-6 border-light-border dark:border-dark-border" {...props} />,
                      table: ({node, ...props}) => (
                        <div className="overflow-x-auto my-4">
                          <table className="min-w-full border border-light-border dark:border-dark-border rounded-lg" {...props} />
                        </div>
                      ),
                      thead: ({node, ...props}) => <thead className="bg-light-surface-elevated dark:bg-dark-surface-elevated" {...props} />,
                      tbody: ({node, ...props}) => <tbody className="divide-y divide-light-border dark:divide-dark-border" {...props} />,
                      tr: ({node, ...props}) => <tr className="hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors" {...props} />,
                      th: ({node, ...props}) => <th className="px-4 py-3 text-left font-semibold text-sm text-light-text-primary dark:text-dark-text-primary border-b-2 border-light-border dark:border-dark-border" {...props} />,
                      td: ({node, ...props}) => <td className="px-4 py-3 text-sm text-light-text-primary dark:text-dark-text-primary" {...props} />,
                    }}
                  >
                    {processMentions(prData.pullRequest.body)}
                  </ReactMarkdown>
                </div>

                {/* PR Body Reactions */}
                {prData.pullRequest.reactions && (
                  <div className="px-6 pb-6">
                    <div className="flex items-center gap-2 flex-wrap border-t border-light-border dark:border-dark-border pt-4">
                      {(() => {
                        const reactions = groupReactions(prData.pullRequest.reactions);
                        return (
                          <>
                            {reactions.map((reaction, idx) => {
                              // Find the original GitHub content for this emoji
                              const originalContent = prData.pullRequest.reactions?.nodes?.find(
                                (r: any) => reactionToEmoji(r.content) === reaction.emoji
                              )?.content;
                              const userHasReacted = prData.pullRequest.reactions?.nodes?.some(
                                (r: any) => reactionToEmoji(r.content) === reaction.emoji && r.user?.login === currentUser
                              );
                              return (
                                <button
                                  key={idx}
                                  onClick={() => handleReactionClick(prData.pullRequest.id, reaction.emoji, prData.pullRequest.reactions)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-full transition-colors ${
                                    userHasReacted
                                      ? 'border-light-accent-primary dark:border-dark-accent-primary bg-light-accent-primary/10 dark:bg-dark-accent-primary/10'
                                      : 'border-light-border dark:border-dark-border hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated'
                                  }`}
                                  title={reaction.users.join(', ')}
                                >
                                  <span>{reaction.emoji}</span>
                                  <span className="text-light-text-secondary dark:text-dark-text-secondary font-medium">{reaction.count}</span>
                                </button>
                              );
                            })}

                            {/* Add Reaction Button */}
                            <div className="relative">
                              <button
                                onClick={() => setReactionPickerOpen(reactionPickerOpen === 'pr-body' ? null : 'pr-body')}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-light-border dark:border-dark-border rounded-full hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors"
                              >
                                <span>😊</span>
                                <span className="text-light-text-secondary dark:text-dark-text-secondary">+</span>
                              </button>

                              {reactionPickerOpen === 'pr-body' && (
                                <>
                                  <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setReactionPickerOpen(null)}
                                  />
                                  <div className="absolute left-0 bottom-full mb-2 p-2 bg-light-surface dark:bg-dark-surface rounded-lg shadow-xl border border-light-border dark:border-dark-border z-20 flex gap-1">
                                    {availableReactions.map(({ emoji }) => (
                                      <button
                                        key={emoji}
                                        onClick={() => {
                                          handleReactionClick(prData.pullRequest.id, emoji, prData.pullRequest.reactions);
                                          setReactionPickerOpen(null);
                                        }}
                                        className="text-xl hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated rounded p-1.5 transition-colors"
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg overflow-hidden">
            <div className="border-b border-light-border dark:border-dark-border flex">
              <button
                onClick={() => setActiveTab('conversation')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'conversation'
                    ? 'border-b-2 border-light-accent-primary dark:border-dark-accent-primary text-light-accent-primary dark:text-dark-accent-primary'
                    : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary'
                }`}
              >
                Conversation
                {conversationData?.totalCommentCount !== undefined && (
                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-light-surface-elevated dark:bg-dark-surface-elevated">
                    {conversationData.totalCommentCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('commits')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'commits'
                    ? 'border-b-2 border-light-accent-primary dark:border-dark-accent-primary text-light-accent-primary dark:text-dark-accent-primary'
                    : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary'
                }`}
              >
                Commits
                {prData?.commits && (
                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-light-surface-elevated dark:bg-dark-surface-elevated">
                    {prData.commits.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('checks')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'checks'
                    ? 'border-b-2 border-light-accent-primary dark:border-dark-accent-primary text-light-accent-primary dark:text-dark-accent-primary'
                    : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary'
                }`}
              >
                Checks
              </button>
              <button
                onClick={() => setActiveTab('files')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'files'
                    ? 'border-b-2 border-light-accent-primary dark:border-dark-accent-primary text-light-accent-primary dark:text-dark-accent-primary'
                    : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary'
                }`}
              >
                Files Changed
                {prData?.files && (
                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-light-surface-elevated dark:bg-dark-surface-elevated">
                    {prData.files.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'conversation' && (
                <div className="space-y-3">
                  {loadingConversation ? (
                    <div className="text-center py-12">
                      <div className="w-8 h-8 border-4 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-light-text-secondary dark:text-dark-text-secondary">
                        Loading conversation...
                      </p>
                    </div>
                  ) : conversationData?.conversation && conversationData.conversation.length > 0 ? (
                    conversationData.conversation.map((item: any, index: number) => {
                      const prAuthor = conversationData.prAuthor;

                      if (item.__typename === 'IssueComment') {
                        const isAuthor = item.author?.login === prAuthor;
                        const reactions = groupReactions(item.reactions);

                        return (
                          <div key={item.id || index} className="flex gap-3">
                            {/* Avatar */}
                            <img
                              src={item.author?.avatarUrl || 'https://github.com/identicons/default.png'}
                              alt={item.author?.login || 'User'}
                              className="w-10 h-10 rounded-full flex-shrink-0"
                            />

                            {/* Comment Content */}
                            <div className="flex-1 min-w-0 border border-light-border dark:border-dark-border rounded-md overflow-hidden">
                              {/* Comment Header */}
                              <div className="px-4 py-2 bg-light-surface-elevated dark:bg-dark-surface-elevated border-b border-light-border dark:border-dark-border">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm text-light-text-primary dark:text-dark-text-primary">
                                    {item.author?.login || 'Unknown'}
                                  </span>
                                  {isAuthor && (
                                    <span className="px-1.5 py-0.5 text-xs font-medium border border-light-border dark:border-dark-border rounded text-light-text-secondary dark:text-dark-text-secondary">
                                      Author
                                    </span>
                                  )}
                                  <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                                    commented {new Date(item.createdAt).toLocaleString()}
                                  </span>
                                </div>
                              </div>

                              {/* Comment Body */}
                              <div className="px-4 py-3 bg-light-surface dark:bg-dark-surface">
                                <div className="prose prose-sm dark:prose-invert max-w-none text-light-text-primary dark:text-dark-text-primary">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm, remarkBreaks]}
                                    rehypePlugins={[rehypeRaw, rehypeSanitize]}
                                    components={{
                                      pre: ({ children }) => <pre className="my-4 not-prose">{children}</pre>,
                                      p: ({node, children, ...props}) => {
                                        // Check if children contains code blocks (to avoid <p><div> nesting)
                                        const hasCodeBlock = React.Children.toArray(children).some((child: any) => {
                                          return child?.props?.className?.includes('language-');
                                        });
                                        const Element = hasCodeBlock ? 'div' : 'p';
                                        return (
                                          <Element className="mb-2 last:mb-0 text-light-text-primary dark:text-dark-text-primary leading-relaxed" {...props}>
                                            {children}
                                          </Element>
                                        );
                                      },
                                      a: ({node, ...props}) => <a className="text-light-accent-primary dark:text-dark-accent-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                                      strong: ({node, children, ...props}) => {
                                        const text = typeof children === 'string' ? children : String(children);
                                        if (text.match(/^@[\w-]+$/)) {
                                          return (
                                            <span className="font-semibold text-light-accent-primary dark:text-dark-accent-primary hover:underline cursor-pointer">
                                              {children}
                                            </span>
                                          );
                                        }
                                        return <strong className="font-semibold text-light-text-primary dark:text-dark-text-primary" {...props}>{children}</strong>;
                                      },
                                      blockquote: ({node, children, ...props}) => {
                                        const childrenText = String(children);
                                        const alertMatch = childrenText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/);
                                        if (alertMatch) {
                                          const alertType = alertMatch[1].toLowerCase();
                                          const alertStyles = { note: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100', tip: 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100', important: 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-100', warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-100', caution: 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100' };
                                          const alertIcons = { note: '💡', tip: '✅', important: '⚠️', warning: '⚠️', caution: '🚫' };
                                          const style = alertStyles[alertType as keyof typeof alertStyles] || alertStyles.note;
                                          const icon = alertIcons[alertType as keyof typeof alertIcons] || '📝';
                                          return (<div className={`border-l-4 ${style} p-4 rounded-r-lg my-4`}><div className="flex items-start gap-2"><span className="text-xl flex-shrink-0">{icon}</span><div className="flex-1"><div className="font-bold uppercase text-sm mb-1">{alertType}</div><div className="not-italic">{children}</div></div></div></div>);
                                        }
                                        return <blockquote className="border-l-4 border-light-accent-primary dark:border-dark-accent-primary pl-4 italic my-4 text-light-text-primary dark:text-dark-text-primary" {...props}>{children}</blockquote>;
                                      },
                                      li: ({node, children, ...props}) => {
                                        const className = node?.properties?.className;
                                        const hasCheckbox = Array.isArray(className) ? className.includes('task-list-item') : typeof className === 'string' && className.includes('task-list-item');
                                        if (hasCheckbox) return (<li className="flex items-center gap-2 text-light-text-primary dark:text-dark-text-primary list-none" {...props}>{children}</li>);
                                        return <li className="text-light-text-primary dark:text-dark-text-primary" {...props}>{children}</li>;
                                      },
                                      input: ({node, ...props}) => {
                                        if (props.type === 'checkbox') return (<input type="checkbox" disabled className="mr-2 h-4 w-4 rounded border-light-border dark:border-dark-border" {...props} />);
                                        return <input {...props} />;
                                      },
                                      table: ({node, ...props}) => (<div className="overflow-x-auto my-4"><table className="min-w-full border border-light-border dark:border-dark-border rounded-lg" {...props} /></div>),
                                      thead: ({node, ...props}) => <thead className="bg-light-surface-elevated dark:bg-dark-surface-elevated" {...props} />,
                                      tbody: ({node, ...props}) => <tbody className="divide-y divide-light-border dark:divide-dark-border" {...props} />,
                                      tr: ({node, ...props}) => <tr className="hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors" {...props} />,
                                      th: ({node, ...props}) => <th className="px-4 py-3 text-left font-semibold text-sm text-light-text-primary dark:text-dark-text-primary border-b-2 border-light-border dark:border-dark-border" {...props} />,
                                      td: ({node, ...props}) => <td className="px-4 py-3 text-sm text-light-text-primary dark:text-dark-text-primary" {...props} />,
                                      code: ({node, inline, className, children, ...props}: any) => {
                                        const match = /language-(\w+)/.exec(className || '');
                                        const language = match ? match[1] : 'text';

                                        // Inline code
                                        if (inline) {
                                          return (
                                            <code className="px-1.5 py-0.5 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary font-mono text-xs border border-light-border dark:border-dark-border" {...props}>
                                              {children}
                                            </code>
                                          );
                                        }

                                        // Handle Mermaid diagrams
                                        if (language === 'mermaid') return <MermaidDiagram chart={String(children)} />;

                                        // Block code
                                        return (
                                          <SyntaxHighlighter
                                            style={isDarkMode ? oneDark : oneLight}
                                            language={language}
                                            PreTag="div"
                                            customStyle={{ margin: 0, borderRadius: '0.375rem', fontSize: '0.75rem' }}
                                          >
                                            {String(children).replace(/\n$/, '')}
                                          </SyntaxHighlighter>
                                        );
                                      },
                                    }}
                                  >
                                    {processMentions(item.body)}
                                  </ReactMarkdown>
                                </div>

                                {/* Reactions */}
                                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-light-border dark:border-dark-border">
                                  {reactions.length > 0 && reactions.map((reaction, idx) => {
                                    const userHasReacted = item.reactions?.nodes?.some(
                                      (r: any) => r.content === reaction.content && r.user?.login === currentUser
                                    );
                                    return (
                                      <button
                                        key={idx}
                                        onClick={() => handleReactionClick(item.id, reaction.content, item.reactions)}
                                        className={`flex items-center gap-1 px-2 py-1 text-xs border rounded-full transition-colors ${
                                          userHasReacted
                                            ? 'border-light-accent-primary dark:border-dark-accent-primary bg-light-accent-primary/10 dark:bg-dark-accent-primary/10'
                                            : 'border-light-border dark:border-dark-border hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated'
                                        }`}
                                        title={reaction.users.join(', ')}
                                      >
                                        <span>{reaction.emoji}</span>
                                        <span className="text-light-text-secondary dark:text-dark-text-secondary font-medium">{reaction.count}</span>
                                      </button>
                                    );
                                  })}
                                  {/* Add reaction button */}
                                  <div className="relative">
                                    <button
                                      onClick={() => setReactionPickerOpen(reactionPickerOpen === item.id ? null : item.id)}
                                      className="flex items-center justify-center w-7 h-7 text-xs border border-light-border dark:border-dark-border rounded-full hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors"
                                      title="Add reaction"
                                    >
                                      <span className="text-light-text-muted dark:text-dark-text-muted">😊</span>
                                    </button>
                                    {/* Reaction Picker */}
                                    {reactionPickerOpen === item.id && (
                                      <div className="absolute left-0 bottom-full mb-2 p-2 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-lg z-10 flex gap-1">
                                        {availableReactions.map((r) => (
                                          <button
                                            key={r.content}
                                            onClick={() => handleAddReaction(item.id, r.emoji, r.content)}
                                            className="w-8 h-8 flex items-center justify-center hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated rounded transition-colors"
                                            title={r.content}
                                          >
                                            {r.emoji}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      } else if (item.__typename === 'PullRequestReview') {
                        return (
                          <div key={item.id || index} className="flex gap-4">
                            {/* Avatar */}
                            <div className="flex-shrink-0">
                              <img
                                src={item.author?.avatarUrl || 'https://github.com/identicons/default.png'}
                                alt={item.author?.login || 'User'}
                                className="w-10 h-10 rounded-full border-2 border-light-border dark:border-dark-border"
                              />
                            </div>

                            {/* Review Content */}
                            <div className="flex-1 min-w-0">
                              <div className="border border-light-border dark:border-dark-border rounded-lg overflow-hidden">
                                {/* Review Header */}
                                <div className="px-4 py-2 bg-light-surface-elevated dark:bg-dark-surface-elevated border-b border-light-border dark:border-dark-border flex items-center gap-2">
                                  <span className="font-semibold text-light-text-primary dark:text-dark-text-primary">
                                    {item.author?.login || 'Unknown'}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                      item.state === 'APPROVED'
                                        ? 'bg-light-accent-success dark:bg-dark-accent-success text-white'
                                        : item.state === 'CHANGES_REQUESTED'
                                          ? 'bg-light-accent-error dark:bg-dark-accent-error text-white'
                                          : 'bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-muted dark:text-dark-text-muted'
                                    }`}
                                  >
                                    {item.state === 'APPROVED' ? 'Approved' : item.state === 'CHANGES_REQUESTED' ? 'Changes requested' : 'Commented'}
                                  </span>
                                  <span className="text-light-text-muted dark:text-dark-text-muted text-sm">
                                    {new Date(item.createdAt).toLocaleString()}
                                  </span>
                                </div>

                                {/* Review Body */}
                                {item.body && (
                                  <div className="px-4 py-3 bg-light-surface dark:bg-dark-surface border-b border-light-border dark:border-dark-border">
                                    <div className="prose prose-sm dark:prose-invert max-w-none text-light-text-secondary dark:text-dark-text-secondary">
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm, remarkBreaks]}
                                        rehypePlugins={[rehypeRaw, rehypeSanitize]}
                                        components={{
                                          pre: ({ children }) => <div className="my-4 not-prose">{children}</div>,
                                          p: ({node, children, ...props}) => {
                                            const hasCodeBlock = React.Children.toArray(children).some((child: any) => {
                                              return child?.props?.className?.includes('language-');
                                            });
                                            const Element = hasCodeBlock ? 'div' : 'p';
                                            return (
                                              <Element className="mb-2 text-light-text-secondary dark:text-dark-text-secondary" {...props}>
                                                {children}
                                              </Element>
                                            );
                                          },
                                          a: ({node, ...props}) => <a className="text-light-accent-primary dark:text-dark-accent-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                                          strong: ({node, children, ...props}) => {
                                            const text = typeof children === 'string' ? children : String(children);
                                            if (text.match(/^@[\w-]+$/)) {
                                              return (
                                                <span className="font-semibold text-light-accent-primary dark:text-dark-accent-primary hover:underline cursor-pointer">
                                                  {children}
                                                </span>
                                              );
                                            }
                                            return <strong className="font-bold text-light-text-primary dark:text-dark-text-primary" {...props}>{children}</strong>;
                                          },
                                          blockquote: ({node, children, ...props}) => {
                                            const childrenText = String(children);
                                            const alertMatch = childrenText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/);
                                            if (alertMatch) {
                                              const alertType = alertMatch[1].toLowerCase();
                                              const alertStyles = { note: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100', tip: 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100', important: 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-100', warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-100', caution: 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100' };
                                              const alertIcons = { note: '💡', tip: '✅', important: '⚠️', warning: '⚠️', caution: '🚫' };
                                              const style = alertStyles[alertType as keyof typeof alertStyles] || alertStyles.note;
                                              const icon = alertIcons[alertType as keyof typeof alertIcons] || '📝';
                                              return (<div className={`border-l-4 ${style} p-4 rounded-r-lg my-4`}><div className="flex items-start gap-2"><span className="text-xl flex-shrink-0">{icon}</span><div className="flex-1"><div className="font-bold uppercase text-sm mb-1">{alertType}</div><div className="not-italic">{children}</div></div></div></div>);
                                            }
                                            return <blockquote className="border-l-4 border-light-accent-primary dark:border-dark-accent-primary pl-4 italic my-4 text-light-text-primary dark:text-dark-text-primary" {...props}>{children}</blockquote>;
                                          },
                                          li: ({node, children, ...props}) => {
                                            const className = node?.properties?.className;
                                            const hasCheckbox = Array.isArray(className) ? className.includes('task-list-item') : typeof className === 'string' && className.includes('task-list-item');
                                            if (hasCheckbox) return (<li className="flex items-center gap-2 text-light-text-primary dark:text-dark-text-primary list-none" {...props}>{children}</li>);
                                            return <li className="text-light-text-primary dark:text-dark-text-primary" {...props}>{children}</li>;
                                          },
                                          input: ({node, ...props}) => {
                                            if (props.type === 'checkbox') return (<input type="checkbox" disabled className="mr-2 h-4 w-4 rounded border-light-border dark:border-dark-border" {...props} />);
                                            return <input {...props} />;
                                          },
                                          table: ({node, ...props}) => (<div className="overflow-x-auto my-4"><table className="min-w-full border border-light-border dark:border-dark-border rounded-lg" {...props} /></div>),
                                          thead: ({node, ...props}) => <thead className="bg-light-surface-elevated dark:bg-dark-surface-elevated" {...props} />,
                                          tbody: ({node, ...props}) => <tbody className="divide-y divide-light-border dark:divide-dark-border" {...props} />,
                                          tr: ({node, ...props}) => <tr className="hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors" {...props} />,
                                          th: ({node, ...props}) => <th className="px-4 py-3 text-left font-semibold text-sm text-light-text-primary dark:text-dark-text-primary border-b-2 border-light-border dark:border-dark-border" {...props} />,
                                          td: ({node, ...props}) => <td className="px-4 py-3 text-sm text-light-text-primary dark:text-dark-text-primary" {...props} />,
                                          code: ({node, inline, className, children, ...props}: any) => {
                                            const match = /language-(\w+)/.exec(className || '');
                                            const language = match ? match[1] : 'text';

                                            if (inline) {
                                              return (
                                                <code className="px-1.5 py-0.5 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary font-mono text-xs border border-light-border dark:border-dark-border" {...props}>
                                                  {children}
                                                </code>
                                              );
                                            }

                                            // Handle Mermaid diagrams
                                            if (language === 'mermaid') return <MermaidDiagram chart={String(children)} />;

                                            return (
                                              <SyntaxHighlighter
                                                style={isDarkMode ? oneDark : oneLight}
                                                language={language}
                                                PreTag="div"
                                                customStyle={{
                                                  margin: 0,
                                                  borderRadius: '0.375rem',
                                                  fontSize: '0.75rem',
                                                }}
                                              >
                                                {String(children).replace(/\n$/, '')}
                                              </SyntaxHighlighter>
                                            );
                                          },
                                        }}
                                      >
                                        {processMentions(item.body)}
                                      </ReactMarkdown>
                                    </div>
                                  </div>
                                )}

                                {/* Note: Inline comments from PullRequestReview are not displayed here
                                    as they are already shown in PullRequestReviewThread sections below */}
                              </div>
                            </div>
                          </div>
                        );
                      } else if (item.__typename === 'PullRequestReviewThread') {
                        if (!item.comments?.nodes || item.comments.nodes.length === 0) return null;

                        const firstComment = item.comments.nodes[0];
                        const lineNumbers = extractLineNumbers(firstComment.diffHunk);

                        return (
                          <div key={item.id || index} className="border border-light-border dark:border-dark-border rounded-md overflow-hidden my-6">
                            {/* File Path and Line Numbers */}
                            <div className="px-4 py-2 bg-light-surface-elevated dark:bg-dark-surface-elevated border-b border-light-border dark:border-dark-border">
                              <div className="flex items-center justify-between">
                                <button
                                  onClick={() => handleFilePathClick(firstComment.path, firstComment)}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary hover:text-light-accent-primary dark:hover:text-dark-accent-primary transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  <span className="font-mono">{firstComment.path}</span>
                                  {lineNumbers && (
                                    <span className="text-light-text-muted dark:text-dark-text-muted">
                                      • Comment on lines {lineNumbers.startLine} to {lineNumbers.endLine}
                                    </span>
                                  )}
                                </button>
                                <div className="flex items-center gap-2">
                                  {item.isOutdated && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-muted dark:text-dark-text-muted border border-light-border dark:border-dark-border font-medium">
                                      Outdated
                                    </span>
                                  )}
                                  {item.isResolved && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-light-accent-success/10 dark:bg-dark-accent-success/10 text-light-accent-success dark:text-dark-accent-success font-medium">
                                      Resolved
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Code Context (only for first comment) */}
                            {firstComment.diffHunk && (
                              <div className="border-b border-light-border dark:border-dark-border">
                                <div className="bg-light-surface dark:bg-dark-surface px-3 py-1.5 border-b border-light-border dark:border-dark-border flex items-center justify-between">
                                  <span className="text-xs font-mono text-light-text-muted dark:text-dark-text-muted">Code</span>
                                  {lineNumbers && (
                                    <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                                      Lines {lineNumbers.startLine}-{lineNumbers.endLine}
                                    </span>
                                  )}
                                </div>
                                <div className="overflow-x-auto">
                                  {renderDiffWithLineNumbers(firstComment.diffHunk, isDarkMode, firstComment.path)}
                                </div>
                              </div>
                            )}

                            {/* Thread Comments */}
                            <div className="bg-light-surface dark:bg-dark-surface">
                              {/* First comment (original) */}
                              {item.comments.nodes.length > 0 && (() => {
                                const comment = item.comments.nodes[0];
                                const isAuthor = comment.author?.login === prAuthor;
                                const reactions = groupReactions(comment.reactions);

                                return (
                                  <div key={comment.id} className="p-3 border-b border-light-border dark:border-dark-border">
                                    <div className="flex gap-2">
                                      <img
                                        src={comment.author?.avatarUrl || 'https://github.com/identicons/default.png'}
                                        alt={comment.author?.login || 'User'}
                                        className="w-8 h-8 rounded-full flex-shrink-0"
                                      />
                                      <div className="flex-1 min-w-0">
                                        {/* Comment Header */}
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                          <span className="font-semibold text-sm text-light-text-primary dark:text-dark-text-primary">
                                            {comment.author?.login || 'Unknown'}
                                          </span>
                                          {isAuthor && (
                                            <span className="px-1.5 py-0.5 text-xs font-medium border border-light-border dark:border-dark-border rounded text-light-text-secondary dark:text-dark-text-secondary">
                                              Author
                                            </span>
                                          )}
                                          <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                                            {new Date(comment.createdAt).toLocaleString()}
                                          </span>
                                        </div>

                                        {/* Comment Body with mentions */}
                                        <div className="prose prose-sm dark:prose-invert max-w-none mb-2 text-light-text-primary dark:text-dark-text-primary">
                                          <ReactMarkdown
                                            remarkPlugins={[remarkGfm, remarkBreaks]}
                                            rehypePlugins={[rehypeRaw, rehypeSanitize]}
                                            components={{
                                              pre: ({ children }) => <div className="my-4 not-prose">{children}</div>,
                                              p: ({node, children, ...props}) => {
                                                const hasCodeBlock = React.Children.toArray(children).some((child: any) => {
                                                  if (child?.props?.className?.includes('language-')) return true;
                                                  if (child?.type === 'div' || child?.type === 'pre') return true;
                                                  return false;
                                                });
                                                const Element = hasCodeBlock ? 'div' : 'p';
                                                return (
                                                  <Element className="mb-2 last:mb-0 text-light-text-primary dark:text-dark-text-primary leading-relaxed" {...props}>
                                                    {children}
                                                  </Element>
                                                );
                                              },
                                              a: ({node, ...props}) => <a className="text-light-accent-primary dark:text-dark-accent-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                                              strong: ({node, children, ...props}) => {
                                                const text = typeof children === 'string' ? children : String(children);
                                                if (text.match(/^@[\w-]+$/)) {
                                                  return (
                                                    <span className="font-semibold text-light-accent-primary dark:text-dark-accent-primary hover:underline cursor-pointer">
                                                      {children}
                                                    </span>
                                                  );
                                                }
                                                return <strong className="font-semibold text-light-text-primary dark:text-dark-text-primary" {...props}>{children}</strong>;
                                              },
                                              blockquote: ({node, children, ...props}) => {
                                                const childrenText = String(children);
                                                const alertMatch = childrenText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/);
                                                if (alertMatch) {
                                                  const alertType = alertMatch[1].toLowerCase();
                                                  const alertStyles = { note: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100', tip: 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100', important: 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-100', warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-100', caution: 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100' };
                                                  const alertIcons = { note: '💡', tip: '✅', important: '⚠️', warning: '⚠️', caution: '🚫' };
                                                  const style = alertStyles[alertType as keyof typeof alertStyles] || alertStyles.note;
                                                  const icon = alertIcons[alertType as keyof typeof alertIcons] || '📝';
                                                  return (<div className={`border-l-4 ${style} p-3 rounded-r-lg my-2`}><div className="flex items-start gap-2"><span className="text-lg flex-shrink-0">{icon}</span><div className="flex-1"><div className="font-bold uppercase text-xs mb-1">{alertType}</div><div className="not-italic text-sm">{children}</div></div></div></div>);
                                                }
                                                return <blockquote className="border-l-4 border-light-accent-primary dark:border-dark-accent-primary pl-3 italic my-2 text-sm" {...props}>{children}</blockquote>;
                                              },
                                              li: ({node, children, ...props}) => {
                                                const className = node?.properties?.className;
                                                const hasCheckbox = Array.isArray(className) ? className.includes('task-list-item') : typeof className === 'string' && className.includes('task-list-item');
                                                if (hasCheckbox) return (<li className="flex items-center gap-2 text-light-text-primary dark:text-dark-text-primary list-none text-sm" {...props}>{children}</li>);
                                                return <li className="text-light-text-primary dark:text-dark-text-primary text-sm" {...props}>{children}</li>;
                                              },
                                              input: ({node, ...props}) => {
                                                if (props.type === 'checkbox') return (<input type="checkbox" disabled className="mr-1.5 h-3.5 w-3.5 rounded border-light-border dark:border-dark-border" {...props} />);
                                                return <input {...props} />;
                                              },
                                              table: ({node, ...props}) => (<div className="overflow-x-auto my-2"><table className="min-w-full border border-light-border dark:border-dark-border rounded-md text-sm" {...props} /></div>),
                                              thead: ({node, ...props}) => <thead className="bg-light-surface-elevated dark:bg-dark-surface-elevated" {...props} />,
                                              tbody: ({node, ...props}) => <tbody className="divide-y divide-light-border dark:divide-dark-border" {...props} />,
                                              tr: ({node, ...props}) => <tr className="hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors" {...props} />,
                                              th: ({node, ...props}) => <th className="px-3 py-2 text-left font-semibold text-xs" {...props} />,
                                              td: ({node, ...props}) => <td className="px-3 py-2 text-xs" {...props} />,
                                              code: ({node, inline, className, children, ...props}: any) => {
                                                const match = /language-(\w+)/.exec(className || '');
                                                const language = match ? match[1] : 'text';
                                                
                                                // Treat as inline code if: 1) inline prop is true, OR 2) no language- className
                                                if (inline || !match) {
                                                  return (
                                                    <code className="px-1.5 py-0.5 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary font-mono text-xs border border-light-border dark:border-dark-border" {...props}>
                                                      {children}
                                                    </code>
                                                  );
                                                }

                                                // Handle Mermaid diagrams
                                                if (language === 'mermaid') return <MermaidDiagram chart={String(children)} />;

                                                // Block code - use SyntaxHighlighter
                                                return (
                                                  <SyntaxHighlighter
                                                    style={isDarkMode ? oneDark : oneLight}
                                                    language={language}
                                                    PreTag="div"
                                                    customStyle={{ margin: '0.5rem 0', borderRadius: '0.375rem', fontSize: '0.7rem' }}
                                                  >
                                                    {String(children).replace(/\n$/, '')}
                                                  </SyntaxHighlighter>
                                                );
                                              },
                                            }}
                                          >
                                            {processMentions(comment.body)}
                                          </ReactMarkdown>
                                        </div>

                                        {/* Reactions */}
                                        <div className="flex items-center gap-1 mt-2">
                                          {reactions.length > 0 && reactions.map((reaction, idx) => {
                                            const userHasReacted = comment.reactions?.nodes?.some(
                                              (r: any) => r.content === reaction.content && r.user?.login === currentUser
                                            );
                                            return (
                                              <button
                                                key={idx}
                                                onClick={() => handleReactionClick(comment.id, reaction.content, comment.reactions)}
                                                className={`flex items-center gap-1 px-2 py-0.5 text-xs border rounded-full transition-colors ${
                                                  userHasReacted
                                                    ? 'border-light-accent-primary dark:border-dark-accent-primary bg-light-accent-primary/10 dark:bg-dark-accent-primary/10'
                                                    : 'border-light-border dark:border-dark-border hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated'
                                                }`}
                                                title={reaction.users.join(', ')}
                                              >
                                                <span>{reaction.emoji}</span>
                                                <span className="text-light-text-secondary dark:text-dark-text-secondary font-medium">{reaction.count}</span>
                                              </button>
                                            );
                                          })}
                                          {/* Add reaction button */}
                                          <div className="relative">
                                            <button
                                              onClick={() => setReactionPickerOpen(reactionPickerOpen === comment.id ? null : comment.id)}
                                              className="flex items-center justify-center w-7 h-7 text-xs border border-light-border dark:border-dark-border rounded-full hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors"
                                              title="Add reaction"
                                            >
                                              <span className="text-light-text-muted dark:text-dark-text-muted">😊</span>
                                            </button>
                                            {/* Reaction Picker */}
                                            {reactionPickerOpen === comment.id && (
                                              <div className="absolute left-0 bottom-full mb-2 p-2 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-lg z-10 flex gap-1">
                                                {availableReactions.map((r) => (
                                                  <button
                                                    key={r.content}
                                                    onClick={() => handleAddReaction(comment.id, r.emoji, r.content)}
                                                    className="w-8 h-8 flex items-center justify-center hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated rounded transition-colors"
                                                    title={r.content}
                                                  >
                                                    {r.emoji}
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Replies (remaining comments) */}
                              {item.comments.nodes.length > 1 && (
                                <div className="relative mt-[10px] mr-[10px] mb-[10px] ml-3">
                                  {/* Connecting line */}
                                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-light-border dark:bg-dark-border"></div>

                                  <div className="space-y-3 pl-8">
                                    <div className="text-xs font-medium text-light-text-muted dark:text-dark-text-muted mb-3">
                                      {item.comments.nodes.length - 1} {item.comments.nodes.length - 1 === 1 ? 'reply' : 'replies'}
                                    </div>
                                    {item.comments.nodes.slice(1).map((reply: any, replyIdx: number) => {
                                      const isReplyAuthor = reply.author?.login === prAuthor;
                                      const replyReactions = groupReactions(reply.reactions);
                                      const isLastReply = replyIdx === item.comments.nodes.length - 2;

                                      return (
                                        <div key={reply.id} className="relative">
                                          {/* Horizontal connecting line */}
                                          <div className="absolute left-[-24px] top-5 w-6 h-0.5 bg-light-border dark:bg-dark-border"></div>

                                          <div className="flex gap-3">
                                            <img
                                              src={reply.author?.avatarUrl || 'https://github.com/identicons/default.png'}
                                              alt={reply.author?.login || 'User'}
                                              className="w-8 h-8 rounded-full flex-shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                              <div className="border border-light-border dark:border-dark-border rounded-lg overflow-hidden bg-light-surface dark:bg-dark-surface">
                                                {/* Reply Header */}
                                                <div className="px-3 py-2 bg-light-surface-elevated dark:bg-dark-surface-elevated border-b border-light-border dark:border-dark-border">
                                                  <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-semibold text-sm text-light-text-primary dark:text-dark-text-primary">
                                                      {reply.author?.login || 'Unknown'}
                                                    </span>
                                                    {isReplyAuthor && (
                                                      <span className="px-1.5 py-0.5 text-xs font-medium bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded text-light-text-secondary dark:text-dark-text-secondary">
                                                        Author
                                                      </span>
                                                    )}
                                                    <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                                                      replied {new Date(reply.createdAt).toLocaleString()}
                                                    </span>
                                                  </div>
                                                </div>

                                                {/* Reply Body */}
                                                <div className="px-4 py-3">
                                                  <div className="prose prose-sm dark:prose-invert max-w-none text-light-text-primary dark:text-dark-text-primary">
                                                    <ReactMarkdown
                                                      remarkPlugins={[remarkGfm, remarkBreaks]}
                                                      rehypePlugins={[rehypeRaw, rehypeSanitize]}
                                                      components={{
                                                        pre: ({ children }) => <div className="my-4 not-prose">{children}</div>,
                                                        p: ({node, children, ...props}) => {
                                                          const hasCodeBlock = React.Children.toArray(children).some((child: any) => {
                                                            if (child?.props?.className?.includes('language-')) return true;
                                                            if (child?.type === 'div' || child?.type === 'pre') return true;
                                                            return false;
                                                          });
                                                          const Element = hasCodeBlock ? 'div' : 'p';
                                                          return (
                                                            <Element className="mb-2 last:mb-0 text-light-text-primary dark:text-dark-text-primary leading-relaxed" {...props}>
                                                              {children}
                                                            </Element>
                                                          );
                                                        },
                                                        a: ({node, ...props}) => <a className="text-light-accent-primary dark:text-dark-accent-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                                                        strong: ({node, children, ...props}) => {
                                                          const text = typeof children === 'string' ? children : String(children);
                                                          if (text.match(/^@[\w-]+$/)) {
                                                            return (
                                                              <span className="font-semibold text-light-accent-primary dark:text-dark-accent-primary hover:underline cursor-pointer">
                                                                {children}
                                                              </span>
                                                            );
                                                          }
                                                          return <strong className="font-bold text-light-text-primary dark:text-dark-text-primary" {...props}>{children}</strong>;
                                                        },
                                                        blockquote: ({node, children, ...props}) => {
                                                          const childrenText = String(children);
                                                          const alertMatch = childrenText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/);
                                                          if (alertMatch) {
                                                            const alertType = alertMatch[1].toLowerCase();
                                                            const alertStyles = { note: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100', tip: 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100', important: 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-100', warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-100', caution: 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100' };
                                                            const alertIcons = { note: '💡', tip: '✅', important: '⚠️', warning: '⚠️', caution: '🚫' };
                                                            const style = alertStyles[alertType as keyof typeof alertStyles] || alertStyles.note;
                                                            const icon = alertIcons[alertType as keyof typeof alertIcons] || '📝';
                                                            return (<div className={`border-l-4 ${style} p-3 rounded-r-lg my-2`}><div className="flex items-start gap-2"><span className="text-lg flex-shrink-0">{icon}</span><div className="flex-1"><div className="font-bold uppercase text-xs mb-1">{alertType}</div><div className="not-italic text-sm">{children}</div></div></div></div>);
                                                          }
                                                          return <blockquote className="border-l-4 border-light-accent-primary dark:border-dark-accent-primary pl-3 italic my-2 text-sm" {...props}>{children}</blockquote>;
                                                        },
                                                        li: ({node, children, ...props}) => {
                                                          const hasCheckbox = node?.properties?.className?.includes('task-list-item');
                                                          if (hasCheckbox) return (<li className="flex items-center gap-2 text-light-text-primary dark:text-dark-text-primary list-none text-sm" {...props}>{children}</li>);
                                                          return <li className="text-light-text-primary dark:text-dark-text-primary text-sm" {...props}>{children}</li>;
                                                        },
                                                        input: ({node, ...props}) => {
                                                          if (props.type === 'checkbox') return (<input type="checkbox" disabled className="mr-1.5 h-3.5 w-3.5 rounded border-light-border dark:border-dark-border" {...props} />);
                                                          return <input {...props} />;
                                                        },
                                                        table: ({node, ...props}) => (<div className="overflow-x-auto my-2"><table className="min-w-full border border-light-border dark:border-dark-border rounded-md text-sm" {...props} /></div>),
                                                        thead: ({node, ...props}) => <thead className="bg-light-surface-elevated dark:bg-dark-surface-elevated" {...props} />,
                                                        tbody: ({node, ...props}) => <tbody className="divide-y divide-light-border dark:divide-dark-border" {...props} />,
                                                        tr: ({node, ...props}) => <tr className="hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors" {...props} />,
                                                        th: ({node, ...props}) => <th className="px-3 py-2 text-left font-semibold text-xs" {...props} />,
                                                        td: ({node, ...props}) => <td className="px-3 py-2 text-xs" {...props} />,
                                                        code: ({node, inline, className, children, ...props}: any) => {
                                                          const match = /language-(\w+)/.exec(className || '');
                                                          const language = match ? match[1] : 'text';
                                                          
                                                          // Treat as inline code if: 1) inline prop is true, OR 2) no language- className
                                                          if (inline || !match) {
                                                            return (
                                                              <code className="px-1.5 py-0.5 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary font-mono text-xs border border-light-border dark:border-dark-border" {...props}>
                                                                {children}
                                                              </code>
                                                            );
                                                          }

                                                          // Handle Mermaid diagrams
                                                          if (language === 'mermaid') return <MermaidDiagram chart={String(children)} />;

                                                          // Block code - use SyntaxHighlighter
                                                          return (
                                                            <SyntaxHighlighter
                                                              style={isDarkMode ? oneDark : oneLight}
                                                              language={language}
                                                              PreTag="div"
                                                              customStyle={{ margin: '0.5rem 0', borderRadius: '0.375rem', fontSize: '0.7rem' }}
                                                            >
                                                              {String(children).replace(/\n$/, '')}
                                                            </SyntaxHighlighter>
                                                          );
                                                        },
                                                      }}
                                                    >
                                                      {processMentions(reply.body)}
                                                    </ReactMarkdown>
                                                  </div>

                                                  {/* Reactions */}
                                                  <div className="flex items-center gap-1 mt-3 pt-3 border-t border-light-border dark:border-dark-border">
                                                    {replyReactions.length > 0 && replyReactions.map((reaction, idx) => {
                                                      const userHasReacted = reply.reactions?.nodes?.some(
                                                        (r: any) => r.content === reaction.content && r.user?.login === currentUser
                                                      );
                                                      return (
                                                        <button
                                                          key={idx}
                                                          onClick={() => handleReactionClick(reply.id, reaction.content, reply.reactions)}
                                                          className={`flex items-center gap-1 px-2 py-0.5 text-xs border rounded-full transition-colors ${
                                                            userHasReacted
                                                              ? 'border-light-accent-primary dark:border-dark-accent-primary bg-light-accent-primary/10 dark:bg-dark-accent-primary/10'
                                                              : 'border-light-border dark:border-dark-border hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated'
                                                          }`}
                                                          title={reaction.users.join(', ')}
                                                        >
                                                          <span>{reaction.emoji}</span>
                                                          <span className="text-light-text-secondary dark:text-dark-text-secondary font-medium">{reaction.count}</span>
                                                        </button>
                                                      );
                                                    })}
                                                    {/* Add reaction button */}
                                                    <div className="relative">
                                                      <button
                                                        onClick={() => setReactionPickerOpen(reactionPickerOpen === reply.id ? null : reply.id)}
                                                        className="flex items-center justify-center w-7 h-7 text-xs border border-light-border dark:border-dark-border rounded-full hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors"
                                                        title="Add reaction"
                                                      >
                                                        <span className="text-light-text-muted dark:text-dark-text-muted">😊</span>
                                                      </button>
                                                      {/* Reaction Picker */}
                                                      {reactionPickerOpen === reply.id && (
                                                        <div className="absolute left-0 bottom-full mb-2 p-2 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-lg z-10 flex gap-1">
                                                          {availableReactions.map((r) => (
                                                            <button
                                                              key={r.content}
                                                              onClick={() => handleAddReaction(reply.id, r.emoji, r.content)}
                                                              className="w-8 h-8 flex items-center justify-center hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated rounded transition-colors"
                                                              title={r.content}
                                                            >
                                                              {r.emoji}
                                                            </button>
                                                          ))}
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Reply Input */}
                              {!item.isResolved && (
                                <div className="p-3 bg-light-surface-elevated dark:bg-dark-surface-elevated border-t border-light-border dark:border-dark-border">
                                  {replyingTo !== item.id ? (
                                    <button
                                      onClick={() => setReplyingTo(item.id)}
                                      className="w-full text-left px-3 py-2 text-sm text-light-text-muted dark:text-dark-text-muted bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-md hover:border-light-accent-primary dark:hover:border-dark-accent-primary transition-colors"
                                    >
                                      Write a reply...
                                    </button>
                                  ) : (
                                    <CommentEditor
                                      value={commentText[item.id] || ''}
                                      onChange={(val) => setCommentText((prev) => ({ ...prev, [item.id]: val }))}
                                      onSubmit={() => handleSubmitComment(item.id, item.comments.nodes[0]?.id)}
                                      onCancel={() => {
                                        setReplyingTo(null);
                                        setCommentText((prev) => ({ ...prev, [item.id]: '' }));
                                      }}
                                      placeholder="Write a reply..."
                                      submitLabel="Reply"
                                      isSubmitting={isSubmitting}
                                      autoFocus={true}
                                      minHeight={120}
                                      originalCode={firstComment.diffHunk ? firstComment.diffHunk.split('\n').filter(l => l.startsWith('+')).map(l => l.substring(1)).join('\n') : undefined}
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })
                  ) : (
                    <div className="text-center py-12">
                      <svg
                        className="w-16 h-16 mx-auto mb-4 text-light-text-muted dark:text-dark-text-muted"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                      <p className="text-light-text-muted dark:text-dark-text-muted">
                        No comments or reviews yet
                      </p>
                    </div>
                  )}

                  {/* New Comment Section */}
                  {currentUser && conversationData?.conversation && (
                    <div className="mt-4 flex gap-3">
                      {/* User Avatar */}
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-light-accent-primary dark:bg-dark-accent-primary text-white flex items-center justify-center font-semibold">
                          {currentUser.charAt(0).toUpperCase()}
                        </div>
                      </div>

                      {/* Comment Input */}
                      <div className="flex-1">
                        {!showNewComment ? (
                          <button
                            onClick={() => setShowNewComment(true)}
                            className="w-full text-left px-4 py-3 text-sm text-light-text-muted dark:text-dark-text-muted bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-md hover:border-light-accent-primary dark:hover:border-dark-accent-primary transition-colors"
                          >
                            Write a comment...
                          </button>
                        ) : (
                          <CommentEditor
                            value={commentText['new'] || ''}
                            onChange={(val) => setCommentText((prev) => ({ ...prev, new: val }))}
                            onSubmit={() => handleSubmitComment()}
                            onCancel={() => handleCancelComment()}
                            placeholder="Leave a comment"
                            submitLabel="Comment"
                            isSubmitting={isSubmitting}
                            autoFocus={true}
                            minHeight={150}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'commits' && (
                <div className="space-y-3">
                  {prData?.commits && prData.commits.length > 0 ? (
                    prData.commits.map((commit: any) => (
                      <div
                        key={commit.sha}
                        className="flex items-start gap-4 p-4 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated"
                      >
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 flex items-center justify-center">
                          <svg className="w-4 h-4 text-light-accent-primary dark:text-dark-accent-primary" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-light-text-primary dark:text-dark-text-primary font-medium">
                            {commit.message.split('\n')[0]}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-sm text-light-text-muted dark:text-dark-text-muted">
                            <span>{commit.author}</span>
                            <span>•</span>
                            <span className="font-mono text-xs">{commit.sha.substring(0, 7)}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-light-text-muted dark:text-dark-text-muted">
                        No commits found
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'checks' && (
                <div className="text-center py-12">
                  <p className="text-light-text-muted dark:text-dark-text-muted">
                    Checks view coming soon
                  </p>
                </div>
              )}

              {activeTab === 'files' && (
                <div className="space-y-2">
                  {prData?.files && prData.files.length > 0 ? (
                    prData.files.map((file: any) => (
                      <div
                        key={file.path}
                        className="flex items-center justify-between p-4 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated hover:bg-light-border dark:hover:bg-dark-border transition-colors cursor-pointer"
                        onClick={() => handleShowAIOptionsModal()}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              file.status === 'added'
                                ? 'bg-light-accent-success dark:bg-dark-accent-success'
                                : file.status === 'removed'
                                  ? 'bg-light-accent-error dark:bg-dark-accent-error'
                                  : 'bg-light-accent-warning dark:bg-dark-accent-warning'
                            }`}
                          />
                          <span className="font-mono text-sm text-light-text-primary dark:text-dark-text-primary break-all">
                            {file.path}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm flex-shrink-0 ml-4">
                          {file.additions > 0 && (
                            <span className="text-light-accent-success dark:text-dark-accent-success">
                              +{file.additions}
                            </span>
                          )}
                          {file.deletions > 0 && (
                            <span className="text-light-accent-error dark:text-dark-accent-error">
                              -{file.deletions}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-light-text-muted dark:text-dark-text-muted">
                        No files changed
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
