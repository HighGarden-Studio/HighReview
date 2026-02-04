import * as monaco from 'monaco-editor';

/**
 * Custom Language Features Provider using indexed code symbols
 * Provides Go to Definition, Find References, etc. using our database index
 */

interface IndexedSymbol {
  id: string;
  repoPath: string;
  filePath: string;
  symbolName: string;
  symbolKind: string;
  symbolType?: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  containerName?: string;
  documentation?: string;
  signature?: string;
  language: string;
}

export class IndexedLanguageProvider {
  private repoPath: string;
  private disposables: monaco.IDisposable[] = [];

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  /**
   * Register all language features providers
   */
  register(): void {
    // Register for TypeScript and JavaScript
    const languageIds = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'];

    for (const languageId of languageIds) {
      this.registerDefinitionProvider(languageId);
      this.registerReferenceProvider(languageId);
      this.registerHoverProvider(languageId);
      this.registerDocumentSymbolProvider(languageId);
    }

    console.log('[IndexedLanguageProvider] Registered providers for:', languageIds);
  }

  /**
   * Dispose all providers
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    console.log('[IndexedLanguageProvider] Disposed all providers');
  }

  /**
   * Register Definition Provider
   */
  private registerDefinitionProvider(languageId: string): void {
    const provider: monaco.languages.DefinitionProvider = {
      provideDefinition: async (model, position, _token) => {
        try {
          const wordInfo = model.getWordAtPosition(position);
          if (!wordInfo) return null;

          const symbolName = wordInfo.word;
          this.getRelativeFilePath(model.uri.toString());

          // Query our index
          const response = await fetch(
            `/api/indexing/definitions?repoPath=${encodeURIComponent(this.repoPath)}&symbolName=${encodeURIComponent(symbolName)}`
          );

          if (!response.ok) return null;

          const data = await response.json();
          if (!data.success || !data.definitions || data.definitions.length === 0) {
            return null;
          }

          // Convert to Monaco locations
          const locations: monaco.languages.Location[] = data.definitions.map((symbol: IndexedSymbol) => ({
            uri: monaco.Uri.file(`${this.repoPath}/${symbol.filePath}`),
            range: new monaco.Range(
              symbol.line,
              symbol.column,
              symbol.endLine || symbol.line,
              symbol.endColumn || symbol.column
            ),
          }));

          return locations;
        } catch (error) {
          console.debug('[IndexedLanguageProvider] Definition lookup failed:', error);
          return null;
        }
      },
    };

    const disposable = monaco.languages.registerDefinitionProvider(languageId, provider);
    this.disposables.push(disposable);
  }

  /**
   * Register Reference Provider
   */
  private registerReferenceProvider(languageId: string): void {
    const provider: monaco.languages.ReferenceProvider = {
      provideReferences: async (model, position, _context, _token) => {
        try {
          const wordInfo = model.getWordAtPosition(position);
          if (!wordInfo) return null;

          const symbolName = wordInfo.word;

          // First find the symbol definition
          const defResponse = await fetch(
            `/api/indexing/definitions?repoPath=${encodeURIComponent(this.repoPath)}&symbolName=${encodeURIComponent(symbolName)}`
          );

          if (!defResponse.ok) return null;

          const defData = await defResponse.json();
          if (!defData.success || !defData.definitions || defData.definitions.length === 0) {
            return null;
          }

          // For now, just return the definition itself as a reference
          // In a full implementation, we would query symbol_references table
          const locations: monaco.languages.Location[] = defData.definitions.map((symbol: IndexedSymbol) => ({
            uri: monaco.Uri.file(`${this.repoPath}/${symbol.filePath}`),
            range: new monaco.Range(
              symbol.line,
              symbol.column,
              symbol.endLine || symbol.line,
              symbol.endColumn || symbol.column
            ),
          }));

          return locations;
        } catch (error) {
          console.debug('[IndexedLanguageProvider] Reference lookup failed:', error);
          return null;
        }
      },
    };

    const disposable = monaco.languages.registerReferenceProvider(languageId, provider);
    this.disposables.push(disposable);
  }

