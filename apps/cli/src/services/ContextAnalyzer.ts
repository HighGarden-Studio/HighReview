import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import JavaScript from 'tree-sitter-javascript';
import Java from 'tree-sitter-java';
import Python from 'tree-sitter-python';
import Kotlin from 'tree-sitter-kotlin';
import { execa } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ModifiedSymbol {
  name: string;
  type: 'function' | 'class' | 'method' | 'variable';
  file: string;
  line: number;
}

interface Reference {
  file: string;
  line: number;
  column: number;
  context: string; // 5 lines of context
}

interface ContextResult {
  symbol: ModifiedSymbol;
  references: Reference[];
  totalReferences: number;
}

interface SymbolLocation {
  file: string;
  line: number;
  column: number;
  name: string;
  type: 'function' | 'class' | 'method' | 'variable' | 'interface' | 'type';
  context: string; // 5 lines of context
}

interface NavigationResult {
  locations: SymbolLocation[];
  symbolName: string;
}

/**
 * Tree-sitter based context analyzer for AI review
 *
 * Extracts modified symbols from diff and finds their usages
 * without requiring LSP or build tools.
 */
export class ContextAnalyzer {
  private parsers: Map<string, Parser> = new Map();

  constructor() {
    this.initializeParsers();
  }

  /**
   * Initialize Tree-sitter parsers for supported languages
   */
  private initializeParsers(): void {
    // TypeScript
    const tsParser = new Parser();
    tsParser.setLanguage(TypeScript.typescript);
    this.parsers.set('typescript', tsParser);
    this.parsers.set('ts', tsParser);
    this.parsers.set('tsx', tsParser);

    // JavaScript
    const jsParser = new Parser();
    jsParser.setLanguage(JavaScript);
    this.parsers.set('javascript', jsParser);
    this.parsers.set('js', jsParser);
    this.parsers.set('jsx', jsParser);

    // Java
    const javaParser = new Parser();
    javaParser.setLanguage(Java);
    this.parsers.set('java', javaParser);

    // Python
    const pythonParser = new Parser();
    pythonParser.setLanguage(Python);
    this.parsers.set('python', pythonParser);
    this.parsers.set('py', pythonParser);

    // Kotlin
    const kotlinParser = new Parser();
    kotlinParser.setLanguage(Kotlin);
    this.parsers.set('kotlin', kotlinParser);
    this.parsers.set('kt', kotlinParser);
    this.parsers.set('kts', kotlinParser);

    // Vue (use JavaScript parser for Vue files as fallback)
    this.parsers.set('vue', jsParser);

    console.log('[ContextAnalyzer] Initialized parsers for:', Array.from(this.parsers.keys()));
  }

  /**
   * Analyze changes and build context for AI review
   */
  async analyzeChanges(
    diff: string,
    worktreePath: string
  ): Promise<ContextResult[]> {
    console.log('[ContextAnalyzer] Analyzing changes in:', worktreePath);

    // 1. Extract modified symbols from diff
    const modifiedSymbols = await this.extractModifiedSymbols(diff, worktreePath);
    console.log('[ContextAnalyzer] Found modified symbols:', modifiedSymbols.length);

    // 2. Find references for each symbol
    const results: ContextResult[] = [];
    for (const symbol of modifiedSymbols) {
      const references = await this.findReferences(symbol, worktreePath);
      results.push({
        symbol,
        references,
        totalReferences: references.length,
      });
    }

    console.log('[ContextAnalyzer] Total context results:', results.length);
    return results;
  }

