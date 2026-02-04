import * as monaco from 'monaco-editor';

export interface CodeReference {
  uri: string;
  range: monaco.IRange;
  preview?: string;
}

export interface LSPActionCallbacks {
  onShowReferences?: (references: CodeReference[], title: string) => void;
  onNavigateToLocation?: (uri: string, line: number, column: number) => void;
  onSearchInProject?: (query: string, currentFile: string, currentLine: number) => void;
}

export interface TreeSitterActionCallbacks {
  onShowReferences?: (references: CodeReference[], title: string) => void;
  onNavigateToLocation?: (uri: string, line: number, column: number) => void;
  onSearchInProject?: (query: string, currentFile: string, currentLine: number) => void;
  worktreePath: string;
  repoRoot: string;
}

/**
 * Register LSP-related actions to the Monaco editor.
 * DEPRECATED: VSCode services disabled in favor of Tree-sitter backend.
 */
export function registerLSPActions(_editor: monaco.editor.IStandaloneCodeEditor, _callbacks?: LSPActionCallbacks): void {
  console.log('[EditorService] LSP actions disabled');
}

export function logLSPStatus(languageId: string): void {
  const languages = monaco.languages.getLanguages();
  const hasLanguage = languages.some(l => l.id === languageId);

  console.log(`[EditorService] Language "${languageId}" registered:`, hasLanguage);
}

/**
 * Register Tree-sitter based code navigation actions
 * Uses backend API endpoints for code analysis
 */
