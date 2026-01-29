import { useRef, useEffect, useState, memo } from 'react';
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
  comments?: CommentDecoration[];
  filePath?: string; // File path for proper URI creation
  repoRoot?: string; // Repository root for proper URI creation
  onAddComment?: (line: number, body: string) => void;
  onShowReferences?: (references: CodeReference[], title: string) => void;
  onNavigateToLocation?: (uri: string, line: number, column: number) => void;
  // AI Review integration
  aiReviewIssues?: AIReviewComment[];
  aiReviewCallStacks?: CallStackInfo[];
  onAIReviewClick?: (decoration: AIReviewDecoration) => void;
}

function CodeEditorComponent({
  value,
  language = 'typescript',
  readOnly = true,
  theme = 'vs-dark',
  height = '100%',
  highlightLine,
  comments = [],
  filePath,
  repoRoot,
  onAddComment,
  onShowReferences,
  onNavigateToLocation,
  aiReviewIssues = [],
  aiReviewCallStacks = [],
  onAIReviewClick,
}: CodeEditorProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const decorationsRef = useRef<string[]>([]);
  const aiReviewDecorationsRef = useRef<string[]>([]);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const aiReviewDataRef = useRef<AIReviewDecoration[]>([]);
  const previousAIReviewDataRef = useRef<string>(''); // Store stringified data to compare
  const scrollPositionRef = useRef<number>(0); // Store scroll position
  const [activeCommentLine, setActiveCommentLine] = useState<{
    line: number;
    top: number;
  } | null>(null);
  const [forceDecorationUpdate, setForceDecorationUpdate] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create model with proper URI if filePath and repoRoot are provided
    let model: monaco.editor.ITextModel;
    if (filePath && repoRoot) {
      const uri = monaco.Uri.file(`${repoRoot}/${filePath}`);
      // Check if model already exists
      const existingModel = monaco.editor.getModel(uri);
      if (existingModel) {
        model = existingModel;
        model.setValue(value);
      } else {
        model = monaco.editor.createModel(value, language, uri);
      }
      modelRef.current = model;
    } else {
      // Fallback: create model without URI
      model = monaco.editor.createModel(value, language);
      modelRef.current = model;
    }

    // Create editor with the model
    editorRef.current = monaco.editor.create(containerRef.current, {
      model,
      theme,
      readOnly,
      automaticLayout: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      fontSize: 14,
      lineNumbers: 'on',
      renderWhitespace: 'selection',
      folding: true,
      glyphMargin: true,
    });

    // Add click handler for glyph margin and line numbers (for adding comments and AI review)
    editorRef.current.onMouseDown((e) => {
      const lineNumber = e.target.position?.lineNumber;

      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        if (lineNumber) {
          // Check if this is an AI review decoration
          if (onAIReviewClick) {
            const aiDecoration = findDecorationAtLine(aiReviewDataRef.current, lineNumber);
            if (aiDecoration) {
              onAIReviewClick(aiDecoration);
              return; // Don't trigger add comment for AI review items
            }
          }

          // Otherwise, show inline comment form
          if (editorRef.current) {
            const lineTop = editorRef.current.getTopForLineNumber(lineNumber);
            const scrollTop = editorRef.current.getScrollTop();
            setActiveCommentLine({
              line: lineNumber,
              top: lineTop - scrollTop + 20,
            });
          }
        }
      } else if (e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
        // Click on line numbers also shows comment form
        if (lineNumber && editorRef.current) {
          const lineTop = editorRef.current.getTopForLineNumber(lineNumber);
          const scrollTop = editorRef.current.getScrollTop();
          setActiveCommentLine({
            line: lineNumber,
            top: lineTop - scrollTop + 20,
          });
        }
      }
    });

    // Add code navigation actions
    if (onShowReferences && onNavigateToLocation) {
      const editor = editorRef.current;

      // Find All References (Shift+F12)
      editor.addAction({
        id: 'find-all-references',
        label: 'Find All References',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        run: async (ed) => {
          const model = ed.getModel();
          const position = ed.getPosition();
          if (!model || !position) return;

          try {
            const references = await monaco.languages.getReferences(
              model.uri,
              position,
              { includeDeclaration: false }
            );

            if (references && references.length > 0) {
              const codeReferences: CodeReference[] = references.map(ref => ({
                uri: ref.uri.toString(),
                range: ref.range,
                preview: undefined, // We'll fetch this later if needed
              }));
              onShowReferences(codeReferences, 'Find All References');
            } else {
              // Show a message that no references were found
              console.log('[CodeEditor] No references found');
            }
          } catch (error) {
            console.error('[CodeEditor] Error finding references:', error);
          }
        },
      });

      // Go to Implementations (Ctrl/Cmd+F12)
      editor.addAction({
        id: 'go-to-implementations',
        label: 'Go to Implementations',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F12],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.6,
        run: async (ed) => {
          const model = ed.getModel();
          const position = ed.getPosition();
          if (!model || !position) return;

          try {
            const implementations = await monaco.languages.getImplementation(
              model.uri,
              position
            );

            if (implementations && implementations.length > 0) {
              if (implementations.length === 1) {
                // Navigate directly if only one implementation
                const impl = implementations[0];
                onNavigateToLocation(
                  impl.uri.toString(),
                  impl.range.startLineNumber,
                  impl.range.startColumn
                );
              } else {
                // Show list if multiple implementations
                const codeReferences: CodeReference[] = implementations.map(impl => ({
                  uri: impl.uri.toString(),
                  range: impl.range,
                  preview: undefined,
                }));
                onShowReferences(codeReferences, 'Go to Implementations');
              }
            } else {
              console.log('[CodeEditor] No implementations found');
            }
          } catch (error) {
            console.error('[CodeEditor] Error finding implementations:', error);
          }
        },
      });

      // Go to Type Definition
      editor.addAction({
        id: 'go-to-type-definition',
        label: 'Go to Type Definition',
        keybindings: [],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.7,
        run: async (ed) => {
          const model = ed.getModel();
          const position = ed.getPosition();
          if (!model || !position) return;

          try {
            const typeDefinitions = await monaco.languages.getTypeDefinition(
              model.uri,
              position
            );

            if (typeDefinitions && typeDefinitions.length > 0) {
              if (typeDefinitions.length === 1) {
                // Navigate directly if only one type definition
                const typeDef = typeDefinitions[0];
                onNavigateToLocation(
                  typeDef.uri.toString(),
                  typeDef.range.startLineNumber,
                  typeDef.range.startColumn
                );
              } else {
                // Show list if multiple type definitions
                const codeReferences: CodeReference[] = typeDefinitions.map(typeDef => ({
                  uri: typeDef.uri.toString(),
                  range: typeDef.range,
                  preview: undefined,
                }));
                onShowReferences(codeReferences, 'Go to Type Definition');
              }
            } else {
              console.log('[CodeEditor] No type definitions found');
            }
          } catch (error) {
            console.error('[CodeEditor] Error finding type definitions:', error);
          }
        },
      });

      // Go to Declaration
      editor.addAction({
        id: 'go-to-declaration',
        label: 'Go to Declaration',
        keybindings: [],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.8,
        run: async (ed) => {
          const model = ed.getModel();
          const position = ed.getPosition();
          if (!model || !position) return;

          try {
            const declarations = await monaco.languages.getDeclaration(
              model.uri,
              position
            );

            if (declarations && declarations.length > 0) {
              if (declarations.length === 1) {
                // Navigate directly if only one declaration
                const decl = declarations[0];
                onNavigateToLocation(
                  decl.uri.toString(),
                  decl.range.startLineNumber,
                  decl.range.startColumn
                );
              } else {
                // Show list if multiple declarations
                const codeReferences: CodeReference[] = declarations.map(decl => ({
                  uri: decl.uri.toString(),
                  range: decl.range,
                  preview: undefined,
                }));
                onShowReferences(codeReferences, 'Go to Declaration');
              }
            } else {
              console.log('[CodeEditor] No declarations found');
            }
          } catch (error) {
            console.error('[CodeEditor] Error finding declarations:', error);
          }
        },
      });

      // Go to Usage (navigate to first reference)
      editor.addAction({
        id: 'go-to-usage',
        label: 'Go to Usage',
        keybindings: [],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.9,
        run: async (ed) => {
          const model = ed.getModel();
          const position = ed.getPosition();
          if (!model || !position) return;

          try {
            const references = await monaco.languages.getReferences(
              model.uri,
              position,
              { includeDeclaration: false }
            );

            if (references && references.length > 0) {
              // Navigate to the first usage
              const firstRef = references[0];
              onNavigateToLocation(
                firstRef.uri.toString(),
                firstRef.range.startLineNumber,
                firstRef.range.startColumn
              );
            } else {
              console.log('[CodeEditor] No usages found');
            }
          } catch (error) {
            console.error('[CodeEditor] Error finding usages:', error);
          }
        },
      });

      // Go to Super Method
      editor.addAction({
        id: 'go-to-super-method',
        label: 'Go to Super Method',
        keybindings: [],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 2.0,
        run: async (ed) => {
          const model = ed.getModel();
          const position = ed.getPosition();
          if (!model || !position) return;

          try {
            // Try to get the type hierarchy and find super types
            const typeHierarchy = await monaco.languages.prepareTypeHierarchy(
              model.uri,
              position
            );

            if (typeHierarchy && typeHierarchy.length > 0) {
              // Get super types for the first item
              const superTypes = await monaco.languages.provideSupertypes(
                typeHierarchy[0]
              );

              if (superTypes && superTypes.length > 0) {
                if (superTypes.length === 1) {
                  // Navigate directly if only one super type
                  const superType = superTypes[0];
                  onNavigateToLocation(
                    superType.uri.toString(),
                    superType.range.startLineNumber,
                    superType.range.startColumn
                  );
                } else {
                  // Show list if multiple super types
                  const codeReferences: CodeReference[] = superTypes.map(st => ({
                    uri: st.uri.toString(),
                    range: st.range,
                    preview: undefined,
                  }));
                  onShowReferences(codeReferences, 'Go to Super Method');
                }
              } else {
                console.log('[CodeEditor] No super methods found');
              }
            } else {
              console.log('[CodeEditor] No type hierarchy available');
            }
          } catch (error) {
            console.error('[CodeEditor] Error finding super method:', error);
          }
        },
      });

      // Go to Test
      editor.addAction({
        id: 'go-to-test',
        label: 'Go to Test',
        keybindings: [],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 2.1,
        run: async (ed) => {
          const model = ed.getModel();
          if (!model) return;

          try {
            const currentUri = model.uri.toString();

            // Extract file path from URI
            const filePath = currentUri.replace(/^file:\/\//, '');

            // Generate possible test file patterns
            const testPatterns = [
              filePath.replace(/\.(ts|tsx|js|jsx)$/, '.test.$1'),
              filePath.replace(/\.(ts|tsx|js|jsx)$/, '.spec.$1'),
              filePath.replace(/\/src\//, '/tests/'),
              filePath.replace(/\/components\//, '/components/__tests__/'),
            ];

            // Try to find test files by checking if models exist
            let testFileFound = false;
            for (const pattern of testPatterns) {
              const testUri = monaco.Uri.file(pattern);
              const testModel = monaco.editor.getModel(testUri);

              if (testModel) {
                // Found a test file, navigate to it
                onNavigateToLocation(testUri.toString(), 1, 1);
                testFileFound = true;
                break;
              }
            }

            if (!testFileFound) {
              // If no direct test file found, search for references in test files
              const position = ed.getPosition();
              if (position) {
                const references = await monaco.languages.getReferences(
                  model.uri,
                  position,
                  { includeDeclaration: false }
                );

                // Filter references to test files
                const testReferences = references?.filter(ref =>
                  ref.uri.path.includes('.test.') ||
                  ref.uri.path.includes('.spec.') ||
                  ref.uri.path.includes('__tests__')
                ) || [];

                if (testReferences.length > 0) {
                  if (testReferences.length === 1) {
                    const testRef = testReferences[0];
                    onNavigateToLocation(
                      testRef.uri.toString(),
                      testRef.range.startLineNumber,
                      testRef.range.startColumn
                    );
                  } else {
                    const codeReferences: CodeReference[] = testReferences.map(ref => ({
                      uri: ref.uri.toString(),
                      range: ref.range,
                      preview: undefined,
                    }));
                    onShowReferences(codeReferences, 'Go to Test');
                  }
                } else {
                  console.log('[CodeEditor] No test file found');
                }
              }
            }
          } catch (error) {
            console.error('[CodeEditor] Error finding test:', error);
          }
        },
      });
    }

    return () => {
      editorRef.current?.dispose();
      // Only dispose model if it's not a shared model (no URI)
      if (modelRef.current && !filePath && !repoRoot) {
        modelRef.current.dispose();
      }
    };
  }, [onAddComment, onShowReferences, onNavigateToLocation, filePath, repoRoot]);

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

  // Highlight and scroll to specific line
  useEffect(() => {
    if (!editorRef.current || !highlightLine) return;

    const editor = editorRef.current;
    console.log('[CodeEditor] Highlighting line:', highlightLine);

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

    // Scroll to the line with a slight delay to ensure editor is ready
    setTimeout(() => {
      if (editor && !editor.getModel()?.isDisposed()) {
        editor.revealLineInCenter(highlightLine);
        console.log('[CodeEditor] Scrolled to line:', highlightLine);
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
      `;
      document.head.appendChild(style);
    }
  }, [highlightLine]);

  // Save and restore scroll position to prevent scroll jumping
  useEffect(() => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    if (!editor) return;

    // Save scroll position before any updates
    const saveScrollPosition = () => {
      scrollPositionRef.current = editor.getScrollTop();
    };

    // Listen to scroll events to continuously save position
    const scrollDisposable = editor.onDidScrollChange(() => {
      scrollPositionRef.current = editor.getScrollTop();
    });

    return () => {
      scrollDisposable.dispose();
    };
  }, [editorRef.current]);

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
        console.log('[CodeEditor] MONITOR: Decorations lost, forcing restore...');
        console.log('[CodeEditor] MONITOR: Should have:', aiReviewDecorationsRef.current.length);
        console.log('[CodeEditor] MONITOR: Actually have:', existingAIDecorations.length);

        // Save current scroll position before forcing update
        scrollPositionRef.current = editor.getScrollTop();

        // Force re-render by updating a state variable
        setForceDecorationUpdate(prev => prev + 1);
      }
    }, 500); // Check every 500ms

    return () => {
      console.log('[CodeEditor] MONITOR: Cleaning up decoration monitor');
      clearInterval(checkInterval);
    };
  }, [editorRef.current]);

  // Add AI review decorations
  useEffect(() => {
    if (!editorRef.current || !filePath) {
      console.log('[CodeEditor] Skipping AI decorations - no editor or filePath');
      return;
    }

    console.log('[CodeEditor] Setting up AI review decorations for:', filePath);
    console.log('[CodeEditor] AI review issues:', aiReviewIssues.length);
    console.log('[CodeEditor] AI review call stacks:', aiReviewCallStacks.length);

    // Add CSS for AI review icons (do this first)
    const styleId = 'ai-review-decorations-style';
    let style = document.getElementById(styleId);
    if (!style) {
      console.log('[CodeEditor] Adding AI review CSS styles');
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
      console.log('[CodeEditor] AI review data unchanged and decorations exist, skipping update');
      console.log('[CodeEditor] Current decorations:', existingAIDecorations.length);
      return;
    }

    if (forceDecorationUpdate > 0) {
      console.log('[CodeEditor] Force decoration update triggered:', forceDecorationUpdate);
    }

    if (existingAIDecorations.length === 0 && aiReviewDecorationsRef.current.length > 0) {
      console.log('[CodeEditor] Decorations were lost, re-applying...');
    }

    console.log('[CodeEditor] AI review data changed, updating decorations');
    console.log('[CodeEditor] Previous key:', previousAIReviewDataRef.current.substring(0, 100));
    console.log('[CodeEditor] Current key:', currentDataKey.substring(0, 100));
    previousAIReviewDataRef.current = currentDataKey;

    // Process AI review data for this file
    let aiDecorations = processAIReviewForFile(
      filePath,
      aiReviewIssues,
      aiReviewCallStacks
    );

    console.log('[CodeEditor] Initial decorations:', aiDecorations.length);

    // Detect function lines for call stack decorations
    if (aiReviewCallStacks && aiReviewCallStacks.length > 0) {
      console.log('[CodeEditor] Detecting function lines in code...');
      aiDecorations = aiDecorations.map((decoration) => {
        if (decoration.type === 'callstack') {
          const callStack = decoration.data as CallStackInfo;
          console.log('[CodeEditor] Looking for function:', callStack.function, 'in file:', callStack.file);
          const functionLines = detectFunctionLines(value, callStack.function);
          if (functionLines.length > 0) {
            console.log('[CodeEditor] Found function at line:', functionLines[0]);
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

    console.log('[CodeEditor] Valid decorations after filtering:', validDecorations.length);

    // Store decorations for click handling
    aiReviewDataRef.current = validDecorations;

    // Create Monaco decorations
    const monacoDecorations = createAIReviewDecorations(validDecorations);
    console.log('[CodeEditor] About to apply decorations to editor...');

    const previousDecorations = aiReviewDecorationsRef.current;
    console.log('[CodeEditor] Previous decorations count:', previousDecorations.length);

    aiReviewDecorationsRef.current = editorRef.current.deltaDecorations(
      previousDecorations,
      monacoDecorations
    );

    console.log('[CodeEditor] Applied decorations, new IDs count:', aiReviewDecorationsRef.current.length);

    // Restore scroll position after decorations are applied
    if (scrollPositionRef.current > 0) {
      // Use requestAnimationFrame to ensure decorations are rendered
      requestAnimationFrame(() => {
        editorRef.current?.setScrollTop(scrollPositionRef.current);
        console.log('[CodeEditor] Restored scroll position:', scrollPositionRef.current);
      });
    }
  }, [value, filePath, aiReviewIssues, aiReviewCallStacks, forceDecorationUpdate]);

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

  return (
    <div style={{ height, width: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

      {/* Inline Comment Form */}
      {activeCommentLine && filePath && (
        <div
          style={{
            position: 'absolute',
            top: activeCommentLine.top,
            right: 10,
            left: 10,
            maxWidth: '600px',
            margin: '0 auto',
            zIndex: 1000,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          }}
        >
          <CommentForm
            file={filePath}
            line={activeCommentLine.line}
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