  /**
   * Extract modified functions/classes from diff
   */
  private async extractModifiedSymbols(
    diff: string,
    worktreePath: string
  ): Promise<ModifiedSymbol[]> {
    const symbols: ModifiedSymbol[] = [];

    // Parse diff to find changed files and lines
    const changedFiles = this.parseDiff(diff);

    for (const fileChange of changedFiles) {
      const filePath = path.join(worktreePath, fileChange.path);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const ext = path.extname(fileChange.path).slice(1);
        const parser = this.parsers.get(ext);

        if (!parser) {
          console.log(`[ContextAnalyzer] No parser for ${ext}, skipping ${fileChange.path}`);
          continue;
        }

        // Parse file
        const tree = parser.parse(content);

        // Find symbols that contain changed lines
        for (const changedLine of fileChange.changedLines) {
          const symbolsAtLine = this.findSymbolsAtLine(
            tree.rootNode,
            changedLine,
            fileChange.path
          );
          symbols.push(...symbolsAtLine);
        }
      } catch (error) {
        console.warn(`[ContextAnalyzer] Failed to parse ${fileChange.path}:`, error);
      }
    }

    // Deduplicate by name+file
    const uniqueSymbols = Array.from(
      new Map(symbols.map(s => [`${s.file}:${s.name}`, s])).values()
    );

