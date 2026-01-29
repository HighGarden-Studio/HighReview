import { useRef, useEffect, useState, memo } from 'react';
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

interface DiffEditorProps {
  original: string;
  modified: string;
  language?: string;
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

function DiffEditorComponent({
  original,
  modified,
  language = 'typescript',
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
  const [activeCommentLine, setActiveCommentLine] = useState<{
    line: number;
    top: number;
  } | null>(null);
  const [forceDecorationUpdate, setForceDecorationUpdate] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create models with proper URIs if filePath and repoRoot are provided
    let originalModel: monaco.editor.ITextModel;
    let modifiedModel: monaco.editor.ITextModel;

    if (filePath && repoRoot) {
      // Original (base) model
      const originalUri = monaco.Uri.file(`${repoRoot}/${filePath}.base`);
      const existingOriginal = monaco.editor.getModel(originalUri);
      if (existingOriginal) {
        originalModel = existingOriginal;
        originalModel.setValue(original);
      } else {
        originalModel = monaco.editor.createModel(original, language, originalUri);
      }

      // Modified (working) model
      const modifiedUri = monaco.Uri.file(`${repoRoot}/${filePath}`);
      const existingModified = monaco.editor.getModel(modifiedUri);
      if (existingModified) {
        modifiedModel = existingModified;
        modifiedModel.setValue(modified);
      } else {
        modifiedModel = monaco.editor.createModel(modified, language, modifiedUri);
      }
    } else {
      // Fallback: create models without URIs
      originalModel = monaco.editor.createModel(original, language);
      modifiedModel = monaco.editor.createModel(modified, language);
    }

    originalModelRef.current = originalModel;
    modifiedModelRef.current = modifiedModel;

    // Create diff editor
    diffEditorRef.current = monaco.editor.createDiffEditor(containerRef.current, {
      theme,
      automaticLayout: true,
      readOnly: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      fontSize: 14,
      renderSideBySide: true,
      glyphMargin: true,
    });

    diffEditorRef.current.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    // Add click handler for glyph margin and line numbers on modified editor
    const modifiedEditor = diffEditorRef.current.getModifiedEditor();

    modifiedEditor.onMouseDown((e) => {
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
          const lineTop = modifiedEditor.getTopForLineNumber(lineNumber);
          const scrollTop = modifiedEditor.getScrollTop();
          setActiveCommentLine({
            line: lineNumber,
            top: lineTop - scrollTop + 20, // Offset below the line
          });
        }
      } else if (e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
        // Click on line numbers also shows comment form
        if (lineNumber) {
          const lineTop = modifiedEditor.getTopForLineNumber(lineNumber);
          const scrollTop = modifiedEditor.getScrollTop();
          setActiveCommentLine({
            line: lineNumber,
            top: lineTop - scrollTop + 20,
          });
        }
      }
    });