  /**
   * Register Hover Provider
   */
  private registerHoverProvider(languageId: string): void {
    const provider: monaco.languages.HoverProvider = {
      provideHover: async (model, position, _token) => {
        try {
          const wordInfo = model.getWordAtPosition(position);
          if (!wordInfo) return null;

          const symbolName = wordInfo.word;

          const response = await fetch(
            `/api/indexing/definitions?repoPath=${encodeURIComponent(this.repoPath)}&symbolName=${encodeURIComponent(symbolName)}`
          );

          if (!response.ok) return null;

          const data = await response.json();
          if (!data.success || !data.definitions || data.definitions.length === 0) {
            return null;
          }

          const symbol = data.definitions[0] as IndexedSymbol;

          // Build hover content
          const contents: monaco.IMarkdownString[] = [];

          // Add signature
          if (symbol.signature) {
            contents.push({
              value: `\`\`\`${symbol.language}\n${symbol.symbolKind} ${symbol.symbolName}${symbol.signature}\n\`\`\``,
            });
          } else if (symbol.symbolType) {
            contents.push({
              value: `\`\`\`${symbol.language}\n${symbol.symbolKind} ${symbol.symbolName}: ${symbol.symbolType}\n\`\`\``,
            });
          } else {
            contents.push({
              value: `\`\`\`${symbol.language}\n${symbol.symbolKind} ${symbol.symbolName}\n\`\`\``,
            });
          }

          // Add documentation
          if (symbol.documentation) {
            contents.push({
              value: symbol.documentation,
            });
          }

          // Add location info
          contents.push({
            value: `*Defined in* \`${symbol.filePath}:${symbol.line}\``,
          });

          return {
            contents,
            range: new monaco.Range(
              position.lineNumber,
              wordInfo.startColumn,
              position.lineNumber,
              wordInfo.endColumn
            ),
          };
        } catch (error) {
          console.debug('[IndexedLanguageProvider] Hover lookup failed:', error);
          return null;
        }
      },
    };

    const disposable = monaco.languages.registerHoverProvider(languageId, provider);
    this.disposables.push(disposable);
  }

  /**
   * Register Document Symbol Provider
   */
  private registerDocumentSymbolProvider(languageId: string): void {
    const provider: monaco.languages.DocumentSymbolProvider = {
      provideDocumentSymbols: async (model, _token) => {
        try {
          const filePath = this.getRelativeFilePath(model.uri.toString());

          const response = await fetch(
            `/api/indexing/symbols-in-file?repoPath=${encodeURIComponent(this.repoPath)}&filePath=${encodeURIComponent(filePath)}`
          );

          if (!response.ok) return [];

          const data = await response.json();
          if (!data.success || !data.symbols) {
            return [];
          }

          // Convert to Monaco document symbols
          const symbols: monaco.languages.DocumentSymbol[] = data.symbols.map((symbol: IndexedSymbol) => ({
            name: symbol.symbolName,
            detail: symbol.signature || symbol.symbolType || '',
            kind: this.getSymbolKind(symbol.symbolKind),
            range: new monaco.Range(
              symbol.line,
              symbol.column,
              symbol.endLine || symbol.line,
              symbol.endColumn || symbol.column
            ),
            selectionRange: new monaco.Range(
              symbol.line,
              symbol.column,
              symbol.line,
              symbol.column + symbol.symbolName.length
            ),
            tags: [],
          }));

          return symbols;
        } catch (error) {
          console.debug('[IndexedLanguageProvider] Symbol lookup failed:', error);
          return [];
        }
      },
    };

    const disposable = monaco.languages.registerDocumentSymbolProvider(languageId, provider);
    this.disposables.push(disposable);
  }

  /**
   * Get relative file path from URI
   */
  private getRelativeFilePath(uriString: string): string {
    const uri = uriString.replace(/^file:\/\//, '');
    if (uri.startsWith(this.repoPath)) {
      return uri.substring(this.repoPath.length + 1);
    }
    return uri;
  }

  /**
   * Convert our symbol kind to Monaco symbol kind
   */
  private getSymbolKind(symbolKind: string): monaco.languages.SymbolKind {
    switch (symbolKind.toLowerCase()) {
      case 'function':
        return monaco.languages.SymbolKind.Function;
      case 'class':
        return monaco.languages.SymbolKind.Class;
      case 'interface':
        return monaco.languages.SymbolKind.Interface;
      case 'method':
        return monaco.languages.SymbolKind.Method;
      case 'property':
        return monaco.languages.SymbolKind.Property;
      case 'variable':
        return monaco.languages.SymbolKind.Variable;
      case 'enum':
        return monaco.languages.SymbolKind.Enum;
      case 'type':
        return monaco.languages.SymbolKind.TypeParameter;
      case 'import':
        return monaco.languages.SymbolKind.Module;
      default:
        return monaco.languages.SymbolKind.Variable;
    }
  }
}

let currentProvider: IndexedLanguageProvider | null = null;

/**
 * Register indexed language provider for a repository
 */
export function registerIndexedProvider(repoPath: string): IndexedLanguageProvider {
  // Dispose previous provider if exists
  if (currentProvider) {
    currentProvider.dispose();
  }

  // Create and register new provider
  currentProvider = new IndexedLanguageProvider(repoPath);
  currentProvider.register();

  return currentProvider;
}

/**
 * Dispose current indexed provider
 */
export function disposeIndexedProvider(): void {
  if (currentProvider) {
    currentProvider.dispose();
    currentProvider = null;
  }
}
