import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export interface ChatMessage {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  filePath?: string;
  codeContext?: string;
  commitHash?: string;
  createdAt: string;
}

export interface AuthToken {
  id: number;
  provider: 'github';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  username?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PullRequest {
  id: number;
  prNumber: number;
  owner: string;
  repo: string;
  title: string;
  body?: string;
  state: 'open' | 'closed' | 'merged';
  baseBranch: string;
  headBranch: string;
  headSha: string;
  author: string;
  url: string;
  reviewStatus?: 'pending' | 'reviewed' | 'approved' | 'changes_requested';
  createdAt: string;
  updatedAt: string;
  fetchedAt: string;
}

export interface Repository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  cronSchedule: string | null;
  autoReview: boolean;
  aiReviewOptions?: string | null; // JSON string of AI review options
  createdAt: number;
  updatedAt: number;
}

export interface AutoReviewHistory {
  id: string;
  repositoryId: string;
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  status: 'success' | 'failed' | 'partial';
  options: string; // JSON string of AI review options used
  filesReviewed: string; // JSON array of file paths
  summary: string; // AI review summary
  issueCount: number;
  criticalCount: number;
  warningCount: number;
  suggestionCount: number;
  executedAt: number;
  error?: string | null;
}

export class DatabaseService {
  private db: Database.Database;
  private static instance: DatabaseService;

  private constructor() {
    const dbDir = join(homedir(), '.highreview');
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = join(dbDir, 'highreview.db');
    this.db = new Database(dbPath);

    this.initializeTables();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Get database instance for direct access
   * Used by services that need to execute custom queries
   */
  public getDatabase(): Database.Database {
    return this.db;
  }

  private initializeTables() {
    // Create auth tokens table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL CHECK(provider = 'github'),
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at TEXT,
        username TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create pull requests table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pull_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pr_number INTEGER NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        state TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        head_branch TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        author TEXT NOT NULL,
        url TEXT NOT NULL,
        review_status TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(owner, repo, pr_number)
      )
    `);

    // Create chat messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        file_path TEXT,
        code_context TEXT,
        commit_hash TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create repositories table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        fullName TEXT NOT NULL,
        cronSchedule TEXT,
        autoReview INTEGER NOT NULL DEFAULT 0,
        aiReviewOptions TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        UNIQUE(owner, name)
      )
    `);

    // Migration: Add aiReviewOptions column if it doesn't exist
    try {
      const columns = this.db.pragma('table_info(repositories)') as Array<{ name: string; [key: string]: any }>;
      const hasAIReviewOptions = columns.some((col) => col.name === 'aiReviewOptions');
      if (!hasAIReviewOptions) {
        this.db.exec('ALTER TABLE repositories ADD COLUMN aiReviewOptions TEXT');
        console.log('[Database] Added aiReviewOptions column to repositories table');
      }
    } catch (error) {
      console.error('[Database] Failed to add aiReviewOptions column:', error);
    }

    // Create settings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `);