export function registerTreeSitterActions(
  editor: monaco.editor.IStandaloneCodeEditor,
  callbacks: TreeSitterActionCallbacks
): void {
  console.log('[EditorService] Registering Tree-sitter based code navigation actions');

  const { worktreePath, repoRoot, onNavigateToLocation, onShowReferences, onSearchInProject } = callbacks;

  // Helper function to get file path from URI
  const getFilePath = (uri: monaco.Uri): string => {
    const uriString = uri.toString();
    // Remove file:// prefix and worktree/repo path
    let filePath = uriString.replace('file://', '');
    if (filePath.startsWith(worktreePath)) {
      filePath = filePath.substring(worktreePath.length + 1);
    } else if (filePath.startsWith(repoRoot)) {
      filePath = filePath.substring(repoRoot.length + 1);
    }
    // Remove .base suffix if present
    filePath = filePath.replace(/\.base$/, '');
    return filePath;
  };

  // Go to Definition (F12)
  editor.addAction({
    id: 'highreview.action.goToDefinition',
    label: 'Go to Definition',
    keybindings: [monaco.KeyCode.F12],
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.1,
    run: async (ed) => {
      const model = ed.getModel();
      const position = ed.getPosition();
      if (!model || !position) return;

      try {
        const filePath = getFilePath(model.uri);
        console.log('[EditorService] Go to Definition:', { filePath, line: position.lineNumber, column: position.column });

        const response = await fetch('/api/code-analysis/definition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worktreePath,
            filePath,
            line: position.lineNumber,
            column: position.column,
          }),
        });

        if (!response.ok) {
          console.error('[EditorService] Failed to find definition:', response.statusText);
          return;
        }

        const result = await response.json();
        console.log('[EditorService] Definition result:', result);

        if (!result.locations || result.locations.length === 0) {
          console.log('[EditorService] No definition found');
          return;
        }

        const location = result.locations[0];
        const targetUri = `file://${worktreePath}/${location.file}`;
        const currentUri = model.uri.toString();

        if (currentUri !== targetUri && onNavigateToLocation) {
          onNavigateToLocation(targetUri, location.line, location.column);
        } else {
          ed.revealPositionInCenter({ lineNumber: location.line, column: location.column });
          ed.setPosition({ lineNumber: location.line, column: location.column });
          ed.focus();
        }
      } catch (error) {
        console.error('[EditorService] Failed to find definition:', error);
      }
    }
  });

  // Find All References (Shift+F12)
  editor.addAction({
    id: 'highreview.action.findAllReferences',
    label: 'Find All References',
    keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.3,
    run: async (ed) => {
      const model = ed.getModel();
      const position = ed.getPosition();
      if (!model || !position) return;

      try {
        const filePath = getFilePath(model.uri);
        console.log('[EditorService] Find References:', { filePath, line: position.lineNumber, column: position.column });

        const response = await fetch('/api/code-analysis/references', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worktreePath,
            filePath,
            line: position.lineNumber,
            column: position.column,
          }),
        });

        if (!response.ok) {
          console.error('[EditorService] Failed to find references:', response.statusText);
          return;
        }

        const result = await response.json();
        console.log('[EditorService] References result:', result);

        if (!result.locations || result.locations.length === 0) {
          console.log('[EditorService] No references found');
          return;
        }

        // If only one reference, navigate to it
        if (result.locations.length === 1) {
          const location = result.locations[0];
          const targetUri = `file://${worktreePath}/${location.file}`;
          const currentUri = model.uri.toString();

          // Check if it's the same position
          if (currentUri === targetUri && location.line === position.lineNumber) {
            console.log('[EditorService] Only reference is the definition itself');
            return;
          }

          if (currentUri !== targetUri && onNavigateToLocation) {
            onNavigateToLocation(targetUri, location.line, location.column);
          } else {
            ed.revealPositionInCenter({ lineNumber: location.line, column: location.column });
            ed.setPosition({ lineNumber: location.line, column: location.column });
            ed.focus();
          }
          return;
        }

        // Multiple references: show in references panel
        if (onShowReferences) {
          const references: CodeReference[] = result.locations.map((loc: any) => ({
            uri: `file://${worktreePath}/${loc.file}`,
            range: {
              startLineNumber: loc.line,
              startColumn: loc.column,
              endLineNumber: loc.line,
              endColumn: loc.column + result.symbolName.length,
            },
            preview: loc.context,
          }));
          onShowReferences(references, `${result.locations.length} references to '${result.symbolName}'`);
        } else {
          // Fallback: navigate to first reference
          const location = result.locations[0];
          const targetUri = `file://${worktreePath}/${location.file}`;
          const currentUri = model.uri.toString();

          if (currentUri !== targetUri && onNavigateToLocation) {
            onNavigateToLocation(targetUri, location.line, location.column);
          } else {
            ed.revealPositionInCenter({ lineNumber: location.line, column: location.column });
            ed.setPosition({ lineNumber: location.line, column: location.column });
            ed.focus();
          }
        }
      } catch (error) {
        console.error('[EditorService] Failed to find references:', error);
      }
    }
  });

  // Go to Type Definition
  editor.addAction({
    id: 'highreview.action.goToTypeDefinition',
    label: 'Go to Type Definition',
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.4,
    run: async (ed) => {
      const model = ed.getModel();
      const position = ed.getPosition();
      if (!model || !position) return;

      try {
        const filePath = getFilePath(model.uri);
        console.log('[EditorService] Go to Type Definition:', { filePath, line: position.lineNumber, column: position.column });

        const response = await fetch('/api/code-analysis/type-definition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worktreePath,
            filePath,
            line: position.lineNumber,
            column: position.column,
          }),
        });

        if (!response.ok) {
          console.error('[EditorService] Failed to find type definition:', response.statusText);
          return;
        }

        const result = await response.json();
        console.log('[EditorService] Type definition result:', result);

        if (!result.locations || result.locations.length === 0) {
          console.log('[EditorService] No type definition found');
          return;
        }

        const location = result.locations[0];
        const targetUri = `file://${worktreePath}/${location.file}`;
        const currentUri = model.uri.toString();

        if (currentUri !== targetUri && onNavigateToLocation) {
          onNavigateToLocation(targetUri, location.line, location.column);
        } else {
          ed.revealPositionInCenter({ lineNumber: location.line, column: location.column });
          ed.setPosition({ lineNumber: location.line, column: location.column });
          ed.focus();
        }
      } catch (error) {
        console.error('[EditorService] Failed to find type definition:', error);
      }
    }
  });

  // Go to Implementation
  editor.addAction({
    id: 'highreview.action.goToImplementation',
    label: 'Go to Implementation',
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.5,
    run: async (ed) => {
      const model = ed.getModel();
      const position = ed.getPosition();
      if (!model || !position) return;

      try {
        const filePath = getFilePath(model.uri);
        console.log('[EditorService] Go to Implementation:', { filePath, line: position.lineNumber, column: position.column });

        const response = await fetch('/api/code-analysis/implementations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worktreePath,
            filePath,
            line: position.lineNumber,
            column: position.column,
          }),
        });

        if (!response.ok) {
          console.error('[EditorService] Failed to find implementations:', response.statusText);
          return;
        }

        const result = await response.json();
        console.log('[EditorService] Implementations result:', result);

        if (!result.locations || result.locations.length === 0) {
          console.log('[EditorService] No implementations found');
          return;
        }

        // If only one implementation, navigate to it
        if (result.locations.length === 1) {
          const location = result.locations[0];
          const targetUri = `file://${worktreePath}/${location.file}`;
          const currentUri = model.uri.toString();

          if (currentUri !== targetUri && onNavigateToLocation) {
            onNavigateToLocation(targetUri, location.line, location.column);
          } else {
            ed.revealPositionInCenter({ lineNumber: location.line, column: location.column });
            ed.setPosition({ lineNumber: location.line, column: location.column });
            ed.focus();
          }
          return;
        }

        // Multiple implementations: show in references panel
        if (onShowReferences) {
          const references: CodeReference[] = result.locations.map((loc: any) => ({
            uri: `file://${worktreePath}/${loc.file}`,
            range: {
              startLineNumber: loc.line,
              startColumn: loc.column,
              endLineNumber: loc.line,
              endColumn: loc.column + result.symbolName.length,
            },
            preview: loc.context,
          }));
          onShowReferences(references, `${result.locations.length} implementations of '${result.symbolName}'`);
        }
      } catch (error) {
        console.error('[EditorService] Failed to find implementations:', error);
      }
    }
  });

  // Find in Project (Alt+Shift+F12) - already implemented with ripgrep
  editor.addAction({
    id: 'highreview.action.findInProject',
    label: 'Find in Project...',
    keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.F12],
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.6,
    run: async (ed) => {
      const model = ed.getModel();
      const position = ed.getPosition();
      if (!model || !position) return;

      try {
        const wordAtPosition = model.getWordAtPosition(position);
        let searchQuery = '';

        if (wordAtPosition) {
          searchQuery = wordAtPosition.word;
        } else {
          const selection = ed.getSelection();
          if (selection && !selection.isEmpty()) {
            searchQuery = model.getValueInRange(selection);
          }
        }

        if (!searchQuery || searchQuery.trim().length === 0) {
          return;
        }

        const uri = model.uri.toString();
        const currentLine = position.lineNumber;

        if (onSearchInProject) {
          onSearchInProject(searchQuery.trim(), uri, currentLine);
        }
      } catch (error) {
        console.error('[EditorService] Failed to search in project:', error);
      }
    }
  });

  console.log('[EditorService] Registered Tree-sitter based code navigation actions');
}
