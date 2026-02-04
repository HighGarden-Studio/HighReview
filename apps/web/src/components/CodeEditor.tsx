import { useRef, useEffect, useState, memo } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as monaco from 'monaco-editor';
import {
  AIReviewDecoration,
  AIReviewComment,
  CallStackInfo,
  processAIReviewForFile,
  detectFunctionLines,
  createAIReviewDecorations,
  getAIReviewStyles,
  findDecorationAtLine,
} from '../utils/aiReviewDecorations';
import { CommentForm } from './CommentForm';
import { PRCommentThread } from './PRCommentThread';
import { ThemeProvider } from '../contexts/ThemeContext';
import { createVSCodeModel, createStandardModel } from '../utils/monacoModels';
import { registerTreeSitterActions } from '../utils/editorService';

// Zone Widget that renders React component inside Monaco editor
class PRCommentZoneWidget implements monaco.editor.IViewZone {
  domNode: HTMLDivElement;
  afterLineNumber: number;
  heightInPx: number;
  private root: Root | null = null;

  constructor(
    afterLineNumber: number,
    thread: any,
    currentUser: string | undefined,
    onReply: (threadId: string, body: string) => Promise<void>,
    onReact: (commentId: string, reaction: string) => Promise<void>,
    onResolve: ((threadId: string) => Promise<void>) | undefined
  ) {
    this.afterLineNumber = afterLineNumber;

    // Calculate height - allocate space based on new bubble-style layout
    // Header: ~50px, Each comment bubble: ~140px, Reply form: ~200px, Padding
    const headerHeight = 50;
    const commentHeight = 140; // Bubble style with avatar
    const replyFormHeight = thread.isResolved ? 0 : 200; // Collapsed button or expanded editor
    const commentsCount = thread.comments?.length || 1;
    const extraPadding = 60;
    this.heightInPx = headerHeight + (commentsCount * commentHeight) + replyFormHeight + extraPadding;

    console.log('[CommentZone] Thread height calculation:', {
      headerHeight,
      commentHeight,
      commentsCount,
      replyFormHeight,
      extraPadding,
      threadId: thread.id,
      isResolved: thread.isResolved,
    });

    // Create DOM container
    this.domNode = document.createElement('div');
    this.domNode.style.width = '100%';
    this.domNode.style.height = `${this.heightInPx}px`; // Fixed height instead of maxHeight
    this.domNode.style.padding = '8px 60px 8px 72px'; // Align with line numbers (72px) and leave right margin
    this.domNode.style.boxSizing = 'border-box';
    this.domNode.style.backgroundColor = 'transparent'; // Transparent to not block content
    this.domNode.style.position = 'relative';
    this.domNode.style.zIndex = '100';
    this.domNode.style.pointerEvents = 'auto';
    this.domNode.style.overflow = 'visible'; // Allow content to be visible

    // Create React root and render PRCommentThread component with ThemeProvider
    this.root = createRoot(this.domNode);
    this.root.render(
      <ThemeProvider>
        <PRCommentThread
          thread={thread}
          currentUser={currentUser}
          onReply={onReply}
          onReact={onReact}
          onResolve={onResolve}
          onClose={() => {}}
          inline={true}
        />
      </ThemeProvider>
    );
  }

  dispose() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}

export interface CommentDecoration {
  line: number;
  body: string;
  isPending: boolean;
  isAI: boolean;
}

export interface CodeReference {
  uri: string;
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  preview?: string;
}

