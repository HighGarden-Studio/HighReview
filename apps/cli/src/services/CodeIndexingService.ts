import * as ts from 'typescript';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { DatabaseService } from './DatabaseService.js';
import { glob } from 'glob';
// @ts-ignore - java-parser doesn't have types
import { parse as parseJava } from 'java-parser';

export interface CodeSymbol {
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
  fileHash: string;
}

export interface SymbolReference {
  id: string;
  repoPath: string;
  symbolId: string;
  referencePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  isDefinition: boolean;
}

export class CodeIndexingService {
  private db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  /**
   * Index an entire repository
   */
  async indexRepository(
    repoPath: string,
    onProgress?: (current: number, total: number, file: string) => void
  ): Promise<void> {
    console.log(`[CodeIndexing] Starting repository indexing: ${repoPath}`);

    // Index all supported languages using Tree-sitter
    const patterns = [
      '**/*.ts', '**/*.tsx',
      '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs',
      '**/*.py', '**/*.pyi', '**/*.pyw',
      '**/*.java',
      '**/*.kt', '**/*.kts',
      '**/*.vue',
    ];

    console.log(`[CodeIndexing] Indexing files with Tree-sitter for all supported languages`);

    const ignorePatterns = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.cache/**',
      '**/target/**', // Java build output
      '**/.idea/**', // IntelliJ IDEA
      '**/.vscode/**',
    ];

    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: repoPath,
        absolute: false,
        ignore: ignorePatterns,
      });
      files.push(...matches);
    }

    console.log(`[CodeIndexing] Found ${files.length} files to index`);

    // Index files in batches
    const batchSize = 50;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, Math.min(i + batchSize, files.length));
      await Promise.all(
        batch.map(async (file, idx) => {
          const current = i + idx + 1;
          if (onProgress) {
            onProgress(current, files.length, file);
          }
          await this.indexFile(repoPath, file);
        })
      );
    }

    const stats = this.db.getIndexStats(repoPath);
    console.log(`[CodeIndexing] Indexing complete:`, stats);
  }

  /**
   * Index a single file (with incremental update support)
   */
  async indexFile(repoPath: string, filePath: string): Promise<void> {
    const fullPath = path.join(repoPath, filePath);

    try {
      // Check if file needs re-indexing
      const stats = await fs.stat(fullPath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const fileHash = createHash('sha256').update(content).digest('hex');

      const metadata = this.db.getFileMetadata(repoPath, filePath);
      if (metadata && metadata.fileHash === fileHash) {
        // File hasn't changed, skip indexing
        return;
      }

      // Delete old index for this file
      this.db.deleteFileIndex(repoPath, filePath);

      // Parse and extract symbols
      const language = this.getLanguage(filePath);
      const symbols = await this.extractSymbols(repoPath, filePath, content, language, fileHash);

      // Save symbols to database
      if (symbols.length > 0) {
        this.db.saveCodeSymbols(symbols);
      }

      // Update file metadata
      this.db.updateFileMetadata(repoPath, filePath, fileHash, stats.mtimeMs);

      console.log(`[CodeIndexing] Indexed ${filePath}: ${symbols.length} symbols`);
    } catch (error) {
      console.error(`[CodeIndexing] Failed to index ${filePath}:`, error);
    }
  }

  /**
   * Extract symbols from source code
   */
  private async extractSymbols(
    repoPath: string,
    filePath: string,
    content: string,
    language: string,
    fileHash: string
  ): Promise<CodeSymbol[]> {
    if (language === 'java') {
      return this.extractJavaSymbols(repoPath, filePath, content, fileHash);
    } else {
      return this.extractTypeScriptSymbols(repoPath, filePath, content, language, fileHash);
    }
  }

  /**
   * Extract symbols from TypeScript/JavaScript using TypeScript Compiler API
   */
  private async extractTypeScriptSymbols(
    repoPath: string,
    filePath: string,
    content: string,
    language: string,
    fileHash: string
  ): Promise<CodeSymbol[]> {
    const symbols: CodeSymbol[] = [];

    try {
      // Create source file
      const scriptKind = this.getScriptKind(filePath);
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        scriptKind
      );

      // Walk the AST and extract symbols
      const visit = (node: ts.Node, containerName?: string) => {
        let symbolName: string | undefined;
        let symbolKind: string | undefined;
        let symbolType: string | undefined;
        let signature: string | undefined;
        let documentation: string | undefined;

        // Extract symbol information based on node type
        if (ts.isFunctionDeclaration(node) && node.name) {
          symbolName = node.name.text;
          symbolKind = 'function';
          signature = this.getFunctionSignature(node);
          documentation = this.getDocumentation(node, sourceFile);
        } else if (ts.isClassDeclaration(node) && node.name) {
          symbolName = node.name.text;
          symbolKind = 'class';
          documentation = this.getDocumentation(node, sourceFile);
        } else if (ts.isInterfaceDeclaration(node)) {
          symbolName = node.name.text;
          symbolKind = 'interface';
          documentation = this.getDocumentation(node, sourceFile);
        } else if (ts.isTypeAliasDeclaration(node)) {
          symbolName = node.name.text;
          symbolKind = 'type';
          documentation = this.getDocumentation(node, sourceFile);
        } else if (ts.isEnumDeclaration(node)) {
          symbolName = node.name.text;
          symbolKind = 'enum';
          documentation = this.getDocumentation(node, sourceFile);
        } else if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
          symbolName = node.name.text;
          symbolKind = 'method';
          signature = this.getFunctionSignature(node);
          documentation = this.getDocumentation(node, sourceFile);
        } else if (ts.isPropertyDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
          symbolName = node.name.text;
          symbolKind = 'property';
          if (node.type) {
            symbolType = node.type.getText(sourceFile);
          }
          documentation = this.getDocumentation(node, sourceFile);
        } else if (ts.isVariableStatement(node)) {
          for (const declaration of node.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name)) {
              const varSymbol = this.createSymbol(
                repoPath,
                filePath,
                declaration.name.text,
                'variable',
                declaration.type?.getText(sourceFile),
                declaration,
                sourceFile,
                containerName,
                this.getDocumentation(node, sourceFile),
                undefined,
                language,
                fileHash
              );
              symbols.push(varSymbol);
            }
          }
        } else if (ts.isImportDeclaration(node)) {
          // Track imports for better navigation
          const importClause = node.importClause;
          if (importClause) {
            if (importClause.name) {
              const importSymbol = this.createSymbol(
                repoPath,
                filePath,
                importClause.name.text,
                'import',
                undefined,
                importClause.name,
                sourceFile,
                undefined,
                undefined,
                undefined,
                language,
                fileHash
              );
              symbols.push(importSymbol);
            }
            if (importClause.namedBindings) {
              if (ts.isNamedImports(importClause.namedBindings)) {
                for (const element of importClause.namedBindings.elements) {
                  const importSymbol = this.createSymbol(
                    repoPath,
                    filePath,
                    element.name.text,
                    'import',
                    undefined,
                    element.name,
                    sourceFile,
                    undefined,
                    undefined,
                    undefined,
                    language,
                    fileHash
                  );
                  symbols.push(importSymbol);
                }
              }
            }
          }
        }

        // Create symbol if we found one
        if (symbolName && symbolKind) {
          const symbol = this.createSymbol(
            repoPath,
            filePath,
            symbolName,
            symbolKind,
            symbolType,
            node,
            sourceFile,
            containerName,
            documentation,
            signature,
            language,
            fileHash
          );
          symbols.push(symbol);

          // Update container name for nested symbols
          if (symbolKind === 'class' || symbolKind === 'interface') {
            containerName = symbolName;
          }
        }

        // Recursively visit children
        ts.forEachChild(node, (child) => visit(child, containerName));
      };

