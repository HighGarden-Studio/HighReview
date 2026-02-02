import { useRef, useEffect, useState, memo } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as monaco from 'monaco-editor';
import { CommentDecoration, CodeReference } from './CodeEditor';
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
// DISABLED LSP: import { registerLSPActions } from '../utils/editorService';
import { registerTreeSitterActions } from '../utils/editorService';

// Zone Widget that renders React component inside Monaco diff editor
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

    console.log('[DiffCommentZone] Thread height calculation:', {
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

interface DiffEditorProps {
  original: string;
  modified: string;
  language?: string;
  theme?: 'vs-dark' | 'vs-light';
  height?: string;
  highlightLine?: number; // Deprecated: use highlightLines instead
  highlightLines?: {
    original?: number;
    modified?: number;
  };
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
    file: string;
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
}

function DiffEditorComponent({
  original,
  modified,
  language = 'typescript',
  theme = 'vs-dark',
  height = '100%',
  highlightLine,
  highlightLines,
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
}: DiffEditorProps) {
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const originalModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const modifiedModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const aiReviewDecorationsRef = useRef<string[]>([]);
  const aiReviewDataRef = useRef<AIReviewDecoration[]>([]);
  const previousAIReviewDataRef = useRef<string>(''); // Store stringified data to compare
  const commentDecorationsRef = useRef<string[]>([]); // Store comment decoration IDs
  const highlightDecorationsRef = useRef<string[]>([]); // Store highlight decoration IDs
  const scrollPositionRef = useRef<number>(0); // Store scroll position
  const prCommentDecorationsRef = useRef<string[]>([]); // Store PR comment decoration IDs
  const prCommentZonesRef = useRef<Map<number, { zoneId: string; widget: PRCommentZoneWidget }>>(new Map());
  const [activeCommentLine, setActiveCommentLine] = useState<{
    line: number;
    endLine?: number;
    top: number;
  } | null>(null);
  const [forceDecorationUpdate, setForceDecorationUpdate] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Prevent double initialization in React StrictMode
    if (diffEditorRef.current) {
      return;
    }

    // Create models asynchronously with VSCode service integration
    const initializeModels = async () => {
      let originalModel: monaco.editor.ITextModel;
      let modifiedModel: monaco.editor.ITextModel;

      console.log('[DiffEditor] Initializing diff models:', {
        filePath,
        repoRoot,
        language,
        hasOriginal: !!original,
        originalLength: original.length,
        hasModified: !!modified,
        modifiedLength: modified.length,
        originalPreview: original.substring(0, 100),
        modifiedPreview: modified.substring(0, 100),
      });

      // HYBRID APPROACH: Register with LSP AND create model reference to trigger LSP sync
      // Then use standard models for DiffEditor compatibility
      if (filePath && repoRoot) {

        const originalUri = monaco.Uri.file(`${repoRoot}/${filePath}.base`);
        const modifiedUri = monaco.Uri.file(`${repoRoot}/${filePath}`);

        // Step 1: Register files with VSCode file system
        try {
          const { RegisteredMemoryFile, ensureFileSystemProvider } = await import('../utils/monacoModels.js');
          const fileSystemProvider = ensureFileSystemProvider();

          // Check if file is already registered to avoid "file already exists" error
          const existingFiles = (window as any).__registeredFiles || new Set();
          const modifiedUriString = modifiedUri.toString();

          if (!existingFiles.has(modifiedUriString)) {
            // Register modified file (most important for LSP)
            const modifiedFile = new RegisteredMemoryFile(modifiedUri, modified);
            fileSystemProvider.registerFile(modifiedFile);
            existingFiles.add(modifiedUriString);
            (window as any).__registeredFiles = existingFiles;
          } else {
          }
        } catch (error) {
          console.warn('[DiffEditor] Failed to register with file system:', error);
        }

        // Step 2: Create model reference to trigger LSP's textDocument/didOpen notification
        // This is critical for LSP to index the file for "Go to References"
        try {
          const { createModelReference } = await import('@codingame/monaco-vscode-api/monaco');
          const lspModelRef = await createModelReference(modifiedUri);

          // Store reference to keep LSP model alive (don't dispose)
          // But we won't use this model for DiffEditor
          (window as any).__lspModelRefs = (window as any).__lspModelRefs || new Map();
          (window as any).__lspModelRefs.set(modifiedUri.toString(), lspModelRef);

        } catch (error) {
          console.warn('[DiffEditor] Failed to create LSP model reference:', error);
        }

        // Step 3: Create standard Monaco models for DiffEditor (compatible with diff view)
        originalModel = createStandardModel(original, language, originalUri);
        modifiedModel = createStandardModel(modified, language, modifiedUri);

        console.log('[DiffEditor] Standard models created:', {
          originalUri: originalModel.uri.toString(),
          modifiedUri: modifiedModel.uri.toString(),
          language,
          originalContentLength: originalModel.getValue().length,
          modifiedContentLength: modifiedModel.getValue().length,
        });
      } else {
        // Fallback: create models without URIs (no LSP support)
        originalModel = createStandardModel(original, language);
        modifiedModel = createStandardModel(modified, language);
      }

      originalModelRef.current = originalModel;
      modifiedModelRef.current = modifiedModel;

      // Create diff editor (check again to prevent race condition)
      if (diffEditorRef.current || !containerRef.current) {
        return;
      }

      diffEditorRef.current = monaco.editor.createDiffEditor(containerRef.current, {
        theme,
        automaticLayout: true,
        readOnly: true,
        minimap: { enabled: false }, // Disable to avoid memory issues
        scrollBeyondLastLine: false,
        fontSize: 14,
        renderSideBySide: true,
        glyphMargin: true,
        contextmenu: true, // Explicitly enable context menu for LSP features
      });

      diffEditorRef.current.setModel({
        original: originalModel,
        modified: modifiedModel,
      });

      // LSP features should be automatically registered by MonacoLanguageClient

      // Wait for LSP server to index the file
      // The LSP server needs a few seconds to process and index newly opened files

      // Add click handler for glyph margin and line numbers on modified editor
      const modifiedEditor = diffEditorRef.current.getModifiedEditor();

      // DISABLED LSP: Register LSP actions for navigation (Go to Definition, Find References, etc.)
      // registerLSPActions(modifiedEditor, {
      //   onShowReferences: (references, title) => {
      //     console.log('[DiffEditor] Received references from LSP:', references.length);
      //     if (onShowReferences) {
      //       onShowReferences(references, title);
      //     }
      //   },
      //   onNavigateToLocation: (uri, line, column) => {
      //     console.log('[DiffEditor] Navigate to location:', { uri, line, column });
      //     if (onNavigateToLocation) {
      //       onNavigateToLocation(uri, line, column);
      //     }
      //   },
      //   onSearchInProject: (query, currentFile, currentLine) => {
      //     console.log('[DiffEditor] Search in project:', { query, currentFile, currentLine });
      //     if (onSearchInProject) {
      //       onSearchInProject(query, currentFile, currentLine);
      //     }
      //   },
      // });

      // Register Tree-sitter based code navigation actions
      if (worktreePath && repoRoot) {
        registerTreeSitterActions(modifiedEditor, {
          worktreePath,
          repoRoot,
          onShowReferences: (references, title) => {
            console.log('[DiffEditor] Received references from Tree-sitter:', references.length);
            if (onShowReferences) {
              onShowReferences(references, title);
            }
          },
          onNavigateToLocation: (uri, line, column) => {
            console.log('[DiffEditor] Navigate to location:', { uri, line, column });
            if (onNavigateToLocation) {
              onNavigateToLocation(uri, line, column);
            }
          },
          onSearchInProject: (query, currentFile, currentLine) => {
            console.log('[DiffEditor] Search in project:', { query, currentFile, currentLine });
            if (onSearchInProject) {
              onSearchInProject(query, currentFile, currentLine);
            }
          },
        });
      }

      // Tree-sitter navigation features are now active

      modifiedEditor.onMouseDown((e) => {
      const lineNumber = e.target.position?.lineNumber;

      // Check for immediate actions only (AI review)
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        if (lineNumber) {
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

      // Handle mouseUp to check selection after drag
      modifiedEditor.onMouseUp((e) => {
      const lineNumber = e.target.position?.lineNumber;

      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
          e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
        if (lineNumber) {
          // Don't show comment form if clicking on AI review icons
          if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
            // Check if this line has AI review decoration
            if (onAIReviewClick) {
              const aiDecoration = findDecorationAtLine(aiReviewDataRef.current, lineNumber);
              if (aiDecoration) {
                return; // Don't show comment form for AI review icons
              }
            }
          }

          const selection = modifiedEditor.getSelection();
          let startLine = lineNumber;
          let endLine = lineNumber;

          // Check if user dragged to select multiple lines
          if (selection && !selection.isEmpty()) {
            startLine = selection.startLineNumber;
            endLine = selection.endLineNumber;
          }

          // Show comment form with appropriate line range
          const lineTop = modifiedEditor.getTopForLineNumber(startLine);
          const scrollTop = modifiedEditor.getScrollTop();
          setActiveCommentLine({
            line: startLine,
            endLine: endLine !== startLine ? endLine : undefined,
            top: lineTop - scrollTop + 20,
          });
        }
      }
    });

      // Note: LSP-based code navigation has been disabled in favor of Tree-sitter approach.
      // "Find in Project" (Alt+Shift+F12) is available via ripgrep-based search.

      // Add "Comment on Selection" action to context menu
      if (onAddComment) {
        modifiedEditor.addAction({
        id: 'add-comment-selection-diff',
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

          const lineTop = ed.getTopForLineNumber(startLine);
          const scrollTop = ed.getScrollTop();
          setActiveCommentLine({
            line: startLine,
            endLine: endLine !== startLine ? endLine : undefined,
            top: lineTop - scrollTop + 20,
          });
        },
        });
      }
    };

    // Initialize models and editor
    initializeModels().catch(error => {
      console.error('[DiffEditor] Failed to initialize models:', error);
    });

    return () => {
      // Clean up zone widgets first
      if (diffEditorRef.current && prCommentZonesRef.current.size > 0) {
        const modifiedEditor = diffEditorRef.current.getModifiedEditor();
        if (modifiedEditor) {
          modifiedEditor.changeViewZones((changeAccessor) => {
            prCommentZonesRef.current.forEach(({ zoneId, widget }) => {
              changeAccessor.removeZone(zoneId);
              widget.dispose();
            });
          });
          prCommentZonesRef.current.clear();
        }
      }

      // Dispose editor
      if (diffEditorRef.current) {
        diffEditorRef.current.dispose();
      }
      // VSCode-integrated models are managed by the model reference system
      // Only dispose standard models (created without filePath/repoRoot)
      if (originalModelRef.current && !filePath && !repoRoot) {
        originalModelRef.current.dispose();
      }
      if (modifiedModelRef.current && !filePath && !repoRoot) {
        modifiedModelRef.current.dispose();
      }
    };
  }, [onAddComment, onShowReferences, onNavigateToLocation, onSearchInProject, filePath, repoRoot, worktreePath]);

  // Update content when it changes
  useEffect(() => {
    if (originalModelRef.current && modifiedModelRef.current) {
      const currentOriginal = originalModelRef.current.getValue();
      const currentModified = modifiedModelRef.current.getValue();
      if (currentOriginal !== original) {
        originalModelRef.current.setValue(original);
      }
      if (currentModified !== modified) {
        modifiedModelRef.current.setValue(modified);
      }
    }
  }, [original, modified]);

  // Update language when it changes
  useEffect(() => {
    if (originalModelRef.current && modifiedModelRef.current) {
      monaco.editor.setModelLanguage(originalModelRef.current, language);
      monaco.editor.setModelLanguage(modifiedModelRef.current, language);
    }
  }, [language]);

  // Update theme when it changes
  useEffect(() => {
    monaco.editor.setTheme(theme);
  }, [theme]);

  // Highlight and scroll to specific line
  useEffect(() => {
    if (!diffEditorRef.current) return;

    // Support both old (highlightLine) and new (highlightLines) API
    const lines = highlightLines || (highlightLine ? { modified: highlightLine } : null);
    if (!lines || (!lines.original && !lines.modified)) return;

    const originalEditor = diffEditorRef.current.getOriginalEditor();
    const modifiedEditor = diffEditorRef.current.getModifiedEditor();


    // Add CSS for highlighting
    const styleId = 'diff-highlight-line-style';
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
      `;
      document.head.appendChild(style);
    }

    const column = highlightColumn || 1;

    // Highlight original (before) editor
    if (lines.original && originalEditor) {
      const newDecorations: monaco.editor.IModelDeltaDecoration[] = [{
        range: new monaco.Range(lines.original, 1, lines.original, 1),
        options: {
          isWholeLine: true,
          className: 'highlighted-line',
          glyphMarginClassName: 'highlighted-line-glyph',
          linesDecorationsClassName: 'highlighted-line-decoration',
        },
      }];

      highlightDecorationsRef.current = originalEditor.deltaDecorations(
        highlightDecorationsRef.current,
        newDecorations
      );

      setTimeout(() => {
        if (originalEditor && !originalEditor.getModel()?.isDisposed()) {
          originalEditor.setPosition({ lineNumber: lines.original!, column });
          originalEditor.revealPositionInCenter({ lineNumber: lines.original!, column });
          originalEditor.focus();
        }
      }, 100);
    }

    // Highlight modified (after) editor
    if (lines.modified && modifiedEditor) {
      const newDecorations: monaco.editor.IModelDeltaDecoration[] = [{
        range: new monaco.Range(lines.modified, 1, lines.modified, 1),
        options: {
          isWholeLine: true,
          className: 'highlighted-line',
          glyphMarginClassName: 'highlighted-line-glyph',
          linesDecorationsClassName: 'highlighted-line-decoration',
        },
      }];

      highlightDecorationsRef.current = modifiedEditor.deltaDecorations(
        highlightDecorationsRef.current,
        newDecorations
      );

      setTimeout(() => {
        if (modifiedEditor && !modifiedEditor.getModel()?.isDisposed()) {
          modifiedEditor.setPosition({ lineNumber: lines.modified!, column });
          modifiedEditor.revealPositionInCenter({ lineNumber: lines.modified!, column });
          modifiedEditor.focus();

          // Highlight keyword if provided
          if (highlightKeyword) {
            const model = modifiedEditor.getModel();
            if (model) {
              const lineContent = model.getLineContent(lines.modified!);
              const keywordIndex = lineContent.toLowerCase().indexOf(highlightKeyword.toLowerCase());
              if (keywordIndex !== -1) {
                const keywordDecorations: monaco.editor.IModelDeltaDecoration[] = [{
                  range: new monaco.Range(lines.modified!, keywordIndex + 1, lines.modified!, keywordIndex + 1 + highlightKeyword.length),
                  options: {
                    className: 'keyword-highlight',
                    inlineClassName: 'keyword-highlight-inline',
                  },
                }];
                modifiedEditor.deltaDecorations([], keywordDecorations);

                // Add CSS for keyword highlight if not already added
                if (!document.getElementById('keyword-highlight-styles')) {
                  const style = document.createElement('style');
                  style.id = 'keyword-highlight-styles';
                  style.textContent = `
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
              }
            }
          }
        }
      }, 100);
    }
  }, [highlightLine, highlightLines, highlightColumn, highlightKeyword]);

  // Save and restore scroll position to prevent scroll jumping
  useEffect(() => {
    if (!diffEditorRef.current) return;

    const modifiedEditor = diffEditorRef.current.getModifiedEditor();
    if (!modifiedEditor) return;

    // Save scroll position before any updates
    const saveScrollPosition = () => {
      scrollPositionRef.current = modifiedEditor.getScrollTop();
    };

    // Listen to scroll events to continuously save position
    const scrollDisposable = modifiedEditor.onDidScrollChange(() => {
      scrollPositionRef.current = modifiedEditor.getScrollTop();
    });

    return () => {
      scrollDisposable.dispose();
    };
  }, [diffEditorRef.current]);

  // Monitor and restore AI review decorations if they get lost
  useEffect(() => {
    if (!diffEditorRef.current) return;

    const modifiedEditor = diffEditorRef.current.getModifiedEditor();
    if (!modifiedEditor) return;

    // Set up a timer to periodically check and restore decorations
    const checkInterval = setInterval(() => {
      if (!modifiedEditor.getModel()) return;

      const currentDecorations = modifiedEditor.getModel()?.getAllDecorations() || [];
      const existingAIDecorations = currentDecorations.filter(d =>
        d.options.glyphMarginClassName?.includes('ai-review')
      );

      // If we should have decorations but they're missing, restore them
      if (aiReviewDecorationsRef.current.length > 0 && existingAIDecorations.length === 0) {

        // Save current scroll position before forcing update
        scrollPositionRef.current = modifiedEditor.getScrollTop();

        // Force re-render by updating a state variable
        setForceDecorationUpdate(prev => prev + 1);
      }
    }, 500); // Check every 500ms

    return () => {
      clearInterval(checkInterval);
    };
  }, [diffEditorRef.current]);

  // Add AI review decorations to modified editor
  useEffect(() => {
    if (!diffEditorRef.current || !filePath) {
      return;
    }

    const modifiedEditor = diffEditorRef.current.getModifiedEditor();


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
      contentLength: modified.length, // Simple content hash
      issuesCount: aiReviewIssues.length,
      issues: aiReviewIssues.map(i => ({ file: i.file, line: i.line, severity: i.severity })),
      callStacksCount: aiReviewCallStacks.length,
      callStacks: aiReviewCallStacks.map(cs => ({ file: cs.file, function: cs.function })),
    });

    // Check if data has actually changed AND decorations still exist in the model
    const currentDecorations = modifiedEditor.getModel()?.getAllDecorations() || [];
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
          const functionLines = detectFunctionLines(modified, callStack.function);
          if (functionLines.length > 0) {
            return { ...decoration, line: functionLines[0] };
          } else {
            console.warn('[DiffEditor] Function not found:', callStack.function);
          }
        }
        return decoration;
      });
    }

    // Filter out decorations that still have line 1 (not found)
    const validDecorations = aiDecorations.filter(d => {
      if (d.type === 'callstack' && d.line === 1) {
        console.warn('[DiffEditor] Skipping call stack decoration (function not found):', (d.data as CallStackInfo).function);
        return false;
      }
      return true;
    });


    // Store decorations for click handling
    aiReviewDataRef.current = validDecorations;

    // Create Monaco decorations
    const monacoDecorations = createAIReviewDecorations(validDecorations);

    const previousDecorations = aiReviewDecorationsRef.current;

    aiReviewDecorationsRef.current = modifiedEditor.deltaDecorations(
      previousDecorations,
      monacoDecorations
    );


    // Restore scroll position after decorations are applied
    if (scrollPositionRef.current > 0) {
      // Use requestAnimationFrame to ensure decorations are rendered
      requestAnimationFrame(() => {
        modifiedEditor.setScrollTop(scrollPositionRef.current);
      });
    }
  }, [modified, filePath, aiReviewIssues, aiReviewCallStacks, forceDecorationUpdate]);

  // Add comment decorations to modified editor
  useEffect(() => {
    if (diffEditorRef.current) {
      const modifiedEditor = diffEditorRef.current.getModifiedEditor();
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
      commentDecorationsRef.current = modifiedEditor.deltaDecorations(
        previousDecorations,
        newDecorations
      );

      // Add CSS (reuse same styles as CodeEditor)
      const style = document.createElement('style');
      style.id = 'diff-comment-decorations-style';
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

      const existingStyle = document.getElementById('diff-comment-decorations-style');
      if (existingStyle) {
        existingStyle.remove();
      }

      document.head.appendChild(style);

      return () => {
        const styleToRemove = document.getElementById('diff-comment-decorations-style');
        if (styleToRemove) {
          styleToRemove.remove();
        }
      };
    }
  }, [comments]);

  // Clean up and create PR comment zone widgets
  useEffect(() => {
    if (!diffEditorRef.current) return;

    const modifiedEditor = diffEditorRef.current.getModifiedEditor();
    if (!modifiedEditor) return;

    // Clean up existing zone widgets
    if (prCommentZonesRef.current.size > 0) {
      modifiedEditor.changeViewZones((changeAccessor) => {
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
      prCommentDecorationsRef.current = modifiedEditor.deltaDecorations(previousDecorations, []);
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

    const previousDecorations = prCommentDecorationsRef.current || [];
    prCommentDecorationsRef.current = modifiedEditor.deltaDecorations(
      previousDecorations,
      newDecorations
    );

    // Create zone widgets for PR comments
    modifiedEditor.changeViewZones((changeAccessor) => {
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
    const styleId = 'diff-pr-comment-decorations-style';
    const existingStyle = document.getElementById(styleId);
    if (!existingStyle) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .pr-comment-decoration {
          background-color: rgba(59, 130, 246, 0.2) !important;
          width: 3px !important;
          margin-left: 3px;
        }
        .pr-comment-resolved-decoration {
          background-color: rgba(34, 197, 94, 0.15) !important;
          width: 3px !important;
          margin-left: 3px;
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
export const DiffEditor = memo(DiffEditorComponent);
