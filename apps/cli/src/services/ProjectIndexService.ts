import { spawn } from 'child_process';
import { DatabaseService } from './DatabaseService.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execa } from 'execa';

interface IndexedSymbol {
  name: string;
  kind: 'class' | 'function' | 'method' | 'variable' | 'interface' | 'type' | 'constant';
  filePath: string;
  line: number;
  column: number;
  containerName?: string;
  language: string;
}

interface IndexStatus {
  projectPath: string;
  branch: string;
  commitHash: string;
  indexedAt: number;
  symbolCount: number;
  fileCount: number;
}

export class ProjectIndexService {
  private dbService: DatabaseService;
  private indexing: Map<string, Promise<void>> = new Map();

  constructor() {
    this.dbService = new DatabaseService();
    this.initializeDatabase();
  }

  /**
   * Initialize database tables for indexing
   */
  private initializeDatabase(): void {
    // Create indexes table
    this.dbService.db.exec(`
      CREATE TABLE IF NOT EXISTS project_indexes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL,
        branch TEXT NOT NULL,
        commit_hash TEXT NOT NULL,
        indexed_at INTEGER NOT NULL,
        symbol_count INTEGER NOT NULL,
        file_count INTEGER NOT NULL,
        UNIQUE(project_path, branch)
      )
    `);

    // Create symbols table
    this.dbService.db.exec(`
      CREATE TABLE IF NOT EXISTS indexed_symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL,
        branch TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        container_name TEXT,
        language TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      )
    `);

    // Create indexes for fast lookups
    this.dbService.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_symbols_name ON indexed_symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON indexed_symbols(file_path);
      CREATE INDEX IF NOT EXISTS idx_symbols_project_branch ON indexed_symbols(project_path, branch);
    `);
  }

  /**
   * Check if a project/branch needs indexing
   */
  async needsIndexing(projectPath: string, branch: string): Promise<boolean> {
    try {
      // Get current commit hash
      const { stdout: commitHash } = await execa('git', ['rev-parse', 'HEAD'], { cwd: projectPath });

      // Check if we have an index for this project/branch/commit
      const existing = this.dbService.db.prepare(`
        SELECT commit_hash FROM project_indexes
        WHERE project_path = ? AND branch = ?
      `).get(projectPath, branch) as { commit_hash: string } | undefined;

      return !existing || existing.commit_hash !== commitHash.trim();
    } catch (error) {
      console.error('[Index] Failed to check indexing status:', error);
      return true;
    }
  }

  /**
   * Index a project asynchronously
   */
  async indexProject(projectPath: string, branch: string): Promise<void> {
    const key = `${projectPath}:${branch}`;

    // If already indexing, return the existing promise
    if (this.indexing.has(key)) {
      return this.indexing.get(key)!;
    }

    const promise = this._performIndexing(projectPath, branch);
    this.indexing.set(key, promise);

    try {
      await promise;
    } finally {
      this.indexing.delete(key);
    }
  }

  /**
   * Perform actual indexing
   */
  private async _performIndexing(projectPath: string, branch: string): Promise<void> {
    console.log(`[Index] Starting indexing for ${projectPath} (${branch})`);
    const startTime = Date.now();

    try {
      // Get current commit hash
      const { stdout: commitHash } = await execa('git', ['rev-parse', 'HEAD'], { cwd: projectPath });

      // Clear old symbols
      this.dbService.db.prepare(`
        DELETE FROM indexed_symbols WHERE project_path = ? AND branch = ?
      `).run(projectPath, branch);

      // Get all source files
      const files = await this.getSourceFiles(projectPath);
      console.log(`[Index] Found ${files.length} source files`);

      // Index each file
      const symbols: IndexedSymbol[] = [];
      for (const file of files) {
        try {
          const fileSymbols = await this.indexFile(projectPath, file);
          symbols.push(...fileSymbols);
        } catch (error) {
          console.error(`[Index] Failed to index ${file}:`, error);
        }
      }

      console.log(`[Index] Found ${symbols.length} symbols`);

      // Insert symbols into database
      const insertSymbol = this.dbService.db.prepare(`
        INSERT INTO indexed_symbols
        (project_path, branch, name, kind, file_path, line, column, container_name, language, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const now = Date.now();
      for (const symbol of symbols) {
        insertSymbol.run(
          projectPath,
          branch,
          symbol.name,
          symbol.kind,
          symbol.filePath,
          symbol.line,
          symbol.column,
          symbol.containerName || null,
          symbol.language,
          now
        );
      }

      // Update index status
      this.dbService.db.prepare(`
        INSERT OR REPLACE INTO project_indexes
        (project_path, branch, commit_hash, indexed_at, symbol_count, file_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(projectPath, branch, commitHash.trim(), now, symbols.length, files.length);

      const duration = Date.now() - startTime;
      console.log(`[Index] Indexing completed in ${duration}ms: ${symbols.length} symbols from ${files.length} files`);
    } catch (error) {
      console.error('[Index] Indexing failed:', error);
      throw error;
    }
  }

  /**
   * Get all source files in the project
   */
  private async getSourceFiles(projectPath: string): Promise<string[]> {
    try {
      // Use git ls-files to get tracked files
      const { stdout } = await execa('git', ['ls-files'], { cwd: projectPath });

      const allFiles = stdout.split('\n').filter(Boolean);

      // Filter for source files
      const sourceExtensions = new Set([
        '.ts', '.tsx', '.js', '.jsx',
        '.rb',
        '.java',
        '.py',
        '.go',
        '.rs',
        '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp'
      ]);

      return allFiles.filter(file => {
        const ext = path.extname(file);
        return sourceExtensions.has(ext);
      });
    } catch (error) {
      console.error('[Index] Failed to get source files:', error);
      return [];
    }
  }

  /**
   * Index a single file
   */
  private async indexFile(projectPath: string, relativePath: string): Promise<IndexedSymbol[]> {
    const fullPath = path.join(projectPath, relativePath);
    const ext = path.extname(relativePath);

    // Determine language
    let language = 'unknown';
    let indexer: ((path: string) => Promise<IndexedSymbol[]>) | null = null;

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      language = 'typescript';
      indexer = (p) => this.indexTypeScriptFile(p, relativePath);
    } else if (ext === '.rb') {
      language = 'ruby';
      indexer = (p) => this.indexRubyFile(p, relativePath);
    } else if (ext === '.java') {
      language = 'java';
      indexer = (p) => this.indexJavaFile(p, relativePath);
    }

    if (!indexer) {
      return [];
    }

    try {
      return await indexer(fullPath);
    } catch (error) {
      console.error(`[Index] Failed to parse ${relativePath}:`, error);
      return [];
    }
  }

  /**
   * Index TypeScript/JavaScript file using simple regex patterns
   */
  private async indexTypeScriptFile(filePath: string, relativePath: string): Promise<IndexedSymbol[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const symbols: IndexedSymbol[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Class declarations
      const classMatch = line.match(/^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          filePath: relativePath,
          line: lineNum,
          column: line.indexOf(classMatch[1]) + 1,
          language: 'typescript'
        });
      }

      // Interface declarations
      const interfaceMatch = line.match(/^\s*(?:export\s+)?interface\s+(\w+)/);
      if (interfaceMatch) {
        symbols.push({
          name: interfaceMatch[1],
          kind: 'interface',
          filePath: relativePath,
          line: lineNum,
          column: line.indexOf(interfaceMatch[1]) + 1,
          language: 'typescript'
        });
      }

      // Function declarations
      const functionMatch = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      if (functionMatch) {
        symbols.push({
          name: functionMatch[1],
          kind: 'function',
          filePath: relativePath,
          line: lineNum,
          column: line.indexOf(functionMatch[1]) + 1,
          language: 'typescript'
        });
      }

      // Type declarations
      const typeMatch = line.match(/^\s*(?:export\s+)?type\s+(\w+)/);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          kind: 'type',
          filePath: relativePath,
          line: lineNum,
          column: line.indexOf(typeMatch[1]) + 1,
          language: 'typescript'
        });
      }

      // Const/let/var declarations
      const constMatch = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)/);
      if (constMatch) {
        symbols.push({
          name: constMatch[1],
          kind: 'variable',
          filePath: relativePath,
          line: lineNum,
          column: line.indexOf(constMatch[1]) + 1,
          language: 'typescript'
        });
      }
    }

    return symbols;
  }

  /**
   * Index Ruby file using simple regex patterns
   */
  private async indexRubyFile(filePath: string, relativePath: string): Promise<IndexedSymbol[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const symbols: IndexedSymbol[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Class declarations
      const classMatch = line.match(/^\s*class\s+(\w+)/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          filePath: relativePath,
          line: lineNum,
          column: line.indexOf(classMatch[1]) + 1,
          language: 'ruby'
        });
      }

      // Module declarations
      const moduleMatch = line.match(/^\s*module\s+(\w+)/);
      if (moduleMatch) {
        symbols.push({
          name: moduleMatch[1],
          kind: 'class', // Treat modules as classes
          filePath: relativePath,
          line: lineNum,
          column: line.indexOf(moduleMatch[1]) + 1,
          language: 'ruby'
        });
      }

      // Method declarations
      const methodMatch = line.match(/^\s*def\s+(?:self\.)?(\w+)/);
      if (methodMatch) {
        symbols.push({
          name: methodMatch[1],
          kind: 'method',
          filePath: relativePath,
          line: lineNum,
          column: line.indexOf(methodMatch[1]) + 1,
          language: 'ruby'
        });
      }
    }

    return symbols;
  }

  /**
   * Index Java file using simple regex patterns
   */
  private async indexJavaFile(filePath: string, relativePath: string): Promise<IndexedSymbol[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const symbols: IndexedSymbol[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Class declarations
      const classMatch = line.match(/^\s*(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          filePath: relativePath,
          line: lineNum,
          column: line.indexOf(classMatch[1]) + 1,
          language: 'java'
        });
      }

      // Interface declarations
      const interfaceMatch = line.match(/^\s*(?:public\s+)?interface\s+(\w+)/);
      if (interfaceMatch) {
        symbols.push({
          name: interfaceMatch[1],
          kind: 'interface',
          filePath: relativePath,
          line: lineNum,
          column: line.indexOf(interfaceMatch[1]) + 1,
          language: 'java'
        });
      }

      // Method declarations
      const methodMatch = line.match(/^\s*(?:public|private|protected)\s+(?:static\s+)?(?:[\w<>[\]]+\s+)?(\w+)\s*\(/);
      if (methodMatch) {
        symbols.push({
          name: methodMatch[1],
          kind: 'method',
          filePath: relativePath,
          line: lineNum,
          column: line.indexOf(methodMatch[1]) + 1,
          language: 'java'
        });
      }
    }

    return symbols;
  }

  /**
   * Find symbols by name
   */
  findSymbols(projectPath: string, branch: string, name: string): IndexedSymbol[] {
    const results = this.dbService.db.prepare(`
      SELECT name, kind, file_path, line, column, container_name, language
      FROM indexed_symbols
      WHERE project_path = ? AND branch = ? AND name LIKE ?
      LIMIT 100
    `).all(projectPath, branch, `%${name}%`);

    return results.map((row: any) => ({
      name: row.name,
      kind: row.kind,
      filePath: row.file_path,
      line: row.line,
      column: row.column,
      containerName: row.container_name,
      language: row.language
    }));
  }

  /**
   * Find symbols in a file
   */
  findSymbolsInFile(projectPath: string, branch: string, filePath: string): IndexedSymbol[] {
    const results = this.dbService.db.prepare(`
      SELECT name, kind, file_path, line, column, container_name, language
      FROM indexed_symbols
      WHERE project_path = ? AND branch = ? AND file_path = ?
    `).all(projectPath, branch, filePath);

    return results.map((row: any) => ({
      name: row.name,
      kind: row.kind,
      filePath: row.file_path,
      line: row.line,
      column: row.column,
      containerName: row.container_name,
      language: row.language
    }));
  }

  /**
   * Get index status
   */
  getIndexStatus(projectPath: string, branch: string): IndexStatus | null {
    const result = this.dbService.db.prepare(`
      SELECT * FROM project_indexes
      WHERE project_path = ? AND branch = ?
    `).get(projectPath, branch) as any;

    if (!result) {
      return null;
    }

    return {
      projectPath: result.project_path,
      branch: result.branch,
      commitHash: result.commit_hash,
      indexedAt: result.indexed_at,
      symbolCount: result.symbol_count,
      fileCount: result.file_count
    };
  }
}