      visit(sourceFile);
    } catch (error) {
      console.error(`[CodeIndexing] Failed to parse ${filePath}:`, error);
    }

    return symbols;
  }

  /**
   * Extract symbols from Java using java-parser
   */
  private async extractJavaSymbols(
    repoPath: string,
    filePath: string,
    content: string,
    fileHash: string
  ): Promise<CodeSymbol[]> {
    const symbols: CodeSymbol[] = [];

    try {
      const cst = parseJava(content);

      // Walk through the CST and extract symbols
      this.visitJavaNode(cst, repoPath, filePath, fileHash, symbols);
    } catch (error) {
      console.error(`[CodeIndexing] Failed to parse Java file ${filePath}:`, error);
    }

    return symbols;
  }

  /**
   * Visit Java CST nodes recursively
   */
  private visitJavaNode(
    node: any,
    repoPath: string,
    filePath: string,
    fileHash: string,
    symbols: CodeSymbol[],
    containerName?: string
  ): void {
    if (!node || typeof node !== 'object') return;

    try {
      // Class declaration
      if (node.name === 'classDeclaration' && node.children?.normalClassDeclaration) {
        const classNode = node.children.normalClassDeclaration[0];
        const className = classNode.children?.typeIdentifier?.[0]?.children?.Identifier?.[0]?.image;

        if (className) {
          const location = classNode.children?.typeIdentifier?.[0]?.location;
          if (location) {
            symbols.push({
              id: `${repoPath}:${filePath}:${className}:${location.startLine}:${location.startColumn}`,
              repoPath,
              filePath,
              symbolName: className,
              symbolKind: 'class',
              line: location.startLine,
              column: location.startColumn,
              endLine: location.endLine,
              endColumn: location.endColumn,
              language: 'java',
              fileHash,
            });
          }

          // Visit class body for methods and fields
          if (classNode.children?.classBody) {
            this.visitJavaNode(
              classNode.children.classBody[0],
              repoPath,
              filePath,
              fileHash,
              symbols,
              className
            );
          }
        }
      }

      // Interface declaration
      if (node.name === 'interfaceDeclaration' && node.children?.normalInterfaceDeclaration) {
        const interfaceNode = node.children.normalInterfaceDeclaration[0];
        const interfaceName = interfaceNode.children?.typeIdentifier?.[0]?.children?.Identifier?.[0]?.image;

        if (interfaceName) {
          const location = interfaceNode.children?.typeIdentifier?.[0]?.location;
          if (location) {
            symbols.push({
              id: `${repoPath}:${filePath}:${interfaceName}:${location.startLine}:${location.startColumn}`,
              repoPath,
              filePath,
              symbolName: interfaceName,
              symbolKind: 'interface',
              line: location.startLine,
              column: location.startColumn,
              endLine: location.endLine,
              endColumn: location.endColumn,
              language: 'java',
              fileHash,
            });
          }

          // Visit interface body
          if (interfaceNode.children?.interfaceBody) {
            this.visitJavaNode(
              interfaceNode.children.interfaceBody[0],
              repoPath,
              filePath,
              fileHash,
              symbols,
              interfaceName
            );
          }
        }
      }

      // Enum declaration
      if (node.name === 'enumDeclaration') {
        const enumName = node.children?.typeIdentifier?.[0]?.children?.Identifier?.[0]?.image;

        if (enumName) {
          const location = node.children?.typeIdentifier?.[0]?.location;
          if (location) {
            symbols.push({
              id: `${repoPath}:${filePath}:${enumName}:${location.startLine}:${location.startColumn}`,
              repoPath,
              filePath,
              symbolName: enumName,
              symbolKind: 'enum',
              line: location.startLine,
              column: location.startColumn,
              endLine: location.endLine,
              endColumn: location.endColumn,
              containerName,
              language: 'java',
              fileHash,
            });
          }
        }
      }

      // Method declaration
      if (node.name === 'methodDeclaration') {
        const methodName = node.children?.methodHeader?.[0]?.children?.methodDeclarator?.[0]?.children?.Identifier?.[0]?.image;

        if (methodName) {
          const location = node.children?.methodHeader?.[0]?.children?.methodDeclarator?.[0]?.children?.Identifier?.[0]?.location;
          if (location) {
            // Extract method signature
            let signature = '';
            const params = node.children?.methodHeader?.[0]?.children?.methodDeclarator?.[0]?.children?.formalParameterList;
            if (params) {
              signature = '(...)'; // Simplified for now
            } else {
              signature = '()';
            }

            symbols.push({
              id: `${repoPath}:${filePath}:${methodName}:${location.startLine}:${location.startColumn}`,
              repoPath,
              filePath,
              symbolName: methodName,
              symbolKind: 'method',
              line: location.startLine,
              column: location.startColumn,
              endLine: location.endLine,
              endColumn: location.endColumn,
              containerName,
              signature,
              language: 'java',
              fileHash,
            });
          }
        }
      }

      // Field declaration
      if (node.name === 'fieldDeclaration') {
        const varDeclarators = node.children?.variableDeclaratorList?.[0]?.children?.variableDeclarator;

        if (varDeclarators) {
          for (const varDecl of varDeclarators) {
            const fieldName = varDecl?.children?.variableDeclaratorId?.[0]?.children?.Identifier?.[0]?.image;

            if (fieldName) {
              const location = varDecl?.children?.variableDeclaratorId?.[0]?.children?.Identifier?.[0]?.location;
              if (location) {
                symbols.push({
                  id: `${repoPath}:${filePath}:${fieldName}:${location.startLine}:${location.startColumn}`,
                  repoPath,
                  filePath,
                  symbolName: fieldName,
                  symbolKind: 'property',
                  line: location.startLine,
                  column: location.startColumn,
                  endLine: location.endLine,
                  endColumn: location.endColumn,
                  containerName,
                  language: 'java',
                  fileHash,
                });
              }
            }
          }
        }
      }

      // Recursively visit all children
      if (node.children) {
        for (const key in node.children) {
          const children = node.children[key];
          if (Array.isArray(children)) {
            for (const child of children) {
              this.visitJavaNode(child, repoPath, filePath, fileHash, symbols, containerName);
            }
          }
        }
      }
    } catch (error) {
      // Silently ignore parsing errors for individual nodes
    }
  }

  /**
   * Create a code symbol object
   */
  private createSymbol(
    repoPath: string,
    filePath: string,
    symbolName: string,
    symbolKind: string,
    symbolType: string | undefined,
    node: ts.Node,
    sourceFile: ts.SourceFile,
    containerName: string | undefined,
    documentation: string | undefined,
    signature: string | undefined,
    language: string,
    fileHash: string
  ): CodeSymbol {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    const id = `${repoPath}:${filePath}:${symbolName}:${start.line}:${start.character}`;

    return {
      id,
      repoPath,
      filePath,
      symbolName,
      symbolKind,
      symbolType,
      line: start.line + 1, // 1-based line numbers
      column: start.character + 1,
      endLine: end.line + 1,
      endColumn: end.character + 1,
      containerName,
      documentation,
      signature,
      language,
      fileHash,
    };
  }

  /**
   * Get function signature
   */
  private getFunctionSignature(node: ts.FunctionDeclaration | ts.MethodDeclaration): string {
    const params = node.parameters.map(p => {
      const name = p.name.getText();
      const type = p.type ? `: ${p.type.getText()}` : '';
      return `${name}${type}`;
    }).join(', ');

    const returnType = node.type ? `: ${node.type.getText()}` : '';
    return `(${params})${returnType}`;
  }

  /**
   * Extract documentation from JSDoc comments
   */
  private getDocumentation(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
    const jsDoc = (node as any).jsDoc;
    if (jsDoc && jsDoc.length > 0) {
      const comment = jsDoc[0].comment;
      if (typeof comment === 'string') {
        return comment;
      }
    }
    return undefined;
  }

  /**
   * Get language from file extension
   */
  private getLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        return 'javascript';
      case '.py':
      case '.pyi':
      case '.pyw':
        return 'python';
      case '.css':
      case '.scss':
      case '.sass':
      case '.less':
        return 'css';
      case '.html':
      case '.htm':
      case '.xhtml':
        return 'html';
      case '.json':
      case '.jsonc':
        return 'json';
      case '.java':
        return 'java';
      case '.cs':
      case '.csx':
        return 'csharp';
      case '.cpp':
      case '.cc':
      case '.cxx':
      case '.hpp':
      case '.hh':
      case '.hxx':
        return 'cpp';
      case '.c':
      case '.h':
        // Check if it's C++ or C based on file content or context
        // For simplicity, treat .h as C (can be improved)
        return filePath.includes('include/c++') || filePath.includes('hpp') ? 'cpp' : 'c';
      case '.php':
      case '.phtml':
      case '.php3':
      case '.php4':
      case '.php5':
        return 'php';
      case '.swift':
        return 'swift';
      case '.kt':
      case '.kts':
        return 'kotlin';
      case '.go':
        return 'go';
      case '.rs':
        return 'rust';
      case '.rb':
      case '.rake':
      case '.gemspec':
        return 'ruby';
      case '.dart':
        return 'dart';
      case '.scala':
      case '.sc':
        return 'scala';
      case '.lua':
        return 'lua';
      case '.pl':
      case '.pm':
      case '.pod':
        return 'perl';
      default:
        return 'unknown';
    }
  }

  /**
   * Get TypeScript ScriptKind from file extension
   */
  private getScriptKind(filePath: string): ts.ScriptKind {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
        return ts.ScriptKind.TS;
      case '.tsx':
        return ts.ScriptKind.TSX;
      case '.jsx':
        return ts.ScriptKind.JSX;
      case '.js':
      default:
        return ts.ScriptKind.JS;
    }
  }

  /**
   * Re-index specific files (for incremental updates)
   */
  async reindexFiles(repoPath: string, filePaths: string[]): Promise<void> {
    console.log(`[CodeIndexing] Re-indexing ${filePaths.length} files`);

    for (const filePath of filePaths) {
      await this.indexFile(repoPath, filePath);
    }

    console.log(`[CodeIndexing] Re-indexing complete`);
  }

  /**
   * Delete index for a single file
   */
  deleteFileIndex(repoPath: string, filePath: string): void {
    this.db.deleteFileIndex(repoPath, filePath);
    console.log(`[CodeIndexing] Deleted index for ${filePath}`);
  }

  /**
   * Delete repository index
   */
  deleteRepositoryIndex(repoPath: string): void {
    this.db.deleteRepositoryIndex(repoPath);
    console.log(`[CodeIndexing] Deleted index for ${repoPath}`);
  }

  /**
   * Get indexing statistics
   */
  getIndexStats(repoPath: string) {
    return this.db.getIndexStats(repoPath);
  }

  /**
   * Find symbol definitions
   */
  async findDefinitions(repoPath: string, symbolName: string): Promise<CodeSymbol[]> {
    return this.db.findSymbolDefinitions(repoPath, symbolName) as CodeSymbol[];
  }

  /**
   * Find symbols in a file
   */
  async findSymbolsInFile(repoPath: string, filePath: string): Promise<CodeSymbol[]> {
    return this.db.findSymbolsInFile(repoPath, filePath) as CodeSymbol[];
  }

  /**
   * Find symbol at a specific location
   */
  async findSymbolAtLocation(
    repoPath: string,
    filePath: string,
    line: number,
    column: number
  ): Promise<CodeSymbol | null> {
    return this.db.findSymbolAtLocation(repoPath, filePath, line, column) as CodeSymbol | null;
  }
}
