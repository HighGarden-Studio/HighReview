// Common types shared between CLI and Web
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  message: string;
}

export interface PRMetadata {
  id: number;
  number: number;
  title: string;
  author: string;
  branch: string;
  baseBranch: string;
  status: 'open' | 'closed' | 'merged';
  url: string;
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}
