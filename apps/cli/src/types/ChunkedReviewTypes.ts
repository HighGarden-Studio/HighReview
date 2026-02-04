/**
 * Types for chunked file review processing
 * Supports both sequential (local models) and parallel (cloud models) execution
 */

/**
 * A review comment from AI analysis
 */
export interface ReviewComment {
  file: string;
  line: number;
  severity: 'critical' | 'warning' | 'suggestion';
  category: string;
  message: string;
  suggestion?: string;
}

/**
 * A chunk of files to be reviewed together
 */
export interface FileReviewChunk {
  /** Files included in this chunk */
  files: string[];
  /** File diffs for this chunk */
  diffs: string[];
  /** Diff hashes for this chunk (for caching) */
  diffHashes?: string[];
  /** Related context (callers, abstracts, dependencies) */
  contexts: string[];
  /** Index of this chunk (0-based) */
  chunkIndex: number;
  /** Total number of chunks */
  totalChunks: number;
}

/**
 * Detailed change intent analysis
 */
export interface ChangeIntent {
  file?: string;
  level: 'file' | 'block';
  intent: string;
  motivation: string;
  impact?: string;
}

/**
 * Impact analysis structure
 */
export interface ImpactAnalysis {
  scope: string;
  affectedAreas: string[];
  breakingChanges?: string[];
  sideEffects?: string[];
  description?: string;
}

/**
 * Call stack information with mermaid diagrams
 */
export interface CallStackInfo {
  function: string;
  file: string;
  callers: string[];
  flowchart?: string; // Mermaid flowchart
  sequence?: string;  // Mermaid sequence diagram
}

/**
 * Detected moved code
 */
export interface MovedCode {
  from: string;
  to: string;
  lines: number;
}

/**
 * Detected refactoring
 */
export interface Refactoring {
  type: string;
  description: string;
  files: string[];
}

/**
 * Result of reviewing a single chunk
 */
export interface ChunkReviewResult {
  /** Index of the reviewed chunk */
  chunkIndex: number;
  /** Whether the review succeeded */
  success: boolean;
  /** Whether the result came from cache */
  cached?: boolean;
  /** Review results for this chunk */
  criticalIssues?: ReviewComment[];
  warnings?: ReviewComment[];
  suggestions?: ReviewComment[];
  summary?: string;
  
  // Enhanced structured data
  changeIntents?: ChangeIntent[];
  impactAnalysis?: ImpactAnalysis;
  callStacks?: CallStackInfo[];
  movedCode?: MovedCode[];
  refactorings?: Refactoring[];
  semanticAnalysis?: string; // Keep as fallback/raw analysis

  // Legacy fields (kept for backward compatibility during transition)
  changeIntent?: string;
  impact?: string;
  
  /** Error message if failed */
  error?: string;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Files that were reviewed */
  reviewedFiles: string[];
}

/**
 * Progress information for chunked review
 */
export interface ChunkedReviewProgress {
  /** Current chunk being processed (1-based for display) */
  currentChunk: number;
  /** Total number of chunks */
  totalChunks: number;
  /** Files currently being reviewed */
  currentFiles: string[];
  /** Files that have been completed */
  completedFiles: string[];
  /** Failed files (if any) */
  failedFiles: string[];
  /** Current status */
  status: 'preparing' | 'chunking' | 'reviewing' | 'merging' | 'summarizing' | 'completed' | 'error';
  /** Optional status message */
  message?: string;
  /** Elapsed time in milliseconds */
  elapsedMs?: number;
}

/**
 * Strategy for processing chunks
 */
export type ChunkingStrategy = 'sequential' | 'parallel';

/**
 * Configuration for chunking based on provider type
 */
export interface ChunkingConfig {
  /** Processing strategy */
  strategy: ChunkingStrategy;
  /** Number of files per chunk */
  filesPerChunk: number;
  /** Maximum tokens for response per chunk */
  maxTokensPerChunk: number;
  /** For parallel strategy, max concurrent requests */
  maxConcurrency?: number;
}

/**
 * Changed file with its diff content
 */
export interface ChangedFileWithDiff {
  /** File path */
  path: string;
  /** Diff content for this file */
  diff: string;
  /** File content (optional) */
  content?: string;
  /** Approximate token count */
  estimatedTokens?: number;
  /** SHA-256 hash of the diff content for caching */
  diffHash?: string;
}
