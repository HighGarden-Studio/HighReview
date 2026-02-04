/**
 * ChunkingStrategyService
 * Determines optimal chunking strategy based on AI provider type
 * and creates file chunks for review
 */

import {
  ChunkingConfig,
  ChunkingStrategy,
  FileReviewChunk,
  ChangedFileWithDiff,
} from '../types/ChunkedReviewTypes';

export class ChunkingStrategyService {
  /**
   * Get optimal chunking configuration for a provider type
   */
  getConfig(providerType: string): ChunkingConfig {
    const normalizedType = providerType.toLowerCase();

    // Local models: Sequential processing, 1 file at a time
    if (normalizedType.includes('lmstudio') || normalizedType.includes('ollama')) {
      return {
        strategy: 'sequential',
        filesPerChunk: 1,
        maxTokensPerChunk: 4096,
        maxConcurrency: 1,
      };
    }

    // Claude Code / Codex: Parallel processing, 3 files per chunk
    if (normalizedType.includes('claude') || normalizedType.includes('codex')) {
      return {
        strategy: 'parallel',
        filesPerChunk: 3,
        maxTokensPerChunk: 8192,
        maxConcurrency: 2, // Reduced from 5 to 2 to prevent local resource exhaustion
      };
    }

    // Gemini: Parallel processing, 5 files per chunk (large context)
    if (normalizedType.includes('gemini')) {
      return {
        strategy: 'parallel',
        filesPerChunk: 5,
        maxTokensPerChunk: 8192,
        maxConcurrency: 3,
      };
    }

    // Default: Conservative sequential processing
    return {
      strategy: 'sequential',
      filesPerChunk: 1,
      maxTokensPerChunk: 4096,
      maxConcurrency: 1,
    };
  }

  /**
   * Create chunks from a list of changed files
   */
  createChunks(
    files: ChangedFileWithDiff[],
    config: ChunkingConfig
  ): FileReviewChunk[] {
    const chunks: FileReviewChunk[] = [];
    const filesPerChunk = Math.max(1, config.filesPerChunk);

    // Sort files by estimated token count (smallest first for better distribution)
    const sortedFiles = [...files].sort(
      (a, b) => (a.estimatedTokens || 0) - (b.estimatedTokens || 0)
    );

    // Create chunks
    for (let i = 0; i < sortedFiles.length; i += filesPerChunk) {
      const chunkFiles = sortedFiles.slice(i, i + filesPerChunk);
      chunks.push({
        files: chunkFiles.map(f => f.path),
        diffs: chunkFiles.map(f => f.diff),
        diffHashes: chunkFiles.map(f => f.diffHash || ''),
        contexts: [], // Will be populated later with relevant context
        chunkIndex: chunks.length,
        totalChunks: 0, // Will be set after all chunks are created
      });
    }

    // Update totalChunks
    const totalChunks = chunks.length;
    chunks.forEach(chunk => {
      chunk.totalChunks = totalChunks;
    });

    console.log(`[ChunkingStrategy] Created ${chunks.length} chunks from ${files.length} files (${filesPerChunk} files/chunk)`);
    return chunks;
  }

  /**
   * Extract relevant context for a specific chunk
   * Only includes callers/abstracts directly related to the files in this chunk
   */
  extractChunkContext(
    chunk: FileReviewChunk,
    fullContext: string,
    maxContextTokens: number = 2000
  ): string {
    if (!fullContext || fullContext.trim().length === 0) {
      return '';
    }

    // Parse context sections and filter for relevant ones
    const contextSections = this.parseContextSections(fullContext);
    const relevantSections: string[] = [];
    let currentTokens = 0;

    // Estimate tokens (rough: 1 token ≈ 4 chars)
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);

    for (const section of contextSections) {
      // Check if this section mentions any file in the chunk
      const isRelevant = chunk.files.some(file => {
        const fileName = file.split('/').pop() || file;
        const fileBaseName = fileName.replace(/\.[^.]+$/, '');
        return (
          section.includes(fileName) ||
          section.includes(fileBaseName) ||
          section.toLowerCase().includes(fileBaseName.toLowerCase())
        );
      });

      if (isRelevant) {
        const sectionTokens = estimateTokens(section);
        if (currentTokens + sectionTokens <= maxContextTokens) {
          relevantSections.push(section);
          currentTokens += sectionTokens;
        }
      }
    }

    if (relevantSections.length === 0) {
      return '';
    }

    return `\n\n## Related Context\n${relevantSections.join('\n\n')}`;
  }

  /**
   * Parse context string into sections
   */
  private parseContextSections(context: string): string[] {
    // Split by common section markers
    const sections = context.split(/(?=##\s|###\s|\n---\n)/);
    return sections.filter(s => s.trim().length > 0);
  }

  /**
   * Estimate token count for a file
   */
  estimateFileTokens(content: string): number {
    // Rough estimation: 1 token ≈ 4 characters for code
    return Math.ceil(content.length / 4);
  }

  /**
   * Check if chunking is needed based on file count and provider
   */
  shouldChunk(fileCount: number, providerType: string): boolean {
    const config = this.getConfig(providerType);
    // Chunk if we have more files than a single chunk can handle
    return fileCount > config.filesPerChunk;
  }
}

// Singleton instance
let chunkingStrategyService: ChunkingStrategyService | null = null;

export function getChunkingStrategyService(): ChunkingStrategyService {
  if (!chunkingStrategyService) {
    chunkingStrategyService = new ChunkingStrategyService();
  }
  return chunkingStrategyService;
}