    // Add code navigation actions to modified editor
    if (onShowReferences && onNavigateToLocation) {
      // Find All References (Shift+F12)
      modifiedEditor.addAction({
        id: 'find-all-references-diff',
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
                preview: undefined,
              }));
              onShowReferences(codeReferences, 'Find All References');
            } else {
              console.log('[DiffEditor] No references found');
            }
          } catch (error) {
            console.error('[DiffEditor] Error finding references:', error);
          }
        },
      });

      // Go to Implementations (Ctrl/Cmd+F12)
      modifiedEditor.addAction({
        id: 'go-to-implementations-diff',
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
                const impl = implementations[0];
                onNavigateToLocation(
                  impl.uri.toString(),
                  impl.range.startLineNumber,
                  impl.range.startColumn
                );
              } else {
                const codeReferences: CodeReference[] = implementations.map(impl => ({
                  uri: impl.uri.toString(),
                  range: impl.range,
                  preview: undefined,
                }));
                onShowReferences(codeReferences, 'Go to Implementations');
              }
            } else {
              console.log('[DiffEditor] No implementations found');
            }
          } catch (error) {
            console.error('[DiffEditor] Error finding implementations:', error);
          }
        },
      });

      // Go to Type Definition
      modifiedEditor.addAction({
        id: 'go-to-type-definition-diff',
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
                const typeDef = typeDefinitions[0];
                onNavigateToLocation(
                  typeDef.uri.toString(),
                  typeDef.range.startLineNumber,
                  typeDef.range.startColumn
                );
              } else {
                const codeReferences: CodeReference[] = typeDefinitions.map(typeDef => ({
                  uri: typeDef.uri.toString(),
                  range: typeDef.range,
                  preview: undefined,
                }));
                onShowReferences(codeReferences, 'Go to Type Definition');
              }
            } else {
              console.log('[DiffEditor] No type definitions found');
            }
          } catch (error) {
            console.error('[DiffEditor] Error finding type definitions:', error);
          }
        },
      });

      // Go to Declaration
      modifiedEditor.addAction({
        id: 'go-to-declaration-diff',
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
                const decl = declarations[0];
                onNavigateToLocation(
                  decl.uri.toString(),
                  decl.range.startLineNumber,
                  decl.range.startColumn
                );
              } else {
                const codeReferences: CodeReference[] = declarations.map(decl => ({
                  uri: decl.uri.toString(),
                  range: decl.range,
                  preview: undefined,
                }));
                onShowReferences(codeReferences, 'Go to Declaration');
              }
            } else {
              console.log('[DiffEditor] No declarations found');
            }
          } catch (error) {
            console.error('[DiffEditor] Error finding declarations:', error);
          }
        },
      });

      // Go to Usage (navigate to first reference)
      modifiedEditor.addAction({
        id: 'go-to-usage-diff',
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
              console.log('[DiffEditor] No usages found');
            }
          } catch (error) {
            console.error('[DiffEditor] Error finding usages:', error);
          }
        },
      });

      // Go to Super Method
      modifiedEditor.addAction({
        id: 'go-to-super-method-diff',
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
                console.log('[DiffEditor] No super methods found');
              }
            } else {
              console.log('[DiffEditor] No type hierarchy available');
            }
          } catch (error) {
            console.error('[DiffEditor] Error finding super method:', error);
          }
        },
      });

      // Go to Test
      modifiedEditor.addAction({
        id: 'go-to-test-diff',
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
                  console.log('[DiffEditor] No test file found');
                }
              }
            }
          } catch (error) {
            console.error('[DiffEditor] Error finding test:', error);
          }
        },
      });
    }

    return () => {
      // Dispose editor first
      if (diffEditorRef.current) {
        diffEditorRef.current.dispose();
      }
      // Only dispose models if they're not shared (no URI)
      if (originalModelRef.current && !filePath && !repoRoot) {
        originalModelRef.current.dispose();
      }
      if (modifiedModelRef.current && !filePath && !repoRoot) {
        modifiedModelRef.current.dispose();
      }
    };
  }, [onAddComment, onShowReferences, onNavigateToLocation, filePath, repoRoot]);

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
    if (!diffEditorRef.current || !highlightLine) return;

    const modifiedEditor = diffEditorRef.current.getModifiedEditor();
    if (!modifiedEditor) return;

    console.log('[DiffEditor] Highlighting line:', highlightLine);

    // Add highlight decoration
    const newDecorations: monaco.editor.IModelDeltaDecoration[] = [{
      range: new monaco.Range(highlightLine, 1, highlightLine, 1),
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

    // Scroll to the line with a slight delay to ensure editor is ready
    setTimeout(() => {
      if (modifiedEditor && !modifiedEditor.getModel()?.isDisposed()) {
        modifiedEditor.revealLineInCenter(highlightLine);
        console.log('[DiffEditor] Scrolled to line:', highlightLine);
      }
    }, 100);

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
  }, [highlightLine]);

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
        console.log('[DiffEditor] MONITOR: Decorations lost, forcing restore...');
        console.log('[DiffEditor] MONITOR: Should have:', aiReviewDecorationsRef.current.length);
        console.log('[DiffEditor] MONITOR: Actually have:', existingAIDecorations.length);

        // Save current scroll position before forcing update
        scrollPositionRef.current = modifiedEditor.getScrollTop();

        // Force re-render by updating a state variable
        setForceDecorationUpdate(prev => prev + 1);
      }
    }, 500); // Check every 500ms

    return () => {
      console.log('[DiffEditor] MONITOR: Cleaning up decoration monitor');
      clearInterval(checkInterval);
    };
  }, [diffEditorRef.current]);

  // Add AI review decorations to modified editor
  useEffect(() => {
    if (!diffEditorRef.current || !filePath) {
      console.log('[DiffEditor] Skipping AI decorations - no editor or filePath');
      return;
    }

    const modifiedEditor = diffEditorRef.current.getModifiedEditor();

    console.log('[DiffEditor] Setting up AI review decorations for:', filePath);
    console.log('[DiffEditor] AI review issues:', aiReviewIssues.length);
    console.log('[DiffEditor] AI review call stacks:', aiReviewCallStacks.length);

    // Add CSS for AI review icons (do this first)
    const styleId = 'ai-review-decorations-style';
    let style = document.getElementById(styleId);
    if (!style) {
      console.log('[DiffEditor] Adding AI review CSS styles');
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
      console.log('[DiffEditor] AI review data unchanged and decorations exist, skipping update');
      console.log('[DiffEditor] Current decorations:', existingAIDecorations.length);
      return;
    }

    if (forceDecorationUpdate > 0) {
      console.log('[DiffEditor] Force decoration update triggered:', forceDecorationUpdate);
    }

    if (existingAIDecorations.length === 0 && aiReviewDecorationsRef.current.length > 0) {
      console.log('[DiffEditor] Decorations were lost, re-applying...');
    }

    console.log('[DiffEditor] AI review data changed, updating decorations');
    console.log('[DiffEditor] Previous key:', previousAIReviewDataRef.current.substring(0, 100));
    console.log('[DiffEditor] Current key:', currentDataKey.substring(0, 100));
    previousAIReviewDataRef.current = currentDataKey;

    // Process AI review data for this file
    let aiDecorations = processAIReviewForFile(
      filePath,
      aiReviewIssues,
      aiReviewCallStacks
    );

    console.log('[DiffEditor] Initial decorations:', aiDecorations.length);

    // Detect function lines for call stack decorations
    if (aiReviewCallStacks && aiReviewCallStacks.length > 0) {
      console.log('[DiffEditor] Detecting function lines in modified code...');
      aiDecorations = aiDecorations.map((decoration) => {
        if (decoration.type === 'callstack') {
          const callStack = decoration.data as CallStackInfo;
          console.log('[DiffEditor] Looking for function:', callStack.function, 'in file:', callStack.file);
          const functionLines = detectFunctionLines(modified, callStack.function);
          if (functionLines.length > 0) {
            console.log('[DiffEditor] Found function at line:', functionLines[0]);
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

    console.log('[DiffEditor] Valid decorations after filtering:', validDecorations.length);

    // Store decorations for click handling
    aiReviewDataRef.current = validDecorations;

    // Create Monaco decorations
    const monacoDecorations = createAIReviewDecorations(validDecorations);
    console.log('[DiffEditor] About to apply decorations to editor...');

    const previousDecorations = aiReviewDecorationsRef.current;
    console.log('[DiffEditor] Previous decorations count:', previousDecorations.length);

    aiReviewDecorationsRef.current = modifiedEditor.deltaDecorations(
      previousDecorations,
      monacoDecorations
    );

    console.log('[DiffEditor] Applied decorations, new IDs count:', aiReviewDecorationsRef.current.length);

    // Restore scroll position after decorations are applied
    if (scrollPositionRef.current > 0) {
      // Use requestAnimationFrame to ensure decorations are rendered
      requestAnimationFrame(() => {
        modifiedEditor.setScrollTop(scrollPositionRef.current);
        console.log('[DiffEditor] Restored scroll position:', scrollPositionRef.current);
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
            left: '50%', // Show on the right (modified) side
            maxWidth: '600px',
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
export const DiffEditor = memo(DiffEditorComponent);