interface CodeEditorProps {
  value: string;
  language?: string;
  readOnly?: boolean;
  theme?: 'vs-dark' | 'vs-light';
  height?: string;
  highlightLine?: number;
  highlightColumn?: number;
  highlightKeyword?: string; // Keyword to highlight in the code
  comments?: CommentDecoration[];
  filePath?: string; // File path for proper URI creation
  repoRoot?: string; // Repository root for proper URI creation
  worktreePath?: string; // Worktree path for Tree-sitter analysis
  onAddComment?: (line: number, body: string) => void;
  onShowReferences?: (references: CodeReference[], title: string) => void;
  onNavigateToLocation?: (uri: string, line: number, column: number) => void;
  onSearchInProject?: (query: string, currentFile: string, currentLine: number) => void;
  // AI Review integration
  aiReviewIssues?: AIReviewComment[];
  aiReviewCallStacks?: CallStackInfo[];
  onAIReviewClick?: (decoration: AIReviewDecoration) => void;
  // PR Comments integration
  prComments?: Array<{
    id: string;
    line: number;
    comments: Array<{
      id: string;
      author: string;
      authorAvatar?: string;
      body: string;
      createdAt: string;
      reactions: any[];
    }>;
    isResolved: boolean;
  }>;
  currentUser?: string;
  onPRCommentReply?: (threadId: string, body: string) => Promise<void>;
  onPRCommentReact?: (commentId: string, reaction: string) => Promise<void>;
  onPRCommentResolve?: (threadId: string) => Promise<void>;
  // Continuous scroll navigation
  onNavigateNext?: () => void;
  onNavigatePrev?: () => void;
  initialScrollPosition?: 'top' | 'bottom';
}