    // Create AI review cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_review_cache (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        prNumber INTEGER NOT NULL,
        commitSha TEXT NOT NULL,
        optionsHash TEXT NOT NULL,
        reviewData TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        UNIQUE(owner, repo, prNumber, commitSha, optionsHash)
      )
    `);

    // Create code index table for repository-level symbol indexing
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_index (
        id TEXT PRIMARY KEY,
        repoPath TEXT NOT NULL,
        filePath TEXT NOT NULL,
        symbolName TEXT NOT NULL,
        symbolKind TEXT NOT NULL,
        symbolType TEXT,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        endLine INTEGER,
        endColumn INTEGER,
        containerName TEXT,
        documentation TEXT,
        signature TEXT,
        language TEXT NOT NULL,
        fileHash TEXT NOT NULL,
        indexedAt INTEGER NOT NULL,
        UNIQUE(repoPath, filePath, symbolName, line, column)
      )
    `);

    // Create symbol references table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS symbol_references (
        id TEXT PRIMARY KEY,
        repoPath TEXT NOT NULL,
        symbolId TEXT NOT NULL,
        referencePath TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        endLine INTEGER,
        endColumn INTEGER,
        isDefinition INTEGER NOT NULL DEFAULT 0,
        indexedAt INTEGER NOT NULL,
        FOREIGN KEY (symbolId) REFERENCES code_index(id) ON DELETE CASCADE
      )
    `);



    // Create file metadata table for incremental updates
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_metadata (
        repoPath TEXT NOT NULL,
        filePath TEXT NOT NULL,
        fileHash TEXT NOT NULL,
        lastModified INTEGER NOT NULL,
        lastIndexed INTEGER NOT NULL,
        PRIMARY KEY (repoPath, filePath)
      )
    `);

    // Create auto review history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auto_review_history (
        id TEXT PRIMARY KEY,
        repositoryId TEXT NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        prNumber INTEGER NOT NULL,
        prTitle TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'partial')),
        options TEXT NOT NULL,
        filesReviewed TEXT NOT NULL,
        summary TEXT NOT NULL,
        issueCount INTEGER NOT NULL DEFAULT 0,
        criticalCount INTEGER NOT NULL DEFAULT 0,
        warningCount INTEGER NOT NULL DEFAULT 0,
        suggestionCount INTEGER NOT NULL DEFAULT 0,
        executedAt INTEGER NOT NULL,
        error TEXT,
        FOREIGN KEY (repositoryId) REFERENCES repositories(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pr_state
      ON pull_requests(state, review_status)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_session_id
      ON chat_messages(session_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_file_commit
      ON chat_messages(file_path, commit_hash)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_repo_auto_review
      ON repositories(autoReview)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_cache_lookup
      ON ai_review_cache(owner, repo, prNumber, commitSha, optionsHash)
    `);

    // Indexes for code indexing
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_code_index_symbol
      ON code_index(repoPath, symbolName)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_code_index_file
      ON code_index(repoPath, filePath)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_code_index_kind
      ON code_index(repoPath, symbolKind)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_symbol_references_symbol
      ON symbol_references(symbolId)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_symbol_references_file
      ON symbol_references(repoPath, referencePath)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_file_metadata_hash
      ON file_metadata(repoPath, fileHash)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_auto_review_history_repo
      ON auto_review_history(repositoryId, executedAt DESC)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_auto_review_history_pr
      ON auto_review_history(owner, repo, prNumber)
    `);
  }

  /**
   * Save a chat message
   */
  saveChatMessage(message: Omit<ChatMessage, 'id' | 'createdAt'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO chat_messages (session_id, role, content, file_path, code_context, commit_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      message.sessionId,
      message.role,
      message.content,
      message.filePath || null,
      message.codeContext || null,
      message.commitHash || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get chat history for a session
   */
  getChatHistory(sessionId: string): ChatMessage[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        session_id as sessionId,
        role,
        content,
        file_path as filePath,
        code_context as codeContext,
        commit_hash as commitHash,
        created_at as createdAt
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at ASC
    `);

    return stmt.all(sessionId) as ChatMessage[];
  }

  /**
   * Get chat history for a specific file and commit
   */
  getChatHistoryByFile(filePath: string, commitHash: string): ChatMessage[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        session_id as sessionId,
        role,
        content,
        file_path as filePath,
        code_context as codeContext,
        commit_hash as commitHash,
        created_at as createdAt
      FROM chat_messages
      WHERE file_path = ? AND commit_hash = ?
      ORDER BY created_at ASC
    `);

    return stmt.all(filePath, commitHash) as ChatMessage[];
  }

  /**
   * Delete chat history for a session
   */
  deleteChatHistory(sessionId: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM chat_messages WHERE session_id = ?
    `);
    stmt.run(sessionId);
  }

  /**
   * Save GitHub access token
   */
  saveAuthToken(token: Omit<AuthToken, 'id' | 'createdAt' | 'updatedAt'>): number {
    // Delete existing token for the same provider
    this.db.prepare(`DELETE FROM auth_tokens WHERE provider = ?`).run(token.provider);

    const stmt = this.db.prepare(`
      INSERT INTO auth_tokens (provider, access_token, refresh_token, expires_at, username)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      token.provider,
      token.accessToken,
      token.refreshToken || null,
      token.expiresAt || null,
      token.username || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get GitHub access token
   */
  getAuthToken(provider: 'github' = 'github'): AuthToken | null {
    const stmt = this.db.prepare(`
      SELECT
        id,
        provider,
        access_token as accessToken,
        refresh_token as refreshToken,
        expires_at as expiresAt,
        username,
        created_at as createdAt,
        updated_at as updatedAt
      FROM auth_tokens
      WHERE provider = ?
      LIMIT 1
    `);

    return stmt.get(provider) as AuthToken | null;
  }

  /**
   * Delete auth token
   */
  deleteAuthToken(provider: 'github' = 'github'): void {
    this.db.prepare(`DELETE FROM auth_tokens WHERE provider = ?`).run(provider);
  }

  /**
   * Save or update pull request
   */
  savePullRequest(pr: Omit<PullRequest, 'id' | 'fetchedAt'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO pull_requests (
        pr_number, owner, repo, title, body, state, base_branch, head_branch,
        head_sha, author, url, review_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner, repo, pr_number) DO UPDATE SET
        title = excluded.title,
        body = excluded.body,
        state = excluded.state,
        head_sha = excluded.head_sha,
        review_status = excluded.review_status,
        updated_at = excluded.updated_at,
        fetched_at = CURRENT_TIMESTAMP
    `);

    const result = stmt.run(
      pr.prNumber,
      pr.owner,
      pr.repo,
      pr.title,
      pr.body || null,
      pr.state,
      pr.baseBranch,
      pr.headBranch,
      pr.headSha,
      pr.author,
      pr.url,
      pr.reviewStatus || null,
      pr.createdAt,
      pr.updatedAt
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get pull requests by state
   */
  getPullRequests(state?: 'open' | 'closed' | 'merged'): PullRequest[] {
    let query = `
      SELECT
        id,
        pr_number as prNumber,
        owner,
        repo,
        title,
        body,
        state,
        base_branch as baseBranch,
        head_branch as headBranch,
        head_sha as headSha,
        author,
        url,
        review_status as reviewStatus,
        created_at as createdAt,
        updated_at as updatedAt,
        fetched_at as fetchedAt
      FROM pull_requests
    `;

    if (state) {
      query += ` WHERE state = ?`;
    }

    query += ` ORDER BY updated_at DESC`;

    const stmt = this.db.prepare(query);
    return state ? (stmt.all(state) as PullRequest[]) : (stmt.all() as PullRequest[]);
  }

  /**
   * Get a specific pull request
   */
  getPullRequest(owner: string, repo: string, prNumber: number): PullRequest | null {
    const stmt = this.db.prepare(`
      SELECT
        id,
        pr_number as prNumber,
        owner,
        repo,
        title,
        body,
        state,
        base_branch as baseBranch,
        head_branch as headBranch,
        head_sha as headSha,
        author,
        url,
        review_status as reviewStatus,
        created_at as createdAt,
        updated_at as updatedAt,
        fetched_at as fetchedAt
      FROM pull_requests
      WHERE owner = ? AND repo = ? AND pr_number = ?
      LIMIT 1
    `);

    return stmt.get(owner, repo, prNumber) as PullRequest | null;
  }

  /**
   * Update PR review status
   */
  updatePRReviewStatus(
    owner: string,
    repo: string,
    prNumber: number,
    status: 'pending' | 'reviewed' | 'approved' | 'changes_requested'
  ): void {
    this.db.prepare(`
      UPDATE pull_requests
      SET review_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE owner = ? AND repo = ? AND pr_number = ?
    `).run(status, owner, repo, prNumber);
  }

  /**
   * Parse repository row from database
   */
  private parseRepositoryRow(row: any): Repository {
    return {
      ...row,
      autoReview: Boolean(row.autoReview),
      aiReviewOptions: row.aiReviewOptions ? row.aiReviewOptions : null,
    };
  }

  /**
   * Get all repositories
   */
  getAllRepositories(): Repository[] {
    const stmt = this.db.prepare('SELECT * FROM repositories ORDER BY createdAt DESC');
    const rows = stmt.all() as any[];
    return rows.map(row => this.parseRepositoryRow(row));
  }

  /**
   * Get repository by ID
   */
  getRepository(id: string): Repository | null {
    const stmt = this.db.prepare('SELECT * FROM repositories WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return this.parseRepositoryRow(row);
  }

  /**
   * Get repository by owner and name
   */
  getRepositoryByOwnerAndName(owner: string, name: string): Repository | null {
    const stmt = this.db.prepare('SELECT * FROM repositories WHERE owner = ? AND name = ?');
    const row = stmt.get(owner, name) as any;
    if (!row) return null;
    return this.parseRepositoryRow(row);
  }

  /**
   * Add repository
   */
  addRepository(owner: string, name: string): Repository {
    const id = `${owner}-${name}`;
    const fullName = `${owner}/${name}`;
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO repositories (id, owner, name, fullName, cronSchedule, autoReview, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, NULL, 0, ?, ?)
    `);

    stmt.run(id, owner, name, fullName, now, now);

    return {
      id,
      owner,
      name,
      fullName,
      cronSchedule: null,
      autoReview: false,
      aiReviewOptions: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Remove repository
   */
  removeRepository(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM repositories WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Update cron schedule
   */
  updateCronSchedule(id: string, schedule: string | null, autoReview: boolean): boolean {
    const stmt = this.db.prepare(`
      UPDATE repositories
      SET cronSchedule = ?, autoReview = ?, updatedAt = ?
      WHERE id = ?
    `);
    const result = stmt.run(schedule, autoReview ? 1 : 0, Date.now(), id);
    return result.changes > 0;
  }

  /**
   * Update AI review options for a repository
   */
  updateAIReviewOptions(id: string, options: any): boolean {
    const stmt = this.db.prepare(`
      UPDATE repositories
      SET aiReviewOptions = ?, updatedAt = ?
      WHERE id = ?
    `);
    const optionsJson = options ? JSON.stringify(options) : null;
    const result = stmt.run(optionsJson, Date.now(), id);
    return result.changes > 0;
  }

  /**
   * Get repositories with auto review enabled
   */
  getAutoReviewRepositories(): Repository[] {
    const stmt = this.db.prepare('SELECT * FROM repositories WHERE autoReview = 1');
    const rows = stmt.all() as any[];
    return rows.map(row => this.parseRepositoryRow(row));
  }

  /**
   * Save auto review history
   */
  saveAutoReviewHistory(history: Omit<AutoReviewHistory, 'id'>): AutoReviewHistory {
    const id = `${history.repositoryId}-${history.prNumber}-${Date.now()}`;
    const stmt = this.db.prepare(`
      INSERT INTO auto_review_history (
        id, repositoryId, owner, repo, prNumber, prTitle, status, options,
        filesReviewed, summary, issueCount, criticalCount, warningCount,
        suggestionCount, executedAt, error
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      history.repositoryId,
      history.owner,
      history.repo,
      history.prNumber,
      history.prTitle,
      history.status,
      history.options,
      history.filesReviewed,
      history.summary,
      history.issueCount,
      history.criticalCount,
      history.warningCount,
      history.suggestionCount,
      history.executedAt,
      history.error || null
    );

    return { id, ...history };
  }

  /**
   * Get all auto review history (ordered by most recent first)
   */
  getAutoReviewHistory(limit: number = 100): AutoReviewHistory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM auto_review_history
      ORDER BY executedAt DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];
    return rows;
  }

  /**
   * Get auto review history for a specific repository
   */
  getAutoReviewHistoryByRepository(repositoryId: string, limit: number = 50): AutoReviewHistory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM auto_review_history
      WHERE repositoryId = ?
      ORDER BY executedAt DESC
      LIMIT ?
    `);
    const rows = stmt.all(repositoryId, limit) as any[];
    return rows;
  }

  /**
   * Get auto review history for a specific PR
   */
  getAutoReviewHistoryByPR(owner: string, repo: string, prNumber: number): AutoReviewHistory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM auto_review_history
      WHERE owner = ? AND repo = ? AND prNumber = ?
      ORDER BY executedAt DESC
    `);
    const rows = stmt.all(owner, repo, prNumber) as any[];
    return rows;
  }

  /**
   * Get setting by key
   */
  getSetting(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key) as any;
    return row ? row.value : null;
  }

  /**
   * Set setting
   */
  setSetting(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = ?
    `);
    const now = Date.now();
    stmt.run(key, value, now, value, now);
  }

  /**
   * Get all settings
   */
  getAllSettings(): Record<string, string> {
    const stmt = this.db.prepare('SELECT key, value FROM settings');
    const rows = stmt.all() as any[];
    const settings: Record<string, string> = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });
    return settings;
  }

  /**
   * Get AI review cache
   */
  getAIReviewCache(
    owner: string,
    repo: string,
    prNumber: number,
    commitSha: string,
    optionsHash: string
  ): any | null {
    const stmt = this.db.prepare(`
      SELECT reviewData FROM ai_review_cache
      WHERE owner = ? AND repo = ? AND prNumber = ? AND commitSha = ? AND optionsHash = ?
    `);
    const row = stmt.get(owner, repo, prNumber, commitSha, optionsHash) as any;
    return row ? JSON.parse(row.reviewData) : null;
  }

  /**
   * Set AI review cache
   */
  setAIReviewCache(
    owner: string,
    repo: string,
    prNumber: number,
    commitSha: string,
    optionsHash: string,
    reviewData: any
  ): void {
    const id = `${owner}-${repo}-${prNumber}-${commitSha}-${optionsHash}`;
    const stmt = this.db.prepare(`
      INSERT INTO ai_review_cache (id, owner, repo, prNumber, commitSha, optionsHash, reviewData, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner, repo, prNumber, commitSha, optionsHash) DO UPDATE SET reviewData = ?, createdAt = ?
    `);
    const now = Date.now();
    const dataStr = JSON.stringify(reviewData);
    stmt.run(id, owner, repo, prNumber, commitSha, optionsHash, dataStr, now, dataStr, now);
  }

  /**
   * Check if AI review cache exists
   */
  hasAIReviewCache(
    owner: string,
    repo: string,
    prNumber: number,
    commitSha: string,
    optionsHash: string
  ): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM ai_review_cache
      WHERE owner = ? AND repo = ? AND prNumber = ? AND commitSha = ? AND optionsHash = ?
    `);
    const row = stmt.get(owner, repo, prNumber, commitSha, optionsHash);
    return row !== undefined;
  }

  /**
   * Check if any AI review exists for a PR (regardless of commit or options)
   */
  hasAnyAIReview(owner: string, repo: string, prNumber: number): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM ai_review_cache
      WHERE owner = ? AND repo = ? AND prNumber = ?
      LIMIT 1
    `);
    const row = stmt.get(owner, repo, prNumber);
    return row !== undefined;
  }

  /**
   * Get latest AI review for a PR (most recent by createdAt)
   */
  getLatestAIReview(owner: string, repo: string, prNumber: number): any | null {
    const stmt = this.db.prepare(`
      SELECT reviewData, commitSha, optionsHash, createdAt
      FROM ai_review_cache
      WHERE owner = ? AND repo = ? AND prNumber = ?
      ORDER BY createdAt DESC
      LIMIT 1
    `);
    const row = stmt.get(owner, repo, prNumber) as any;
    return row ? {
      review: JSON.parse(row.reviewData),
      commitSha: row.commitSha,
      optionsHash: row.optionsHash,
      createdAt: row.createdAt,
    } : null;
  }

  /**
   * Delete old AI reviews for a PR (keep only the current commit)
   * Used to clean up outdated reviews when a new commit is added to the PR
   */
  deleteOldAIReviews(owner: string, repo: string, prNumber: number, currentCommitSha: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM ai_review_cache
      WHERE owner = ? AND repo = ? AND prNumber = ? AND commitSha != ?
    `);
    const result = stmt.run(owner, repo, prNumber, currentCommitSha);
    return result.changes;
  }

  /**
   * Delete all AI reviews for a specific PR
   * Used when re-running AI review to ensure fresh results
   */
  deleteAllAIReviews(owner: string, repo: string, prNumber: number): number {
    const stmt = this.db.prepare(`
      DELETE FROM ai_review_cache
      WHERE owner = ? AND repo = ? AND prNumber = ?
    `);
    const result = stmt.run(owner, repo, prNumber);
    return result.changes;
  }

  // ============================================================================
  // Language Settings Methods
  // ============================================================================

  /**
   * Get all language settings
   */


  // ============================================================================
  // Code Indexing Methods
  // ============================================================================

  /**
   * Save or update code symbols in the index
   */
  saveCodeSymbols(symbols: Array<{
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
  }>): void {
    const stmt = this.db.prepare(`
      INSERT INTO code_index (
        id, repoPath, filePath, symbolName, symbolKind, symbolType,
        line, column, endLine, endColumn, containerName, documentation,
        signature, language, fileHash, indexedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(repoPath, filePath, symbolName, line, column) DO UPDATE SET
        symbolKind = excluded.symbolKind,
        symbolType = excluded.symbolType,
        endLine = excluded.endLine,
        endColumn = excluded.endColumn,
        containerName = excluded.containerName,
        documentation = excluded.documentation,
        signature = excluded.signature,
        fileHash = excluded.fileHash,
        indexedAt = excluded.indexedAt
    `);

    const insertMany = this.db.transaction((symbols: any[]) => {
      for (const symbol of symbols) {
        stmt.run(
          symbol.id,
          symbol.repoPath,
          symbol.filePath,
          symbol.symbolName,
          symbol.symbolKind,
          symbol.symbolType || null,
          symbol.line,
          symbol.column,
          symbol.endLine || null,
          symbol.endColumn || null,
          symbol.containerName || null,
          symbol.documentation || null,
          symbol.signature || null,
          symbol.language,
          symbol.fileHash,
          Date.now()
        );
      }
    });

    insertMany(symbols);
  }

  /**
   * Save symbol references
   */
  saveSymbolReferences(references: Array<{
    id: string;
    repoPath: string;
    symbolId: string;
    referencePath: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    isDefinition: boolean;
  }>): void {
    const stmt = this.db.prepare(`
      INSERT INTO symbol_references (
        id, repoPath, symbolId, referencePath, line, column,
        endLine, endColumn, isDefinition, indexedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        line = excluded.line,
        column = excluded.column,
        endLine = excluded.endLine,
        endColumn = excluded.endColumn,
        isDefinition = excluded.isDefinition,
        indexedAt = excluded.indexedAt
    `);

    const insertMany = this.db.transaction((references: any[]) => {
      for (const ref of references) {
        stmt.run(
          ref.id,
          ref.repoPath,
          ref.symbolId,
          ref.referencePath,
          ref.line,
          ref.column,
          ref.endLine || null,
          ref.endColumn || null,
          ref.isDefinition ? 1 : 0,
          Date.now()
        );
      }
    });

    insertMany(references);
  }

  /**
   * Update file metadata for incremental indexing
   */
  updateFileMetadata(repoPath: string, filePath: string, fileHash: string, lastModified: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO file_metadata (repoPath, filePath, fileHash, lastModified, lastIndexed)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(repoPath, filePath) DO UPDATE SET
        fileHash = excluded.fileHash,
        lastModified = excluded.lastModified,
        lastIndexed = excluded.lastIndexed
    `);
    stmt.run(repoPath, filePath, fileHash, lastModified, Date.now());
  }

  /**
   * Get file metadata
   */
  getFileMetadata(repoPath: string, filePath: string): { fileHash: string; lastModified: number; lastIndexed: number } | null {
    const stmt = this.db.prepare(`
      SELECT fileHash, lastModified, lastIndexed
      FROM file_metadata
      WHERE repoPath = ? AND filePath = ?
    `);
    return stmt.get(repoPath, filePath) as any;
  }

  /**
   * Find symbol definitions by name
   */
  findSymbolDefinitions(repoPath: string, symbolName: string): Array<any> {
    const stmt = this.db.prepare(`
      SELECT *
      FROM code_index
      WHERE repoPath = ? AND symbolName = ?
      ORDER BY filePath, line
    `);
    return stmt.all(repoPath, symbolName);
  }

  /**
   * Find symbols in a file
   */
  findSymbolsInFile(repoPath: string, filePath: string): Array<any> {
    const stmt = this.db.prepare(`
      SELECT *
      FROM code_index
      WHERE repoPath = ? AND filePath = ?
      ORDER BY line, column
    `);
    return stmt.all(repoPath, filePath);
  }

  /**
   * Find symbol by location
   */
  findSymbolAtLocation(repoPath: string, filePath: string, line: number, column: number): any | null {
    const stmt = this.db.prepare(`
      SELECT *
      FROM code_index
      WHERE repoPath = ? AND filePath = ? AND line <= ? AND (endLine IS NULL OR endLine >= ?)
      ORDER BY ABS(line - ?) + ABS(column - ?)
      LIMIT 1
    `);
    return stmt.get(repoPath, filePath, line, line, line, column);
  }

  /**
   * Find all references to a symbol
   */
  findSymbolReferences(repoPath: string, symbolId: string): Array<any> {
    const stmt = this.db.prepare(`
      SELECT *
      FROM symbol_references
      WHERE repoPath = ? AND symbolId = ?
      ORDER BY referencePath, line, column
    `);
    return stmt.all(repoPath, symbolId);
  }

  /**
   * Delete index for a file (for re-indexing)
   */
  deleteFileIndex(repoPath: string, filePath: string): void {
    const deleteSymbols = this.db.prepare(`
      DELETE FROM code_index
      WHERE repoPath = ? AND filePath = ?
    `);

    const deleteRefs = this.db.prepare(`
      DELETE FROM symbol_references
      WHERE repoPath = ? AND referencePath = ?
    `);

    const transaction = this.db.transaction(() => {
      deleteSymbols.run(repoPath, filePath);
      deleteRefs.run(repoPath, filePath);
    });

    transaction();
  }

  /**
   * Delete entire index for a repository
   */
  deleteRepositoryIndex(repoPath: string): void {
    const deleteSymbols = this.db.prepare(`
      DELETE FROM code_index WHERE repoPath = ?
    `);

    const deleteRefs = this.db.prepare(`
      DELETE FROM symbol_references WHERE repoPath = ?
    `);

    const deleteMeta = this.db.prepare(`
      DELETE FROM file_metadata WHERE repoPath = ?
    `);

    const transaction = this.db.transaction(() => {
      deleteSymbols.run(repoPath);
      deleteRefs.run(repoPath);
      deleteMeta.run(repoPath);
    });

    transaction();
  }

  /**
   * Get indexing statistics for a repository
   */
  getIndexStats(repoPath: string): {
    totalSymbols: number;
    totalReferences: number;
    totalFiles: number;
    lastIndexed: number | null;
  } {
    const symbolCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM code_index WHERE repoPath = ?
    `).get(repoPath) as any;

    const refCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM symbol_references WHERE repoPath = ?
    `).get(repoPath) as any;

    const fileCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM file_metadata WHERE repoPath = ?
    `).get(repoPath) as any;

    const lastIndexed = this.db.prepare(`
      SELECT MAX(lastIndexed) as lastIndexed FROM file_metadata WHERE repoPath = ?
    `).get(repoPath) as any;

    return {
      totalSymbols: symbolCount.count,
      totalReferences: refCount.count,
      totalFiles: fileCount.count,
      lastIndexed: lastIndexed.lastIndexed,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
