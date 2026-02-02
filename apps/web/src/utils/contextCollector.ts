import * as vscode from 'vscode';
import * as monaco from 'monaco-editor';

export interface ContextFile {
  path: string;
  reason: 'caller' | 'implementation' | 'interface' | 'abstract';
  relatedSymbol: string;
  location: {
    line: number;
    column: number;
  };
}

export interface CollectedContext {
  files: ContextFile[];
  summary: {
    totalFiles: number;
    callers: number;
    implementations: number;
    interfaces: number;
    abstracts: number;
  };
}

export type LogFunction = (category: string, message: string, details?: any) => void;

/**
 * Collect context files using LSP for AI review
 * Finds callers and implementations of modified code
 */
export class ContextCollector {
  private logger?: {
    info: LogFunction;
    success: LogFunction;
    warning: LogFunction;
    error: LogFunction;
  };

  constructor(logger?: {
    info: LogFunction;
    success: LogFunction;
    warning: LogFunction;
    error: LogFunction;
  }) {
    this.logger = logger;
  }

  private log(level: 'info' | 'success' | 'warning' | 'error', message: string, details?: any) {
    if (this.logger) {
      this.logger[level]('context', message, details);
    } else {
      console.log('[ContextCollector]', message, details);
    }
  }

  /**
   * Collect context files for changed files in a PR
   * @param changedFiles - List of changed file paths (relative to repo root)
   * @param repoRoot - Repository root path
   * @param contextScope - What to collect: 'callers', 'implementations', or 'both'
   */
  async collectContext(
    changedFiles: string[],
    repoRoot: string,
    contextScope: 'callers' | 'implementations' | 'both'
  ): Promise<CollectedContext> {
    this.log('info', 'Starting context collection', {
      changedFiles: changedFiles.length,
      repoRoot,
      contextScope,
    });

    const contextFiles: ContextFile[] = [];
    const uniquePaths = new Set<string>();

    for (const filePath of changedFiles) {
      this.log('info', `Processing file: ${filePath}`);

      try {
        // Get file URI
        const fullPath = `${repoRoot}/${filePath}`;
        const uri = monaco.Uri.file(fullPath);
        const vsUri = vscode.Uri.parse(uri.toString());

        // Get document symbols (methods, classes, interfaces, etc.)
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
          'vscode.executeDocumentSymbolProvider',
          vsUri
        );

        if (!symbols || symbols.length === 0) {
          this.log('warning', `No symbols found in file: ${filePath}`);
          continue;
        }

        this.log('info', `Found ${symbols.length} symbols in ${filePath}`);

        // Process each symbol
        for (const symbol of symbols) {
          await this.processSymbol(
            symbol,
            vsUri,
            filePath,
            repoRoot,
            contextScope,
            contextFiles,
            uniquePaths
          );
        }
      } catch (error) {
        this.log('error', `Error processing file: ${filePath}`, { error });
      }
    }

    // Calculate summary
    const summary = {
      totalFiles: uniquePaths.size,
      callers: contextFiles.filter(f => f.reason === 'caller').length,
      implementations: contextFiles.filter(f => f.reason === 'implementation').length,
      interfaces: contextFiles.filter(f => f.reason === 'interface').length,
      abstracts: contextFiles.filter(f => f.reason === 'abstract').length,
    };

    this.log('success', 'Context collection completed', summary);

    return {
      files: contextFiles,
      summary,
    };
  }

  /**
   * Process a single symbol (method, class, interface, etc.)
   */
  private async processSymbol(
    symbol: vscode.DocumentSymbol,
    fileUri: vscode.Uri,
    filePath: string,
    repoRoot: string,
    contextScope: 'callers' | 'implementations' | 'both',
    contextFiles: ContextFile[],
    uniquePaths: Set<string>
  ): Promise<void> {
    const symbolPosition = symbol.range.start;

    // Check if this is an interface or abstract class
    const isInterface = symbol.kind === vscode.SymbolKind.Interface;
    const isClass = symbol.kind === vscode.SymbolKind.Class;
    const isMethod = symbol.kind === vscode.SymbolKind.Method || symbol.kind === vscode.SymbolKind.Function;

    // Collect implementations for interfaces/abstract classes
    if ((isInterface || isClass) && (contextScope === 'implementations' || contextScope === 'both')) {
      try {
        this.log('info', `Finding implementations for: ${symbol.name}`);

        const implementations = await vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeImplementationProvider',
          fileUri,
          symbolPosition
        );

        if (implementations && implementations.length > 0) {
          this.log('success', `Found ${implementations.length} implementations for ${symbol.name}`);

          for (const impl of implementations) {
            const implPath = this.extractRelativePath(impl.uri.toString(), repoRoot);

            // Skip if it's the same file
            if (implPath === filePath) continue;

            // Skip if already added
            if (uniquePaths.has(implPath)) continue;

            uniquePaths.add(implPath);
            contextFiles.push({
              path: implPath,
              reason: isInterface ? 'interface' : 'implementation',
              relatedSymbol: symbol.name,
              location: {
                line: impl.range.start.line + 1,
                column: impl.range.start.character + 1,
              },
            });
          }
        }
      } catch (error) {
        this.log('warning', `Error finding implementations for ${symbol.name}`, { error });
      }
    }

    // Collect references (callers) for methods
    if (isMethod && (contextScope === 'callers' || contextScope === 'both')) {
      try {
        this.log('info', `Finding references for: ${symbol.name}`);

        const references = await vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeReferenceProvider',
          fileUri,
          symbolPosition
        );

        if (references && references.length > 0) {
          this.log('success', `Found ${references.length} references for ${symbol.name}`);

          for (const ref of references) {
            const refPath = this.extractRelativePath(ref.uri.toString(), repoRoot);

            // Skip if it's the same file
            if (refPath === filePath) continue;

            // Skip if it's the definition itself
            if (ref.range.start.line === symbolPosition.line) continue;

            // Skip if already added
            if (uniquePaths.has(refPath)) continue;

            uniquePaths.add(refPath);
            contextFiles.push({
              path: refPath,
              reason: 'caller',
              relatedSymbol: symbol.name,
              location: {
                line: ref.range.start.line + 1,
                column: ref.range.start.character + 1,
              },
            });
          }
        }
      } catch (error) {
        this.log('warning', `Error finding references for ${symbol.name}`, { error });
      }
    }

    // Recursively process nested symbols
    if (symbol.children && symbol.children.length > 0) {
      for (const child of symbol.children) {
        await this.processSymbol(
          child,
          fileUri,
          filePath,
          repoRoot,
          contextScope,
          contextFiles,
          uniquePaths
        );
      }
    }
  }

  /**
   * Extract relative file path from URI
   */
  private extractRelativePath(uriString: string, repoRoot: string): string {
    // Remove file:// prefix and decode URI
    let filePath = uriString.replace('file://', '');
    filePath = decodeURIComponent(filePath);

    // Make relative to repo root
    if (filePath.startsWith(repoRoot)) {
      filePath = filePath.substring(repoRoot.length);
    }

    // Remove leading slash
    if (filePath.startsWith('/')) {
      filePath = filePath.substring(1);
    }

    return filePath;
  }
}
