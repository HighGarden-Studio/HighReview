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
  createdAt: number;
  updatedAt: number;
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
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        UNIQUE(owner, name)
      )
    `);

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
   * Get all repositories
   */
  getAllRepositories(): Repository[] {
    const stmt = this.db.prepare('SELECT * FROM repositories ORDER BY createdAt DESC');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      ...row,
      autoReview: Boolean(row.autoReview),
    }));
  }

  /**
   * Get repository by ID
   */
  getRepository(id: string): Repository | null {
    const stmt = this.db.prepare('SELECT * FROM repositories WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      ...row,
      autoReview: Boolean(row.autoReview),
    };
  }

  /**
   * Get repository by owner and name
   */
  getRepositoryByOwnerAndName(owner: string, name: string): Repository | null {
    const stmt = this.db.prepare('SELECT * FROM repositories WHERE owner = ? AND name = ?');
    const row = stmt.get(owner, name) as any;
    if (!row) return null;
    return {
      ...row,
      autoReview: Boolean(row.autoReview),
    };
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
   * Get repositories with auto review enabled
   */
  getAutoReviewRepositories(): Repository[] {
    const stmt = this.db.prepare('SELECT * FROM repositories WHERE autoReview = 1');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      ...row,
      autoReview: Boolean(row.autoReview),
    }));
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
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