function CodeEditorComponent({
  value,
  language = 'typescript',
  readOnly = true,
  theme = 'vs-dark',
  height = '100%',
  highlightLine,
  highlightColumn,
  highlightKeyword,
  comments = [],
  filePath,
  repoRoot,
  worktreePath,
  onAddComment,
  onShowReferences,
  onNavigateToLocation,
  onSearchInProject,
  aiReviewIssues = [],
  aiReviewCallStacks = [],
  onAIReviewClick,
  prComments = [],
  currentUser,
  onPRCommentReply,
  onPRCommentReact,
  onPRCommentResolve,
  onNavigateNext,
  onNavigatePrev,
  initialScrollPosition = 'top',
}: CodeEditorProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const decorationsRef = useRef<string[]>([]);
  const aiReviewDecorationsRef = useRef<string[]>([]);
  const prCommentDecorationsRef = useRef<string[]>([]);
  const prCommentZonesRef = useRef<Map<number, { zoneId: string; widget: PRCommentZoneWidget }>>(new Map());
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const aiReviewDataRef = useRef<AIReviewDecoration[]>([]);
  const previousAIReviewDataRef = useRef<string>(''); // Store stringified data to compare
  const scrollPositionRef = useRef<number>(0); // Store scroll position
  const [activeCommentLine, setActiveCommentLine] = useState<{
    line: number;
    endLine?: number;
    top: number;
  } | null>(null);
  const [forceDecorationUpdate, setForceDecorationUpdate] = useState(0);
  const [isEditorReady, setIsEditorReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Prevent double initialization in React StrictMode
    if (editorRef.current) {
      return;
    }

    // Create model asynchronously with VSCode service integration
    const initializeEditor = async () => {
      let model: monaco.editor.ITextModel;

      if (filePath && repoRoot) {
        // Use VSCode service-integrated model for LSP support
        try {
          model = await createVSCodeModel(
            value,
            language,
            `${repoRoot}/${filePath}`
          );

          console.log('[CodeEditor] VSCode model created:', {
            uri: model.uri.toString(),
            language,
          });
        } catch (error) {
          console.warn('[CodeEditor] Failed to create VSCode model, falling back to standard model:', error);
          // Fallback to standard model
          model = createStandardModel(value, language, monaco.Uri.file(`${repoRoot}/${filePath}`));
        }
      } else {
        // Fallback: create model without URI
        model = createStandardModel(value, language);
      }

      modelRef.current = model;

      // Create editor with the model (check again to prevent race condition)
      if (editorRef.current || !containerRef.current) {
        return;
      }

      editorRef.current = monaco.editor.create(containerRef.current, {
        model,
        theme,
        readOnly,
        automaticLayout: true,
        minimap: { enabled: false }, // Disable to avoid memory issues
        scrollBeyondLastLine: false,
        fontSize: 14,
        lineNumbers: 'on',
        renderWhitespace: 'selection',
        folding: true,
        glyphMargin: true,
        contextmenu: true, // Explicitly enable context menu for LSP features
      });

      // DISABLED LSP: Register LSP actions for navigation (Go to Definition, Find References, etc.)
      // registerLSPActions(editorRef.current, {
      //   onShowReferences: (references, title) => {
      //     console.log('[CodeEditor] Received references from LSP:', references.length);
      //     if (onShowReferences) {
      //       onShowReferences(references, title);
      //     }
      //   },
      //   onNavigateToLocation: (uri, line, column) => {
      //     console.log('[CodeEditor] Navigate to location:', { uri, line, column });
      //     if (onNavigateToLocation) {
      //       onNavigateToLocation(uri, line, column);
      //     }
      //   },
      //   onSearchInProject: (query, currentFile, currentLine) => {
      //     console.log('[CodeEditor] Search in project:', { query, currentFile, currentLine });
      //     if (onSearchInProject) {
      //       onSearchInProject(query, currentFile, currentLine);
      //     }
      //   },
      // });

      // Register Tree-sitter based code navigation actions
      if (worktreePath && repoRoot) {
        registerTreeSitterActions(editorRef.current, {
          worktreePath,
          repoRoot,
          onShowReferences: (references, title) => {
            console.log('[CodeEditor] Received references from Tree-sitter:', references.length);
            if (onShowReferences) {
              onShowReferences(references, title);
            }
          },
          onNavigateToLocation: (uri, line, column) => {
            console.log('[CodeEditor] Navigate to location:', { uri, line, column });
            if (onNavigateToLocation) {
              onNavigateToLocation(uri, line, column);
            }
          },
          onSearchInProject: (query, currentFile, currentLine) => {
            console.log('[CodeEditor] Search in project:', { query, currentFile, currentLine });
            if (onSearchInProject) {
              onSearchInProject(query, currentFile, currentLine);
            }
          },
        });
      }

      // Add click handler for glyph margin and line numbers (for adding comments and AI review)
      editorRef.current.onMouseDown((e) => {
      const lineNumber = e.target.position?.lineNumber;

      // Check for immediate actions only (AI review)
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        if (lineNumber && editorRef.current) {
          // Check if this is an AI review decoration
          if (onAIReviewClick) {
            const aiDecoration = findDecorationAtLine(aiReviewDataRef.current, lineNumber);
            if (aiDecoration) {
              onAIReviewClick(aiDecoration);
              e.event.preventDefault();
              e.event.stopPropagation();
              return;
            }
          }
        }
      }
    });

      // Helper function to calculate safe popup position within viewport
      const calculateSafePopupPosition = (startLine: number): number => {
        if (!editorRef.current) return 20;
        const lineTop = editorRef.current.getTopForLineNumber(startLine);
        const scrollTop = editorRef.current.getScrollTop();
        const editorHeight = editorRef.current.getLayoutInfo().height;
        const estimatedPopupHeight = 250; // Approximate height of CommentForm
        const margin = 20;
        
        // Calculate initial position (below the line)
        let popupTop = lineTop - scrollTop + margin;
        
        // Check if popup would overflow bottom of viewport
        if (popupTop + estimatedPopupHeight > editorHeight) {
          // Position above the line instead
          popupTop = lineTop - scrollTop - estimatedPopupHeight - margin;
          
          // If it would overflow top, position at top with some margin
          if (popupTop < margin) {
            popupTop = margin;
          }
        }
        
        return popupTop;
      };

      // Handle mouseUp to check selection after drag
      editorRef.current.onMouseUp((e) => {
      const lineNumber = e.target.position?.lineNumber;

      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
          e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
        if (lineNumber && editorRef.current) {
          // Don't show comment form if clicking on AI review or PR comment icons
          if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
            // Check if this line has AI review decoration
            if (onAIReviewClick) {
              const aiDecoration = findDecorationAtLine(aiReviewDataRef.current, lineNumber);
              if (aiDecoration) {
                return; // Don't show comment form for AI review icons
              }
            }
          }

          const selection = editorRef.current.getSelection();
          let startLine = lineNumber;
          let endLine = lineNumber;

          // Check if user dragged to select multiple lines
          if (selection && !selection.isEmpty()) {
            startLine = selection.startLineNumber;
            endLine = selection.endLineNumber;
          }

          // Show comment form with appropriate line range
          const safeTop = calculateSafePopupPosition(startLine);
          setActiveCommentLine({
            line: startLine,
            endLine: endLine !== startLine ? endLine : undefined,
            top: safeTop,
          });
        }
      }
    });

      // Note: LSP-based code navigation has been disabled in favor of Tree-sitter approach.
      // "Find in Project" (Alt+Shift+F12) is available via ripgrep-based search.

      // Add "Comment on Selection" action to context menu
      if (onAddComment) {
        editorRef.current.addAction({
        id: 'add-comment-selection',
        label: 'Add Comment on Selection',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyC],
        contextMenuGroupId: '9_cutcopypaste',
        contextMenuOrder: 3,
        precondition: 'editorHasSelection',
        run: (ed) => {
          const selection = ed.getSelection();
          if (!selection || selection.isEmpty()) return;

          const startLine = selection.startLineNumber;
          const endLine = selection.endLineNumber;

          const safeTop = calculateSafePopupPosition(startLine);
          setActiveCommentLine({
            line: startLine,
            endLine: endLine !== startLine ? endLine : undefined,
            top: safeTop,
          });
        },
        });
      }

      setIsEditorReady(true);
    };

    // Initialize editor
    initializeEditor().catch(error => {
      console.error('[CodeEditor] Failed to initialize editor:', error);
    });

    return () => {
      setIsEditorReady(false);
      // Clean up zone widgets first
      if (editorRef.current && prCommentZonesRef.current.size > 0) {
        editorRef.current.changeViewZones((changeAccessor) => {
          prCommentZonesRef.current.forEach(({ zoneId, widget }) => {
            changeAccessor.removeZone(zoneId);
            widget.dispose();
          });
        });
        prCommentZonesRef.current.clear();
      }

      // Dispose editor
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
      // Only dispose model if it's not a shared model (no URI)
      if (modelRef.current && !filePath && !repoRoot) {
        modelRef.current.dispose();
      }
    };
  }, [onAddComment, onShowReferences, onNavigateToLocation, onSearchInProject, filePath, repoRoot, worktreePath]);

  // Update value when it changes
  useEffect(() => {
    if (modelRef.current) {
      const currentValue = modelRef.current.getValue();
      if (currentValue !== value) {
        modelRef.current.setValue(value);
      }
    }
  }, [value]);

  // Update language when it changes
  useEffect(() => {
    if (modelRef.current) {
      monaco.editor.setModelLanguage(modelRef.current, language);
    }
  }, [language]);

  // Update theme when it changes
  useEffect(() => {
    monaco.editor.setTheme(theme);
  }, [theme]);

  // Highlight and scroll to specific line, and position cursor
  useEffect(() => {
    if (!editorRef.current || !highlightLine) return;

    const editor = editorRef.current;
    const column = highlightColumn || 1;

    // Remove previous decorations
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
        range: new monaco.Range(highlightLine, 1, highlightLine, 1),
        options: {
          isWholeLine: true,
          className: 'highlighted-line',
          glyphMarginClassName: 'highlighted-line-glyph',
          linesDecorationsClassName: 'highlighted-line-decoration',
        },
      },
    ]);

    // Scroll to the line and set cursor position with a slight delay to ensure editor is ready
    setTimeout(() => {
      if (editor && !editor.getModel()?.isDisposed()) {
        // Set cursor position
        editor.setPosition({ lineNumber: highlightLine, column });
        // Scroll to center
        editor.revealPositionInCenter({ lineNumber: highlightLine, column });
        // Focus the editor
        editor.focus();

        // Highlight keyword if provided
        if (highlightKeyword) {
          const model = editor.getModel();
          if (model) {
            const lineContent = model.getLineContent(highlightLine);
            const keywordIndex = lineContent.toLowerCase().indexOf(highlightKeyword.toLowerCase());
            if (keywordIndex !== -1) {
              const keywordDecorations: monaco.editor.IModelDeltaDecoration[] = [{
                range: new monaco.Range(highlightLine, keywordIndex + 1, highlightLine, keywordIndex + 1 + highlightKeyword.length),
                options: {
                  className: 'keyword-highlight',
                  inlineClassName: 'keyword-highlight-inline',
                },
              }];
              editor.deltaDecorations([], keywordDecorations);
            }
          }
        }
      }
    }, 100);

    // Add CSS for highlighting
    const styleId = 'highlight-line-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .highlighted-line {
          background-color: rgba(255, 165, 0, 0.2) !important;
        }
        .highlighted-line-glyph {
          background-color: rgba(255, 165, 0, 0.5) !important;
        }
        .highlighted-line-decoration {
          background-color: rgba(255, 165, 0, 0.5) !important;
          width: 3px !important;
        }
        .keyword-highlight {
          background-color: rgba(255, 235, 59, 0.3) !important;
        }
        .keyword-highlight-inline {
          background-color: rgba(255, 235, 59, 0.5) !important;
          border-radius: 2px;
        }
      `;
      document.head.appendChild(style);
    }
  }, [highlightLine, highlightColumn, highlightKeyword]);

  // Save and restore scroll position to prevent scroll jumping
  useEffect(() => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    if (!editor) return;

    // Save scroll position before any updates
    // const saveScrollPosition = () => {
    //   scrollPositionRef.current = editor.getScrollTop();
    // };

    // Listen to scroll events to continuously save position
    const scrollDisposable = editor.onDidScrollChange(() => {
      scrollPositionRef.current = editor.getScrollTop();
    });

    return () => {
      scrollDisposable.dispose();
    };
  }, [editorRef.current]);

  // Handle initial scroll position (top or bottom)
  useEffect(() => {
    if (!editorRef.current || !isEditorReady) return;

    if (initialScrollPosition === 'bottom') {
      // Small delay to ensure content is fully rendered
      requestAnimationFrame(() => {
        const scrollHeight = editorRef.current?.getScrollHeight() || 0;
        editorRef.current?.setScrollTop(scrollHeight);
      });
    } else {
      editorRef.current?.setScrollTop(0);
    }
  }, [initialScrollPosition, isEditorReady, filePath]);

  // Handle overscroll for continuous navigation
  useEffect(() => {
    if (!containerRef.current || !onNavigateNext || !onNavigatePrev) return;

    let lastNavigationTime = 0;
    let accumulatedDeltaY = 0;
    let lastWheelTime = 0;
    const NAVIGATION_THROTTLE = 1000; // ms
    const ACCUMULATION_RESET_TIME = 200; // ms
    const TRIGGER_THRESHOLD = 200; // Total deltaY to trigger navigation

    const handleWheel = (e: WheelEvent) => {
      if (!editorRef.current) return;
      
      const scrollTop = editorRef.current.getScrollTop();
      const scrollHeight = editorRef.current.getScrollHeight();
      const layoutInfo = editorRef.current.getLayoutInfo();
      const viewportHeight = layoutInfo.height;

      const now = Date.now();
      
      // Reset accumulation if too much time passed between scrolls
      if (now - lastWheelTime > ACCUMULATION_RESET_TIME) {
        accumulatedDeltaY = 0;
      }
      lastWheelTime = now;
      accumulatedDeltaY += e.deltaY;

      if (now - lastNavigationTime < NAVIGATION_THROTTLE) return;

      const isAtBottom = scrollTop + viewportHeight >= scrollHeight - 5;
      const isAtTop = scrollTop <= 5;
      const isShortFile = scrollHeight <= viewportHeight + 5;

      // Check for overscroll at bottom (Next File)
      if (accumulatedDeltaY > TRIGGER_THRESHOLD && (isAtBottom || isShortFile)) {
        console.log('[CodeEditor] Navigating to next file:', { accumulatedDeltaY, isAtBottom, isShortFile });
        lastNavigationTime = now;
        accumulatedDeltaY = 0;
        if (onNavigateNext) onNavigateNext();
      }
      
      // Check for overscroll at top (Prev File)
      if (accumulatedDeltaY < -TRIGGER_THRESHOLD && (isAtTop || isShortFile)) {
        console.log('[CodeEditor] Navigating to previous file:', { accumulatedDeltaY, isAtTop, isShortFile });
        lastNavigationTime = now;
        accumulatedDeltaY = 0;
        if (onNavigatePrev) onNavigatePrev();
      }
    };

    const container = containerRef.current;
    // Use capture: true to catch wheel events before Monaco handles them
    container.addEventListener('wheel', handleWheel, { capture: true, passive: true });

    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, [onNavigateNext, onNavigatePrev, isEditorReady]);

  // Monitor and restore AI review decorations if they get lost
  useEffect(() => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    if (!editor) return;

    // Set up a timer to periodically check and restore decorations
    const checkInterval = setInterval(() => {
      if (!editor.getModel()) return;

      const currentDecorations = editor.getModel()?.getAllDecorations() || [];
      const existingAIDecorations = currentDecorations.filter(d =>
        d.options.glyphMarginClassName?.includes('ai-review')
      );

      // If we should have decorations but they're missing, restore them
      if (aiReviewDecorationsRef.current.length > 0 && existingAIDecorations.length === 0) {

        // Save current scroll position before forcing update
        scrollPositionRef.current = editor.getScrollTop();

        // Force re-render by updating a state variable
        setForceDecorationUpdate(prev => prev + 1);
      }
    }, 500); // Check every 500ms

    return () => {
      clearInterval(checkInterval);
    };
  }, [editorRef.current]);

  // Add AI review decorations
  useEffect(() => {
    if (!editorRef.current || !filePath) {
      return;
    }


    // Add CSS for AI review icons (do this first)
    const styleId = 'ai-review-decorations-style';
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      style.textContent = getAIReviewStyles();
      document.head.appendChild(style);
    }

    // Create a key to check if the data has changed (include content hash for call stack detection)
    const currentDataKey = JSON.stringify({
      filePath,
      contentLength: value.length, // Simple content hash
      issuesCount: aiReviewIssues.length,
      issues: aiReviewIssues.map(i => ({ file: i.file, line: i.line, severity: i.severity })),
      callStacksCount: aiReviewCallStacks.length,
      callStacks: aiReviewCallStacks.map(cs => ({ file: cs.file, function: cs.function })),
    });

    // Check if data has actually changed AND decorations still exist in the model
    const currentDecorations = editorRef.current.getModel()?.getAllDecorations() || [];
    const existingAIDecorations = currentDecorations.filter(d =>
      d.options.glyphMarginClassName?.includes('ai-review')
    );

    if (currentDataKey === previousAIReviewDataRef.current &&
        aiReviewDecorationsRef.current.length > 0 &&
        existingAIDecorations.length > 0 &&
        forceDecorationUpdate === 0) {
      return;
    }

    if (forceDecorationUpdate > 0) {
    }

    if (existingAIDecorations.length === 0 && aiReviewDecorationsRef.current.length > 0) {
    }

    previousAIReviewDataRef.current = currentDataKey;

    // Process AI review data for this file
    let aiDecorations = processAIReviewForFile(
      filePath,
      aiReviewIssues,
      aiReviewCallStacks
    );


    // Detect function lines for call stack decorations
    if (aiReviewCallStacks && aiReviewCallStacks.length > 0) {
      aiDecorations = aiDecorations.map((decoration) => {
        if (decoration.type === 'callstack') {
          const callStack = decoration.data as CallStackInfo;
          const functionLines = detectFunctionLines(value, callStack.function);
          if (functionLines.length > 0) {
            return { ...decoration, line: functionLines[0] };
          } else {
            console.warn('[CodeEditor] Function not found:', callStack.function);
          }
        }
        return decoration;
      });
    }

    // Filter out decorations that still have line 1 (not found)
    const validDecorations = aiDecorations.filter(d => {
      if (d.type === 'callstack' && d.line === 1) {
        console.warn('[CodeEditor] Skipping call stack decoration (function not found):', (d.data as CallStackInfo).function);
        return false;
      }
      return true;
    });


    // Store decorations for click handling
    aiReviewDataRef.current = validDecorations;

    // Create Monaco decorations
    const monacoDecorations = createAIReviewDecorations(validDecorations);

    const previousDecorations = aiReviewDecorationsRef.current;

    aiReviewDecorationsRef.current = editorRef.current.deltaDecorations(
      previousDecorations,
      monacoDecorations
    );


    // Restore scroll position after decorations are applied
    if (scrollPositionRef.current > 0) {
      // Use requestAnimationFrame to ensure decorations are rendered
      requestAnimationFrame(() => {
        editorRef.current?.setScrollTop(scrollPositionRef.current);
      });
    }
  }, [value, filePath, aiReviewIssues, aiReviewCallStacks, forceDecorationUpdate, isEditorReady]);

  // Ref to store comment decoration IDs
  const commentDecorationsRef = useRef<string[]>([]);

  // Add comment decorations
  useEffect(() => {
    if (editorRef.current) {
      const newDecorations: monaco.editor.IModelDeltaDecoration[] = comments.map((comment) => {
        const className = comment.isPending
          ? 'pending-comment-line'
          : comment.isAI
          ? 'ai-comment-line'
          : 'comment-line';

        const glyphClassName = comment.isPending
          ? 'pending-comment-glyph'
          : comment.isAI
          ? 'ai-comment-glyph'
          : 'comment-glyph';

        return {
          range: new monaco.Range(comment.line, 1, comment.line, 1),
          options: {
            isWholeLine: true,
            className,
            glyphMarginClassName: glyphClassName,
            hoverMessage: { value: comment.body },
          },
        };
      });

      // Apply decorations (remove old ones first to prevent accumulation)
      const previousDecorations = commentDecorationsRef.current || [];
      commentDecorationsRef.current = editorRef.current.deltaDecorations(
        previousDecorations,
        newDecorations
      );

      // Add CSS for comment decorations
      const style = document.createElement('style');
      style.id = 'comment-decorations-style';
      style.textContent = `
        .pending-comment-line {
          background-color: rgba(251, 191, 36, 0.1) !important;
        }
        .pending-comment-glyph {
          background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="rgb(251, 191, 36)"><circle cx="8" cy="8" r="6"/></svg>') center center no-repeat;
        }
        .ai-comment-line {
          background-color: rgba(59, 130, 246, 0.1) !important;
          border-left: 3px solid rgba(59, 130, 246, 0.5);
        }
        .ai-comment-glyph {
          background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="rgb(59, 130, 246)"><circle cx="8" cy="8" r="6"/></svg>') center center no-repeat;
        }
        .comment-line {
          background-color: rgba(156, 163, 175, 0.1) !important;
        }
        .comment-glyph {
          background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="rgb(156, 163, 175)"><circle cx="8" cy="8" r="6"/></svg>') center center no-repeat;
        }
      `;

      // Remove existing style if present
      const existingStyle = document.getElementById('comment-decorations-style');
      if (existingStyle) {
        existingStyle.remove();
      }

      document.head.appendChild(style);

      return () => {
        const styleToRemove = document.getElementById('comment-decorations-style');
        if (styleToRemove) {
          styleToRemove.remove();
        }
      };
    }
  }, [comments]);

  // Clean up PR comment zone widgets when they change
  useEffect(() => {
    if (!editorRef.current) return;

    const editor = editorRef.current;

    // Clean up existing zone widgets
    if (prCommentZonesRef.current.size > 0) {
      editor.changeViewZones((changeAccessor) => {
        prCommentZonesRef.current.forEach(({ zoneId, widget }) => {
          changeAccessor.removeZone(zoneId);
          widget.dispose();
        });
      });
      prCommentZonesRef.current.clear();
    }

    // Clear decorations if no comments
    if (!prComments || prComments.length === 0) {
      const previousDecorations = prCommentDecorationsRef.current || [];
      prCommentDecorationsRef.current = editor.deltaDecorations(previousDecorations, []);
      return;
    }

    // Add line decorations (just highlight, no glyph icon)
    const newDecorations: monaco.editor.IModelDeltaDecoration[] = prComments.map((thread) => {
      return {
        range: new monaco.Range(thread.line, 1, thread.line, 1),
        options: {
          isWholeLine: false,
          linesDecorationsClassName: thread.isResolved
            ? 'pr-comment-resolved-decoration'
            : 'pr-comment-decoration',
        },
      };
    });

    // Apply decorations
    const previousDecorations = prCommentDecorationsRef.current || [];
    prCommentDecorationsRef.current = editor.deltaDecorations(
      previousDecorations,
      newDecorations
    );

    // Create zone widgets for PR comments
    editor.changeViewZones((changeAccessor) => {
      prComments.forEach((thread) => {
        const widget = new PRCommentZoneWidget(
          thread.line,
          thread,
          currentUser,
          onPRCommentReply || (async () => {}),
          onPRCommentReact || (async () => {}),
          onPRCommentResolve
        );

        const zoneId = changeAccessor.addZone(widget);
        prCommentZonesRef.current.set(thread.line, { zoneId, widget });
      });
    });

    // Add CSS for PR comment decorations
    const styleId = 'pr-comment-decorations-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .pr-comment-decoration {
          background-color: rgba(59, 130, 246, 0.1);
          border-left: 3px solid rgba(59, 130, 246, 0.7);
        }
        .pr-comment-resolved-decoration {
          background-color: rgba(34, 197, 94, 0.05);
          border-left: 3px solid rgba(34, 197, 94, 0.4);
        }
      `;
      document.head.appendChild(style);
    }
  }, [prComments, currentUser, onPRCommentReply, onPRCommentReact, onPRCommentResolve]);

  return (
    <div style={{ height, width: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

      {/* Inline Comment Form */}
      {activeCommentLine && filePath && (
        <div
          style={{
            position: 'absolute',
            top: activeCommentLine.top,
            right: 20,
            left: 20,
            zIndex: 1000,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          }}
        >
          <CommentForm
            file={filePath}
            line={activeCommentLine.line}
            endLine={activeCommentLine.endLine}
            onSubmit={(body) => {
              if (onAddComment) {
                onAddComment(activeCommentLine.line, body);
              }
              setActiveCommentLine(null);
            }}
            onCancel={() => setActiveCommentLine(null)}
          />
        </div>
      )}
    </div>
  );
}

// Export memoized version to prevent unnecessary re-renders
export const CodeEditor = memo(CodeEditorComponent);