    return uniqueSymbols;
  }

  /**
   * Parse diff to extract changed files and lines
   */
  private parseDiff(diff: string): Array<{ path: string; changedLines: number[] }> {
    const changes: Array<{ path: string; changedLines: number[] }> = [];
    const lines = diff.split('\n');

    let currentFile: string | null = null;
    let currentLine = 0;
    let changedLines: number[] = [];

    for (const line of lines) {
      // File header: diff --git a/file b/file
      if (line.startsWith('diff --git')) {
        if (currentFile && changedLines.length > 0) {
          changes.push({ path: currentFile, changedLines });
        }
        const match = line.match(/b\/(.+)$/);
        currentFile = match ? match[1] : null;
        changedLines = [];
        currentLine = 0;
      }
      // Hunk header: @@ -10,5 +10,7 @@
      else if (line.startsWith('@@')) {
        const match = line.match(/\+(\d+)/);
        if (match) {
          currentLine = parseInt(match[1], 10);
        }
      }
      // Added line
      else if (line.startsWith('+') && !line.startsWith('+++')) {
        changedLines.push(currentLine);
        currentLine++;
      }
      // Context line
      else if (!line.startsWith('-') && !line.startsWith('\\')) {
        currentLine++;
      }
    }

    // Add last file
    if (currentFile && changedLines.length > 0) {
      changes.push({ path: currentFile, changedLines });
    }

    return changes;
  }

  /**
   * Find function/class declarations at a specific line
   */
  private findSymbolsAtLine(
    node: Parser.SyntaxNode,
    line: number,
    file: string
  ): ModifiedSymbol[] {
    const symbols: ModifiedSymbol[] = [];

    // Check if this node contains the line
    if (node.startPosition.row > line || node.endPosition.row < line) {
      return symbols;
    }

    // Check if this node is a symbol definition
    const symbolInfo = this.extractSymbolInfo(node, file);
    if (symbolInfo && node.startPosition.row <= line && node.endPosition.row >= line) {
      symbols.push(symbolInfo);
    }

    // Recursively check children
    for (const child of node.children) {
      symbols.push(...this.findSymbolsAtLine(child, line, file));
    }

    return symbols;
  }

  /**
   * Extract symbol information from a node
   */
  private extractSymbolInfo(
    node: Parser.SyntaxNode,
    file: string
  ): ModifiedSymbol | null {
    // Function declaration
    if (node.type === 'function_declaration' ||
        node.type === 'function' ||
        node.type === 'method_definition' ||
        node.type === 'method_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        return {
          name: nameNode.text,
          type: node.type.includes('method') ? 'method' : 'function',
          file,
          line: node.startPosition.row + 1,
        };
      }
    }

    // Class declaration
    if (node.type === 'class_declaration' || node.type === 'class') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        return {
          name: nameNode.text,
          type: 'class',
          file,
          line: node.startPosition.row + 1,
        };
      }
    }

    // Variable declaration (const, let, var)
    if (node.type === 'variable_declarator') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        return {
          name: nameNode.text,
          type: 'variable',
          file,
          line: node.startPosition.row + 1,
        };
      }
    }

    return null;
  }

  /**
   * Find references to a symbol using ripgrep + Tree-sitter verification
   */
  private async findReferences(
    symbol: ModifiedSymbol,
    worktreePath: string
  ): Promise<Reference[]> {
    const references: Reference[] = [];

    try {
      // Step 1: Use ripgrep for fast text search
      const { stdout } = await execa('rg', [
        symbol.name,
        worktreePath,
        '--line-number',
        '--column',
        '--no-heading',
        '--with-filename',
        '--max-count', '50', // Limit to 50 matches per file
      ], { reject: false });

      if (!stdout) {
        return references;
      }

      // Step 2: Parse ripgrep output
      const matches = stdout.split('\n').filter(line => line.trim());

      // Step 3: Verify each match with Tree-sitter
      for (const match of matches) {
        const [filePath, lineStr, columnStr, ...textParts] = match.split(':');
        const line = parseInt(lineStr, 10);
        const column = parseInt(columnStr, 10);

        // Skip if it's the definition itself
        if (filePath.endsWith(symbol.file) && Math.abs(line - symbol.line) < 2) {
          continue;
        }

        // Verify it's an actual call/usage
        const isActualCall = await this.verifyReference(
          filePath,
          line,
          column,
          symbol.name
        );

        if (isActualCall) {
          // Get context (5 lines before and after)
          const context = await this.getContext(filePath, line, 5);
          references.push({
            file: path.relative(worktreePath, filePath),
            line,
            column,
            context,
          });
        }
      }
    } catch (error) {
      console.warn(`[ContextAnalyzer] Failed to find references for ${symbol.name}:`, error);
    }

    return references;
  }

  /**
   * Verify if a text match is an actual function call using Tree-sitter
   */
  private async verifyReference(
    filePath: string,
    line: number,
    column: number,
    symbolName: string
  ): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).slice(1);
      const parser = this.parsers.get(ext);

      if (!parser) {
        // No parser available, accept match
        return true;
      }

      const tree = parser.parse(content);
      const position = { row: line - 1, column: column - 1 };
      const node = tree.rootNode.descendantForPosition(position, position);

      // Check if node is a call expression or identifier in call context
      if (!node) return false;

      // Check node type
      const isCall =
        node.type === 'call_expression' ||
        node.type === 'method_invocation' ||
        node.type === 'function_call' ||
        node.parent?.type === 'call_expression' ||
        node.parent?.type === 'method_invocation';

      // Also check if it's the identifier itself
      const isIdentifier =
        (node.type === 'identifier' || node.type === 'name') &&
        node.text === symbolName;

      return isCall || isIdentifier;
    } catch (error) {
      // If verification fails, accept the match
      console.warn(`[ContextAnalyzer] Verification failed for ${filePath}:${line}`);
      return true;
    }
  }

  /**
   * Get context lines around a specific line
   */
  private async getContext(
    filePath: string,
    line: number,
    contextLines: number
  ): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, line - contextLines - 1);
      const end = Math.min(lines.length, line + contextLines);

      return lines
        .slice(start, end)
        .map((l, i) => `${start + i + 1}: ${l}`)
        .join('\n');
    } catch (error) {
      return '';
    }
  }

  /**
   * Build context snippets for AI prompt
   */
  buildAIContext(results: ContextResult[]): string {
    const sections: string[] = [];

    for (const result of results) {
      const { symbol, references } = result;

      sections.push(
        `\n## Modified: ${symbol.name} (${symbol.type}) in ${symbol.file}:${symbol.line}\n`
      );

      if (references.length === 0) {
        sections.push('No usages found in the codebase.\n');
      } else {
        sections.push(`Found ${references.length} usage(s):\n`);

        for (const ref of references.slice(0, 10)) { // Limit to 10 references
          sections.push(`\n### ${ref.file}:${ref.line}\n\`\`\`\n${ref.context}\n\`\`\`\n`);
        }

        if (references.length > 10) {
          sections.push(`\n... and ${references.length - 10} more usage(s)\n`);
        }
      }
    }

    return sections.join('\n');
  }

  /**
   * Get symbol at a specific position in a file
   */
  async getSymbolAtPosition(
    filePath: string,
    line: number,
    column: number
  ): Promise<{ name: string; type: string } | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).slice(1);
      const parser = this.parsers.get(ext);

      if (!parser) {
        console.log(`[ContextAnalyzer] No parser for ${ext}`);
        return null;
      }

      const tree = parser.parse(content);
      const position = { row: line - 1, column: column - 1 };
      const node = tree.rootNode.descendantForPosition(position, position);

      if (!node) return null;

      // Find the identifier node (support multiple identifier types for different languages)
      let identifierNode = node;
      const identifierTypes = ['identifier', 'type_identifier', 'simple_identifier'];

      if (!identifierTypes.includes(node.type)) {
        // Try to find identifier in children
        for (const child of node.children) {
          if (identifierTypes.includes(child.type)) {
            identifierNode = child;
            break;
          }
        }
      }

      if (identifierTypes.includes(identifierNode.type)) {
        return {
          name: identifierNode.text,
          type: identifierNode.type
        };
      }

      return null;
    } catch (error) {
      console.warn(`[ContextAnalyzer] Failed to get symbol at position:`, error);
      return null;
    }
  }

  /**
   * Find definition of a symbol
   */
  async findDefinition(
    filePath: string,
    line: number,
    column: number,
    worktreePath: string
  ): Promise<NavigationResult> {
    console.log('[ContextAnalyzer] Finding definition for', { filePath, line, column });

    // Get symbol at current position
    const symbol = await this.getSymbolAtPosition(path.join(worktreePath, filePath), line, column);
    if (!symbol) {
      return { locations: [], symbolName: '' };
    }

    console.log('[ContextAnalyzer] Symbol:', symbol);

    const locations: SymbolLocation[] = [];

    try {
      // Step 1: Check current file for definition
      const currentFileContent = await fs.readFile(path.join(worktreePath, filePath), 'utf-8');
      const ext = path.extname(filePath).slice(1);
      const parser = this.parsers.get(ext);

      if (parser) {
        const tree = parser.parse(currentFileContent);
        const definitions = this.findDefinitionsInTree(tree.rootNode, symbol.name, filePath);
        locations.push(...definitions);
      }

      // Step 2: Search other files using ripgrep
      console.log(`[ContextAnalyzer] Searching for symbol '${symbol.name}' in ${worktreePath}`);
      const { stdout } = await execa('rg', [
        `\\b${symbol.name}\\b`,
        worktreePath,
        '--line-number',
        '--column',
        '--no-heading',
        '--with-filename',
        '--max-count', '20',
        '--type-add', 'source:*.{ts,tsx,js,jsx,java,kt,kts,py,go,rs,vue}',
        '--type', 'source'
      ], { reject: false });

      console.log(`[ContextAnalyzer] Ripgrep found ${stdout ? stdout.split('\n').filter(l => l.trim()).length : 0} matches`);

      if (stdout) {
        const matches = stdout.split('\n').filter(line => line.trim());
        console.log(`[ContextAnalyzer] Processing ${matches.length} matches for verification`);

        for (const match of matches) {
          const [matchFilePath, lineStr, columnStr] = match.split(':');
          const matchLine = parseInt(lineStr, 10);
          const matchColumn = parseInt(columnStr, 10);

          // Skip current position
          if (matchFilePath.endsWith(filePath) && matchLine === line) {
            continue;
          }

          // Verify if this is a definition
          const isDef = await this.verifyDefinition(matchFilePath, matchLine, matchColumn, symbol.name);
          console.log(`[ContextAnalyzer] Verification result for ${matchFilePath}:${matchLine}: ${isDef}`);
          if (isDef) {
            const context = await this.getContext(matchFilePath, matchLine, 5);
            locations.push({
              file: path.relative(worktreePath, matchFilePath),
              line: matchLine,
              column: matchColumn,
              name: symbol.name,
              type: 'function', // Will be refined by verifyDefinition
              context
            });
          }
        }
      }
    } catch (error) {
      console.warn(`[ContextAnalyzer] Failed to find definition:`, error);
    }

    console.log(`[ContextAnalyzer] Found ${locations.length} definition(s) after verification`);
    return { locations, symbolName: symbol.name };
  }

  /**
   * Find definitions in a syntax tree
   */
  private findDefinitionsInTree(
    node: Parser.SyntaxNode,
    symbolName: string,
    file: string
  ): SymbolLocation[] {
    const definitions: SymbolLocation[] = [];

    // Check if this node is a definition
    if (
      // TypeScript/JavaScript
      node.type === 'function_declaration' ||
      node.type === 'function' ||
      node.type === 'method_definition' ||
      node.type === 'method_declaration' ||
      node.type === 'class_declaration' ||
      node.type === 'class' ||
      node.type === 'interface_declaration' ||
      node.type === 'type_alias_declaration' ||
      node.type === 'variable_declarator' ||
      // Java/Kotlin
      node.type === 'class_body' ||
      node.type === 'property_declaration' ||
      // Kotlin specific
      node.type === 'object_declaration' ||
      node.type === 'property_definition'
    ) {
      const nameNode = node.childForFieldName('name') || node.childForFieldName('simple_identifier');
      if (nameNode && nameNode.text === symbolName) {
        definitions.push({
          file,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          name: symbolName,
          type: this.getSymbolTypeFromNode(node.type),
          context: ''
        });
      }
    }

    // Recursively search children
    for (const child of node.children) {
      definitions.push(...this.findDefinitionsInTree(child, symbolName, file));
    }

    return definitions;
  }

  /**
   * Verify if a match is a definition
   */
  private async verifyDefinition(
    filePath: string,
    line: number,
    column: number,
    symbolName: string
  ): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).slice(1);
      const parser = this.parsers.get(ext);

      if (!parser) {
        console.log(`[ContextAnalyzer] No parser available for extension: ${ext}`);
        return false;
      }

      const tree = parser.parse(content);
      const position = { row: line - 1, column: column - 1 };
      const node = tree.rootNode.descendantForPosition(position, position);

      if (!node) {
        console.log(`[ContextAnalyzer] No node found at position ${line}:${column}`);
        return false;
      }

      console.log(`[ContextAnalyzer] Node at position: type=${node.type}, text=${node.text.substring(0, 30)}`);

      // Check if node or its parent is a definition node
      let current: Parser.SyntaxNode | null = node;
      while (current) {
        if (
          // TypeScript/JavaScript
          current.type === 'function_declaration' ||
          current.type === 'function' ||
          current.type === 'method_definition' ||
          current.type === 'method_declaration' ||
          current.type === 'class_declaration' ||
          current.type === 'class' ||
          current.type === 'interface_declaration' ||
          current.type === 'type_alias_declaration' ||
          current.type === 'variable_declarator' ||
          // Java/Kotlin
          current.type === 'class_body' ||
          current.type === 'property_declaration' ||
          current.type === 'function_declaration' ||
          // Kotlin specific
          current.type === 'class_declaration' ||
          current.type === 'object_declaration' ||
          current.type === 'property_definition'
        ) {
          const nameNode = current.childForFieldName('name') || current.childForFieldName('simple_identifier');
          return nameNode?.text === symbolName;
        }
        current = current.parent;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get symbol type from node type
   */
  private getSymbolTypeFromNode(nodeType: string): 'function' | 'class' | 'method' | 'variable' | 'interface' | 'type' {
    if (nodeType.includes('function')) return 'function';
    if (nodeType.includes('method')) return 'method';
    if (nodeType.includes('class')) return 'class';
    if (nodeType.includes('interface')) return 'interface';
    if (nodeType.includes('type_alias')) return 'type';
    return 'variable';
  }

  /**
   * Find type definition of a symbol
   */
  async findTypeDefinition(
    filePath: string,
    line: number,
    column: number,
    worktreePath: string
  ): Promise<NavigationResult> {
    console.log('[ContextAnalyzer] Finding type definition for', { filePath, line, column });

    // Get symbol at current position
    const symbol = await this.getSymbolAtPosition(path.join(worktreePath, filePath), line, column);
    if (!symbol) {
      return { locations: [], symbolName: '' };
    }

    // Try to infer the type name from context
    const typeName = await this.inferTypeName(path.join(worktreePath, filePath), line, column);
    if (!typeName) {
      return { locations: [], symbolName: symbol.name };
    }

    console.log('[ContextAnalyzer] Inferred type:', typeName);

    // Find definition of the type
    const result = await this.findDefinition(filePath, line, column, worktreePath);
    return { ...result, symbolName: typeName };
  }

  /**
   * Infer type name from variable declaration or parameter
   */
  private async inferTypeName(
    filePath: string,
    line: number,
    column: number
  ): Promise<string | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).slice(1);
      const parser = this.parsers.get(ext);

      if (!parser) return null;

      const tree = parser.parse(content);
      const position = { row: line - 1, column: column - 1 };
      const node = tree.rootNode.descendantForPosition(position, position);

      if (!node) return null;

      // Look for type annotation
      let current: Parser.SyntaxNode | null = node;
      while (current) {
        // TypeScript/JavaScript type annotation
        if (current.type === 'type_annotation') {
          const typeNode = current.childForFieldName('type');
          if (typeNode) {
            return typeNode.text;
          }
        }
        // Java type
        if (current.type === 'variable_declarator') {
          const parent = current.parent;
          if (parent && parent.type === 'local_variable_declaration') {
            const typeNode = parent.childForFieldName('type');
            if (typeNode) {
              return typeNode.text;
            }
          }
        }
        current = current.parent;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Find implementations of an interface or abstract class
   */
  async findImplementations(
    filePath: string,
    line: number,
    column: number,
    worktreePath: string
  ): Promise<NavigationResult> {
    console.log('[ContextAnalyzer] Finding implementations for', { filePath, line, column });

    // Get symbol at current position
    const symbol = await this.getSymbolAtPosition(path.join(worktreePath, filePath), line, column);
    if (!symbol) {
      return { locations: [], symbolName: '' };
    }

    console.log('[ContextAnalyzer] Symbol:', symbol);

    const locations: SymbolLocation[] = [];

    try {
      // Determine if this is a method or class/interface
      const isMethod = symbol.type === 'method' || symbol.type === 'function';

      if (isMethod) {
        // Search for method implementations (overrides)
        // Pattern: fun methodName( or override fun methodName( or @Override methodName(
        const patterns = [
          `\\bfun\\s+${symbol.name}\\s*\\(`,  // Kotlin function
          `\\boverride\\s+fun\\s+${symbol.name}\\s*\\(`,  // Kotlin override
          `@Override[^}]*\\b${symbol.name}\\s*\\(`,  // Java override
          `\\b${symbol.name}\\s*\\([^)]*\\)\\s*\\{`,  // General method implementation
        ];

        for (const pattern of patterns) {
          const { stdout } = await execa('rg', [
            pattern,
            worktreePath,
            '--line-number',
            '--column',
            '--no-heading',
            '--with-filename',
            '--max-count', '50',
            '--type-add', 'source:*.{ts,tsx,js,jsx,java,kt,kts,py,go,rs,vue}',
            '--type', 'source',
          ], { reject: false });

          if (stdout) {
            const matches = stdout.split('\n').filter(line => line.trim());

            for (const match of matches) {
              const [matchFilePath, lineStr, columnStr, ...rest] = match.split(':');
              const matchLine = parseInt(lineStr, 10);
              const matchColumn = parseInt(columnStr, 10);

              // Skip the definition itself
              if (path.resolve(matchFilePath) === path.resolve(path.join(worktreePath, filePath)) &&
                  matchLine === line) {
                continue;
              }

              const context = await this.getContext(matchFilePath, matchLine, 5);
              locations.push({
                file: path.relative(worktreePath, matchFilePath),
                line: matchLine,
                column: matchColumn,
                name: symbol.name,
                type: 'method',
                context
              });
            }
          }
        }
      } else {
        // Search for classes that implement/extend this symbol (Java, Kotlin, TypeScript)
        // Java: class X implements Y, class X extends Y
        // Kotlin: class X : Y
        // TypeScript: class X implements Y, class X extends Y
        const patterns = [
          `(implements|extends).*\\b${symbol.name}\\b`,  // Java, TypeScript
          `class\\s+\\w+\\s*:\\s*${symbol.name}\\b`,  // Kotlin
        ];

        for (const pattern of patterns) {
          const { stdout } = await execa('rg', [
            pattern,
            worktreePath,
            '--line-number',
            '--column',
            '--no-heading',
            '--with-filename',
            '--max-count', '20',
          ], { reject: false });

          if (stdout) {
            const matches = stdout.split('\n').filter(line => line.trim());

            for (const match of matches) {
              const [matchFilePath, lineStr, columnStr] = match.split(':');
              const matchLine = parseInt(lineStr, 10);
              const matchColumn = parseInt(columnStr, 10);

              // Verify if this is an actual implementation
              const isImpl = await this.verifyImplementation(matchFilePath, matchLine, symbol.name);
              if (isImpl) {
                const context = await this.getContext(matchFilePath, matchLine, 5);
                locations.push({
                  file: path.relative(worktreePath, matchFilePath),
                  line: matchLine,
                  column: matchColumn,
                  name: symbol.name,
                  type: 'class',
                  context
                });
              }
            }
          }
        }
      }

      // Remove duplicates
      const uniqueLocations = locations.filter((loc, index, self) =>
        index === self.findIndex(l => l.file === loc.file && l.line === loc.line)
      );

      console.log(`[ContextAnalyzer] Found ${uniqueLocations.length} implementation(s) for ${symbol.name}`);
      return { locations: uniqueLocations, symbolName: symbol.name };
    } catch (error) {
      console.warn(`[ContextAnalyzer] Failed to find implementations:`, error);
      return { locations: [], symbolName: symbol.name };
    }
  }

  /**
   * Verify if a match is an actual implementation
   */
  private async verifyImplementation(
    filePath: string,
    line: number,
    interfaceName: string
  ): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).slice(1);
      const parser = this.parsers.get(ext);

      if (!parser) return false;

      const tree = parser.parse(content);
      const lines = content.split('\n');
      const lineContent = lines[line - 1];

      // Check for Java/TypeScript: implements/extends
      if ((lineContent.includes('implements') || lineContent.includes('extends')) &&
          lineContent.includes(interfaceName)) {
        return true;
      }

      // Check for Kotlin: class X : Y
      // Pattern: class name : interface/base class
      if (lineContent.includes('class') && lineContent.includes(':') &&
          lineContent.includes(interfaceName)) {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Analyze comprehensive context including definitions, type definitions, implementations, and references
   * This provides much richer context for AI review by showing not just usage, but also where symbols
   * are defined, what types are involved, and what implements interfaces.
   */
  async analyzeComprehensiveContext(
    diff: string,
    worktreePath: string
  ): Promise<{
    symbols: Array<{
      name: string;
      file: string;
      line: number;
      changeType: 'added' | 'modified' | 'deleted';
      definition?: NavigationResult;
      typeDefinition?: NavigationResult;
      implementations?: NavigationResult;
      references: Array<{
        file: string;
        line: number;
        column: number;
        context: string;
      }>;
    }>;
  }> {
    console.log('[ContextAnalyzer] Analyzing comprehensive context...');

    // First, get basic symbol analysis with references
    const changedSymbols = await this.analyzeChanges(diff, worktreePath);

    const comprehensiveResults = [];

    for (const symbolData of changedSymbols) {
      console.log(`[ContextAnalyzer] Analyzing comprehensive context for symbol: ${symbolData.symbol.name}`);

      const result: any = {
        name: symbolData.symbol.name,
        file: symbolData.symbol.file,
        line: symbolData.symbol.line,
        changeType: symbolData.symbol.type,
        references: symbolData.references,
      };

      try {
        // Find definition
        const definition = await this.findDefinition(
          symbolData.symbol.file,
          symbolData.symbol.line,
          0, // column doesn't matter for this use case
          worktreePath
        );
        if (definition.locations.length > 0) {
          result.definition = definition;
          console.log(`[ContextAnalyzer] Found ${definition.locations.length} definition(s) for ${symbolData.symbol.name}`);
        }

        // Find type definition
        const typeDefinition = await this.findTypeDefinition(
          symbolData.symbol.file,
          symbolData.symbol.line,
          0,
          worktreePath
        );
        if (typeDefinition.locations.length > 0) {
          result.typeDefinition = typeDefinition;
          console.log(`[ContextAnalyzer] Found ${typeDefinition.locations.length} type definition(s) for ${symbolData.symbol.name}`);
        }

        // Find implementations (for interfaces/abstract classes)
        const implementations = await this.findImplementations(
          symbolData.symbol.file,
          symbolData.symbol.line,
          0,
          worktreePath
        );
        if (implementations.locations.length > 0) {
          result.implementations = implementations;
          console.log(`[ContextAnalyzer] Found ${implementations.locations.length} implementation(s) for ${symbolData.symbol.name}`);
        }
      } catch (error) {
        console.warn(`[ContextAnalyzer] Failed to analyze context for ${symbolData.symbol.name}:`, error);
      }

      comprehensiveResults.push(result);
    }

    console.log(`[ContextAnalyzer] Comprehensive context analysis complete: ${comprehensiveResults.length} symbols analyzed`);
    return { symbols: comprehensiveResults };
  }

  /**
   * Build AI context string from comprehensive context analysis
   * Formats all definitions, type definitions, implementations, and references for AI consumption
   */
  buildComprehensiveAIContext(contextData: {
    symbols: Array<{
      name: string;
      file: string;
      line: number;
      changeType: 'added' | 'modified' | 'deleted';
      definition?: NavigationResult;
      typeDefinition?: NavigationResult;
      implementations?: NavigationResult;
      references: Array<{
        file: string;
        line: number;
        column: number;
        context: string;
      }>;
    }>;
  }): string {
    let contextText = '';

    for (const symbolData of contextData.symbols) {
      contextText += `\n### Symbol: \`${symbolData.name}\` (${symbolData.changeType})\n`;
      contextText += `Modified in: **${symbolData.file}:${symbolData.line}**\n\n`;

      // Add definitions
      if (symbolData.definition && symbolData.definition.locations.length > 0) {
        contextText += `#### Definition(s):\n`;
        for (const loc of symbolData.definition.locations) {
          contextText += `- **${loc.file}:${loc.line}** (${loc.type})\n`;
          contextText += `\`\`\`\n${loc.context}\n\`\`\`\n\n`;
        }
      }

      // Add type definitions
      if (symbolData.typeDefinition && symbolData.typeDefinition.locations.length > 0) {
        contextText += `#### Type Definition(s):\n`;
        for (const loc of symbolData.typeDefinition.locations) {
          contextText += `- **${loc.file}:${loc.line}** (${loc.type})\n`;
          contextText += `\`\`\`\n${loc.context}\n\`\`\`\n\n`;
        }
      }

      // Add implementations
      if (symbolData.implementations && symbolData.implementations.locations.length > 0) {
        contextText += `#### Implementation(s):\n`;
        for (const loc of symbolData.implementations.locations) {
          contextText += `- **${loc.file}:${loc.line}** (${loc.type})\n`;
          contextText += `\`\`\`\n${loc.context}\n\`\`\`\n\n`;
        }
      }

      // Add references (usage)
      if (symbolData.references.length > 0) {
        contextText += `#### References (${symbolData.references.length} usage(s) found):\n`;
        // Limit to first 10 references to avoid overwhelming the AI
        const refsToShow = symbolData.references.slice(0, 10);
        for (const ref of refsToShow) {
          contextText += `- **${ref.file}:${ref.line}**\n`;
          contextText += `\`\`\`\n${ref.context}\n\`\`\`\n\n`;
        }
        if (symbolData.references.length > 10) {
          contextText += `_...and ${symbolData.references.length - 10} more reference(s)_\n\n`;
        }
      }

      contextText += '---\n';
    }

    return contextText;
  }
}
