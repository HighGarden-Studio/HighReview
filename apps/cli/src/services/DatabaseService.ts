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

export class DatabaseService {
  private db: Database.Database;

  constructor() {
    const dbDir = join(homedir(), '.highreview');
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = join(dbDir, 'highreview.db');
    this.db = new Database(dbPath);

    this.initializeTables();
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
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
