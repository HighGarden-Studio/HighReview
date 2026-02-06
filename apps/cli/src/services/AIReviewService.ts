import { execa } from 'execa';
import { createHash } from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { AIReviewParser } from './AIReviewParser.js';
import { AIReviewKoreanParser } from './AIReviewKoreanParser.js';
import { AIProviderFactory, registerProviders, getDefaultProvider } from './providers/index.js';
import type { AIProvider } from './providers/index.js';
import { getAIConfigService } from './AIConfigService.js';
import { ContextAnalyzer } from './ContextAnalyzer.js';
import { ChunkedReviewExecutor } from './ChunkedReviewExecutor.js';
import { getChunkingStrategyService } from './ChunkingStrategyService.js';
import type { ChunkedReviewProgress, ChangedFileWithDiff } from '../types/ChunkedReviewTypes.js';

interface ReviewComment {
  file: string;
  line: number;
  severity: 'critical' | 'warning' | 'suggestion';
  category: string;
  message: string;
  suggestion?: string;
}

interface ChangeIntent {
  file?: string;
  level: 'file' | 'block';
  intent: string;
  motivation: string;
  impact?: string;
}

interface CallStackInfo {
  function: string;
  file: string;
  flowchart?: string;
  sequence?: string;
}

interface ImpactAnalysis {
  scope: string;
  affectedAreas: string[];
  breakingChanges?: string[];
  sideEffects?: string[];
}

interface MovedCode {
  from: string;
  to: string;
  lines: number;
}

interface Refactoring {
  type: string;
  description: string;
  files: string[];
}

interface ContextFile {
  path: string;
  reason: 'caller' | 'implementation' | 'interface' | 'abstract';
  relatedSymbol: string;
  location: {
    line: number;
    column: number;
  };
}

interface ReviewResult {
  summary: string;
  criticalIssues: ReviewComment[];
  warnings: ReviewComment[];
  suggestions: ReviewComment[];
  filesReviewed: number;
  totalIssues: number;

  // Enhanced sections
  changeIntents?: ChangeIntent[];
  callStacks?: CallStackInfo[];
  impactAnalysis?: ImpactAnalysis;
  movedCode?: MovedCode[];
  refactorings?: Refactoring[];

  // Legacy fields (fallback)
  changeIntent?: string;
  impact?: string;
  semanticAnalysis?: string;
}

export class AIReviewService {
  private provider: AIProvider | null = null;
  private providerId: string = 'claude-code'; // Default provider

  constructor() {
    // Register all available providers
    registerProviders();
    console.log('[AI Review] Registered providers:', AIProviderFactory.getProviderIds());
  }

  /**
   * Initialize and select the AI provider
   * Always reloads settings to ensure latest configuration is used
   */
  private async initializeProvider(): Promise<void> {
    // Always reload provider settings to ensure changes are immediately reflected
    // This ensures that when users change settings, the new provider is used right away
    
    const configService = getAIConfigService();

    // Try to get the configured provider first
    let providerId: string | null = null;

    try {
      providerId = await configService.getSelectedProvider();
      console.log(`[AI Review] Configured provider: ${providerId}`);

      // Check if configured provider is available
      const provider = AIProviderFactory.create(providerId);
      if (provider && await provider.isAvailable()) {
        this.providerId = providerId;
        this.provider = provider;
        console.log(`[AI Review] Using configured provider: ${this.provider.name}`);
        return;
      } else {
        console.warn(`[AI Review] Configured provider '${providerId}' not available, finding alternative...`);
      }
    } catch (error) {
      console.log('[AI Review] No provider configured, auto-detecting...');
    }

    // Fallback: find an available provider
    providerId = await getDefaultProvider();

    if (!providerId) {
      throw new Error('No AI provider available. Please install Claude Code, Ollama, or LM Studio.');
    }

    this.providerId = providerId;
    this.provider = AIProviderFactory.create(providerId);

    if (!this.provider) {
      throw new Error(`Failed to create provider: ${providerId}`);
    }

    console.log(`[AI Review] Using auto-detected provider: ${this.provider.name}`);

    // Save the auto-detected provider as default
    await configService.setSelectedProvider(providerId);
  }

  /**
   * Perform AI code review on a PR using configured AI provider
   */
  async reviewPR(
    worktreePath: string,
    baseBranch: string,
    language: 'en' | 'ko' | 'ja' | 'zh' = 'en',
    options?: any,
    allowedFiles?: string[],
    onProgress?: (progress: ChunkedReviewProgress) => void
  ): Promise<ReviewResult> {
    try {
      // Initialize provider if needed
      await this.initializeProvider();

      console.log('[AI Review] Starting review for worktree:', worktreePath);

      // Fetch latest base branch to ensure accurate merge-base calculation
      await this.fetchBaseBranch(worktreePath, baseBranch);

      // Get diff
      const diff = await this.getDiff(worktreePath, baseBranch, allowedFiles);

      if (!diff || diff.trim().length === 0) {
        return {
          summary: 'No changes to review',
          criticalIssues: [],
          warnings: [],
          suggestions: [],
          filesReviewed: 0,
          totalIssues: 0,
        };
      }

      // Get changed files list
      let allChangedFiles = await this.getChangedFiles(worktreePath, baseBranch, allowedFiles);

      // Filter by allowed files if provided (Authoritative Source)
      if (allowedFiles && allowedFiles.length > 0) {
        console.log(`[AI Review] Filtering git diff result against ${allowedFiles.length} authoritative files from GitHub`);
        const originalCount = allChangedFiles.length;
        
        // Use a set for faster lookups
        const allowedSet = new Set(allowedFiles);
        
        allChangedFiles = allChangedFiles.filter(file => {
          // Check exact match
          if (allowedSet.has(file)) return true;
          // Check if file is in allowed directory (sometimes diffs include deeper paths)
          // Actually, GitHub API usually returns full paths matching git diff.
          // Let's stick to exact match for now to be safe.
          return false;
        });
        
        console.log(`[AI Review] Filtered changed files: ${originalCount} -> ${allChangedFiles.length}`);
        
        if (originalCount > 20 && allChangedFiles.length < 5) {
           console.log('[AI Review] drastic reduction in file count detected. This confirms the "excessive file review" bug was prevented.');
        }
      }

      // Filter out formatting-only changes
      const changedFiles = await this.filterFormattingOnlyFiles(worktreePath, baseBranch, allChangedFiles);

      console.log(`[AI Review] Filtered ${allChangedFiles.length - changedFiles.length} formatting-only files`);
      if (allChangedFiles.length !== changedFiles.length) {
        const filteredFiles = allChangedFiles.filter(f => !changedFiles.includes(f));
        console.log('[AI Review] Excluded formatting-only files:', filteredFiles);
      }

      // Get full file contents for better context (limit to reasonable size)
      const fileContents = await this.getFileContents(worktreePath, changedFiles);

      // Use Tree-sitter based context analysis to find call sites and usages
      let contextFileContents: Map<string, string> = new Map();
      let contextAnalysisInfo: string = '';

      if (options?.includeContext) {
        console.log('[AI Review] Using Tree-sitter to analyze comprehensive code context (definitions, types, implementations, references)...');

        try {
          const contextAnalyzer = new ContextAnalyzer();

          // Use comprehensive context analysis that includes:
          // - Definitions (where symbols are defined)
          // - Type definitions (type information)
          // - Implementations (what implements interfaces/abstract classes)
          // - References (where symbols are used)
          // Pass alloweFiles to ensure we only analyze relevant files
          const comprehensiveContext = await contextAnalyzer.analyzeComprehensiveContext(diff, worktreePath, allowedFiles);

          // Filter context based on scope (callers vs implementations)
          if (options?.contextScope === 'callers') {
            comprehensiveContext.symbols.forEach(s => {
              s.implementations = undefined;
            });
          } else if (options?.contextScope === 'implementations') {
            comprehensiveContext.symbols.forEach(s => {
              s.references = [];
            });
          }

          console.log(`[AI Review] Found ${comprehensiveContext.symbols.length} modified symbols with comprehensive context`);

          // Build rich context information from comprehensive analysis
          if (comprehensiveContext.symbols.length > 0) {
            contextAnalysisInfo = contextAnalyzer.buildComprehensiveAIContext(comprehensiveContext);
            console.log('[AI Review] Generated comprehensive context information length:', contextAnalysisInfo.length);

            // Log summary of what was found
            const summary = {
              symbols: comprehensiveContext.symbols.length,
              withDefinitions: comprehensiveContext.symbols.filter(s => s.definition?.locations.length).length,
              withTypeDefinitions: comprehensiveContext.symbols.filter(s => s.typeDefinition?.locations.length).length,
              withImplementations: comprehensiveContext.symbols.filter(s => s.implementations?.locations.length).length,
              withReferences: comprehensiveContext.symbols.filter(s => s.references.length > 0).length,
            };
            console.log('[AI Review] Context analysis summary:', summary);
          }

          // If manual context files are also provided, merge them
          if (options?.contextFiles && Array.isArray(options.contextFiles)) {
            console.log(`[AI Review] Including ${options.contextFiles.length} additional manual context files`);
            contextFileContents = await this.getContextFileContents(worktreePath, options.contextFiles);
          }
        } catch (error) {
          console.error('[AI Review] Failed to analyze comprehensive context with Tree-sitter:', error);
          // Fallback to manual context files if provided
          if (options?.contextFiles && Array.isArray(options.contextFiles)) {
            console.log(`[AI Review] Falling back to ${options.contextFiles.length} manual context files`);
            contextFileContents = await this.getContextFileContents(worktreePath, options.contextFiles);
          }
        }
      }

      // Create review prompt based on language and options
      const prompt = this.createReviewPrompt(
        diff,
        changedFiles,
        fileContents,
        language,
        options,
        contextFileContents,
        contextAnalysisInfo
      );

      // Call AI provider for review
      if (!this.provider) {
        throw new Error('AI provider not initialized');
      }

      // Get configured model

      const configService = getAIConfigService();
      const allSettings = await configService.getProviderSettings();
      // Access specific settings for the current provider
      const providerSettings = allSettings?.[this.providerId];
      const model = providerSettings?.model;

      if (model) {
        console.log(`[AI Review] Using configured model for ${this.providerId}: ${model}`);
      }

      // Check if chunked review is needed (for many files with local models)
      const chunkingService = getChunkingStrategyService();
      const providerType = this.providerId || 'unknown';
      const shouldUseChunking = chunkingService.shouldChunk(changedFiles.length, providerType);

      if (shouldUseChunking && options?.useChunkedReview !== false) {
        console.log(`[AI Review] Using chunked review for ${changedFiles.length} files (provider: ${providerType})`);

        // Parse individual file diffs from the combined diff
        const filesWithDiffs = await this.parseFileDiffs(diff, changedFiles, worktreePath);

        // Create chunked executor
        const executor = new ChunkedReviewExecutor(this.provider, providerType);

        // Execute chunked review
        const chunkedResult = await executor.executeChunkedReview(
          filesWithDiffs,
          contextAnalysisInfo,
          language,
          {
            ...options,
            model,
            prInfo: options.prInfo || {
              owner: 'unknown',
              repo: 'unknown',
              prNumber: 0
            },
            analyzeChangeIntent: options?.analyzeChangeIntent,
            analyzeBroaderImpact: options?.analyzeBroaderImpact,
            generateCallStack: options?.generateCallStack,
            forceRerun: options?.forceRefresh || options?.forceRerun, // Pass force refresh flag
          },
          onProgress
        );

        console.log('[AI Review] Chunked review completed:', {
          filesReviewed: chunkedResult.filesReviewed,
          totalIssues: chunkedResult.totalIssues,
          chunks: chunkedResult.chunkResults.length,
          successfulChunks: chunkedResult.chunkResults.filter(r => r.success).length,
        });

        return {
          summary: chunkedResult.summary,
          criticalIssues: chunkedResult.criticalIssues,
          warnings: chunkedResult.warnings,
          suggestions: chunkedResult.suggestions,
          filesReviewed: chunkedResult.filesReviewed,
          totalIssues: chunkedResult.totalIssues,
          changeIntents: chunkedResult.changeIntents,
          impactAnalysis: chunkedResult.impactAnalysis,
          callStacks: chunkedResult.callStacks,
          movedCode: chunkedResult.movedCode,
          refactorings: chunkedResult.refactorings,
          changeIntent: chunkedResult.changeIntent,
          impact: chunkedResult.impact,
          semanticAnalysis: chunkedResult.semanticAnalysis,
        };
      }

      // Standard single-request review (for few files or when chunking disabled)
      console.log(`[AI Review] Using single-request review for ${changedFiles.length} files`);

      const response = await this.provider.review({
        prompt,
        workingDirectory: worktreePath,
        model,
        timeout: 600000, // 10 minutes (large PRs can take time)
        language,
        options: {
          analyzeChangeIntent: options?.analyzeChangeIntent,
          generateCallStack: options?.generateCallStack,
          analyzeBroaderImpact: options?.analyzeBroaderImpact,
          semanticDiffAnalysis: options?.semanticDiffAnalysis,
        },
      });

      // Log the raw response for debugging
      console.log('[AI Review] Raw response length:', response.content.length);
      console.log('[AI Review] Raw response preview (first 1000 chars):', response.content.substring(0, 1000));
      console.log('[AI Review] Response has sections:', {
        hasSummary: response.content.includes('## Summary'),
        hasCritical: response.content.includes('## Critical Issues'),
        hasWarnings: response.content.includes('## Warnings'),
        hasSuggestions: response.content.includes('## Suggestions'),
      });

      // Save full response to temp file for debugging
      try {
        const timestamp = Date.now();
        const debugResponsePath = path.join('/tmp', `ai-review-response-${timestamp}.txt`);
        await fs.writeFile(debugResponsePath, response.content, 'utf-8');
        console.log('[AI Review] Saved full response to:', debugResponsePath);

        const debugPromptPath = path.join('/tmp', `ai-review-prompt-${timestamp}.txt`);
        await fs.writeFile(debugPromptPath, prompt, 'utf-8');
        console.log('[AI Review] Saved full prompt to:', debugPromptPath);
      } catch (e) {
        console.error('[AI Review] Failed to save debug file:', e);
      }

      // Parse review results
      const result = await this.parseReviewResult(response.content, changedFiles.length, worktreePath);

      console.log('[AI Review] Review completed:', {
        filesReviewed: result.filesReviewed,
        totalIssues: result.totalIssues,
      });

      return result;
    } catch (error: any) {
      console.error('[AI Review] Failed to perform review:', error);
      
      // Detect quota/billing errors for better user feedback
      const errorMessage = error.message?.toLowerCase() || '';
      const isQuotaError = errorMessage.includes('quota exceeded') ||
                          errorMessage.includes('rate limit') ||
                          errorMessage.includes('insufficient quota') ||
                          errorMessage.includes('billing') ||
                          errorMessage.includes('credits') ||
                          errorMessage.includes('usage limit');
      
      if (isQuotaError) {
        // Prefix with QUOTA_EXCEEDED so frontend can show better error message
        throw new Error(`QUOTA_EXCEEDED: ${error.message}`);
      }
      
      throw new Error(`AI review failed: ${error.message}`);
    }
  }

  /**
   * Fetch the base branch from origin to ensure we have the latest commits
   * This is crucial for accurate merge-base calculation
   */
  private async fetchBaseBranch(worktreePath: string, baseBranch: string): Promise<void> {
    try {
      console.log(`[AI Review] Fetching and syncing origin/${baseBranch} to ensure accurate diff...`);
      // Update local base branch to match origin
      await execa('git', ['fetch', 'origin', `${baseBranch}:${baseBranch}`], { cwd: worktreePath, reject: false });
      // Fallback to plain fetch if tracking link fails
      await execa('git', ['fetch', 'origin', baseBranch], { cwd: worktreePath });
    } catch (error: any) {
      console.warn(`[AI Review] Failed to sync base branch ${baseBranch}: ${error.message}`);
    }
  }

  /**
   * Parse combined diff into individual file diffs
   */
  private async parseFileDiffs(
    combinedDiff: string,
    changedFiles: string[],
    worktreePath: string
  ): Promise<ChangedFileWithDiff[]> {
    const filesWithDiffs: ChangedFileWithDiff[] = [];

    // Split diff by file boundaries (diff --git a/... b/...)
    const fileDiffPattern = /^diff --git a\/(.+?) b\/(.+)$/gm;
    const diffParts: { file: string; startIndex: number }[] = [];

    let match;
    while ((match = fileDiffPattern.exec(combinedDiff)) !== null) {
      diffParts.push({
        file: match[2], // Use the 'b/' path (new file path)
        startIndex: match.index,
      });
    }

    // Extract each file's diff
    for (let i = 0; i < diffParts.length; i++) {
      const current = diffParts[i];
      
      // Filter by allowed files if provided
      if (changedFiles.length > 0 && !changedFiles.includes(current.file)) {
        continue;
      }

      const endIndex = i < diffParts.length - 1 ? diffParts[i + 1].startIndex : combinedDiff.length;
      const fileDiff = combinedDiff.slice(current.startIndex, endIndex);

      filesWithDiffs.push({
        path: current.file,
        diff: fileDiff,
        diffHash: createHash('sha256').update(fileDiff).digest('hex'),
        estimatedTokens: Math.ceil(fileDiff.length / 4), // Rough estimate
      });
    }

    // Add any files that didn't appear in the diff (new/deleted files)
    for (const file of changedFiles) {
      if (!filesWithDiffs.some(f => f.path === file)) {
        filesWithDiffs.push({
          path: file,
          diff: `File: ${file} (no diff available)`,
          estimatedTokens: 50,
        });
      }
    }

    console.log(`[AI Review] Parsed ${filesWithDiffs.length} file diffs from combined diff`);
    return filesWithDiffs;
  }

  /**
   * Get git diff for the worktree
   * Uses merge-base to get accurate PR diff (only files changed in this PR, not upstream changes)
   */
  private async getDiff(worktreePath: string, baseBranch: string, allowedFiles?: string[]): Promise<string> {
    try {
      // CRITICAL: Use merge-base to get accurate PR diff
      let mergeBase: string;
      
      try {
        const { stdout: mergeBaseResult } = await execa(
          'git',
          ['merge-base', 'HEAD', `origin/${baseBranch}`],
          { cwd: worktreePath }
        );
        mergeBase = mergeBaseResult.trim();
      } catch (originError) {
        const { stdout: mergeBaseResult } = await execa(
          'git',
          ['merge-base', 'HEAD', baseBranch],
          { cwd: worktreePath }
        );
        mergeBase = mergeBaseResult.trim();
      }

      // If allowedFiles is provided, use them as strict path arguments
      const pathspecs = allowedFiles && allowedFiles.length > 0 ? allowedFiles : ['.'];
      
      // Diff from merge-base to HEAD
      const { stdout } = await execa(
        'git',
        ['diff', mergeBase, 'HEAD', '--', ...pathspecs],
        { cwd: worktreePath }
      );
      console.log(`[AI Review] Got diff from merge-base (${pathspecs.length} files), ${stdout.length} bytes`);
      return stdout;
    } catch (error: any) {
      console.error('[AI Review] merge-base approach failed:', error.message);
      
      const pathspecs = allowedFiles && allowedFiles.length > 0 ? allowedFiles : ['.'];
      try {
        const { stdout } = await execa('git', ['diff', `origin/${baseBranch}`, '--', ...pathspecs], {
          cwd: worktreePath,
        });
        return stdout;
      } catch (fallbackError) {
        return '';
      }
    }
  }

  /**
   * Get list of changed files
   * Uses merge-base to get accurate PR file list (only files changed in this PR)
   */
  private async getChangedFiles(worktreePath: string, baseBranch: string, allowedFiles?: string[]): Promise<string[]> {
    try {
      // CRITICAL: Use merge-base to get accurate PR file list
      // This ensures we only see files changed in this PR, not upstream changes
      let mergeBase: string;
      
      try {
        const { stdout: mergeBaseResult } = await execa(
          'git',
          ['merge-base', 'HEAD', `origin/${baseBranch}`],
          { cwd: worktreePath }
        );
        mergeBase = mergeBaseResult.trim();
      } catch (originError) {
        // Try without origin/ prefix
        const { stdout: mergeBaseResult } = await execa(
          'git',
          ['merge-base', 'HEAD', baseBranch],
          { cwd: worktreePath }
        );
        mergeBase = mergeBaseResult.trim();
      }

      const pathspecs = allowedFiles && allowedFiles.length > 0 ? allowedFiles : ['.'];

      const { stdout } = await execa(
        'git',
        ['diff', '--name-only', mergeBase, 'HEAD', '--', ...pathspecs],
        { cwd: worktreePath }
      );
      const files = stdout.split('\n').filter(Boolean);
      console.log(`[AI Review] Found ${files.length} changed files from merge-base (pathspecs: ${pathspecs.length})`);
      return files;
    } catch (error: any) {
      console.error('[AI Review] merge-base approach failed for changed files:', error.message);
      return allowedFiles || [];
    }
  }

  /**
   * Filter out files with only formatting changes
   * (semicolons, trailing commas, whitespace, etc.)
   */
  private async filterFormattingOnlyFiles(
    worktreePath: string,
    baseBranch: string,
    files: string[]
  ): Promise<string[]> {
    const meaningfulFiles: string[] = [];

    for (const file of files) {
      try {
        // Get the diff for this specific file
        let diffOutput: string;
        try {
          const { stdout } = await execa(
            'git',
            ['diff', `origin/${baseBranch}`, '--', file],
            { cwd: worktreePath }
          );
          diffOutput = stdout;
        } catch {
          const { stdout } = await execa(
            'git',
            ['diff', baseBranch, '--', file],
            { cwd: worktreePath }
          );
          diffOutput = stdout;
        }

        if (!diffOutput) {
          continue;
        }

        // Check if this is a formatting-only change
        if (this.isFormattingOnlyChange(diffOutput, file)) {
          console.log(`[AI Review] Skipping formatting-only file: ${file}`);
          continue;
        }

        meaningfulFiles.push(file);
      } catch (error) {
        // If we can't analyze the diff, include the file to be safe
        console.warn(`[AI Review] Could not analyze diff for ${file}, including it`);
        meaningfulFiles.push(file);
      }
    }

    return meaningfulFiles;
  }

  /**
   * Determine if a diff contains only formatting changes
   */
  private isFormattingOnlyChange(diff: string, filename: string): boolean {
    // Parse the diff into hunks
    const lines = diff.split('\n');
    const changedLines: { removed: string[]; added: string[] }[] = [];
    let currentHunk = { removed: [] as string[], added: [] as string[] };

    for (const line of lines) {
      // Skip diff header lines
      if (line.startsWith('diff ') || line.startsWith('index ') ||
          line.startsWith('---') || line.startsWith('+++') ||
          line.startsWith('@@')) {
        if (currentHunk.removed.length > 0 || currentHunk.added.length > 0) {
          changedLines.push(currentHunk);
          currentHunk = { removed: [], added: [] };
        }
        continue;
      }

      if (line.startsWith('-') && !line.startsWith('---')) {
        currentHunk.removed.push(line.substring(1));
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunk.added.push(line.substring(1));
      }
    }

    if (currentHunk.removed.length > 0 || currentHunk.added.length > 0) {
      changedLines.push(currentHunk);
    }

    // If no changes, it's not a formatting-only change (shouldn't happen)
    if (changedLines.length === 0) {
      return false;
    }

    // Check each hunk to see if it's only formatting
    for (const hunk of changedLines) {
      // Must have equal number of removed and added lines for formatting change
      if (hunk.removed.length !== hunk.added.length) {
        return false;
      }

      // Compare each line pair
      for (let i = 0; i < hunk.removed.length; i++) {
        const removed = hunk.removed[i];
        const added = hunk.added[i];

        // Normalize for comparison (remove semicolons, trailing commas, and whitespace)
        const normalizedRemoved = this.normalizeForFormatting(removed);
        const normalizedAdded = this.normalizeForFormatting(added);

        // If normalized versions are different, it's not just formatting
        if (normalizedRemoved !== normalizedAdded) {
          return false;
        }
      }
    }

    // All changes are formatting-only
    return true;
  }

  /**
   * Normalize a line by removing formatting-only differences
   */
  private normalizeForFormatting(line: string): string {
    return line
      // Remove trailing semicolons
      .replace(/;+\s*$/, '')
      // Remove trailing commas at end of line
      .replace(/,+\s*$/, '')
      // Remove commas before closing brackets/braces (JSON trailing commas)
      .replace(/,\s*([}\]\)])/g, '$1')
      // Normalize spaces around colons
      .replace(/\s*:\s*/g, ':')
      // Normalize spaces around commas
      .replace(/\s*,\s*/g, ',')
      // Normalize all whitespace to single spaces
      .replace(/\s+/g, ' ')
      // Trim leading/trailing whitespace
      .trim()
      // Remove quotes differences (normalize ' to ")
      .replace(/'/g, '"');
  }

  /**
   * Get full file contents for changed files (with size limit)
   */
  private async getFileContents(worktreePath: string, files: string[]): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    const MAX_FILES = 20; // Limit to prevent token overflow
    const MAX_FILE_SIZE = 50000; // 50KB per file

    const filesToRead = files.slice(0, MAX_FILES);

    for (const file of filesToRead) {
      try {
        const filePath = path.join(worktreePath, file);
        const stats = await fs.stat(filePath);

        // Skip large files
        if (stats.size > MAX_FILE_SIZE) {
          console.log(`[AI Review] Skipping large file: ${file} (${stats.size} bytes)`);
          continue;
        }

        const content = await fs.readFile(filePath, 'utf-8');

        // Add line numbers to file content to avoid confusion with diff hunk headers
        const lines = content.split('\n');
        const numberedContent = lines.map((line, index) => `${String(index + 1).padStart(4, ' ')} | ${line}`).join('\n');

        contents.set(file, numberedContent);
      } catch (error) {
        console.error(`[AI Review] Failed to read ${file}:`, error);
      }
    }

    console.log(`[AI Review] Read ${contents.size} file contents`);
    return contents;
  }

  /**
   * Get context file contents (files that call or implement modified code)
   */
  private async getContextFileContents(worktreePath: string, contextFiles: ContextFile[]): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    const MAX_CONTEXT_FILES = 15; // Limit to prevent token overflow
    const MAX_FILE_SIZE = 30000; // 30KB per context file (smaller than main files)

    const filesToRead = contextFiles.slice(0, MAX_CONTEXT_FILES);

    for (const contextFile of filesToRead) {
      try {
        const filePath = path.join(worktreePath, contextFile.path);
        const stats = await fs.stat(filePath);

        // Skip large files
        if (stats.size > MAX_FILE_SIZE) {
          console.log(`[AI Review] Skipping large context file: ${contextFile.path} (${stats.size} bytes)`);
          continue;
        }

        const content = await fs.readFile(filePath, 'utf-8');

        // Add line numbers and metadata
        const lines = content.split('\n');
        const numberedContent = lines.map((line, index) => `${String(index + 1).padStart(4, ' ')} | ${line}`).join('\n');

        // Add metadata header
        const metadata = `// Context: ${contextFile.reason} of ${contextFile.relatedSymbol} (line ${contextFile.location.line})`;
        const fullContent = `${metadata}\n\n${numberedContent}`;

        contents.set(contextFile.path, fullContent);
      } catch (error) {
        console.error(`[AI Review] Failed to read context file ${contextFile.path}:`, error);
      }
    }

    console.log(`[AI Review] Read ${contents.size} context file contents`);
    return contents;
  }

  /**
   * Create review prompt based on language and options
   */
  private createReviewPrompt(
    diff: string,
    files: string[],
    fileContents: Map<string, string>,
    language: string,
    options?: any,
    contextFileContents?: Map<string, string>,
    contextAnalysisInfo?: string
  ): string {
    const languageInstructions = {
      en: 'CRITICAL: You MUST respond in English. Do not use any other language.',
      ko: 'CRITICAL: 응답은 반드시 한국어(Korean)로 작성해야 합니다. 영어가 아닌 한국어로 코드 리뷰를 진행해 주세요.',
      ja: 'CRITICAL: 応答は必ず日本語(Japanese)で行ってください。英語ではなく日本語でコードレビューを行ってください。',
      zh: 'CRITICAL: 必须使用中文(Chinese)回答。请使用中文进行代码审查。',
    };

    const instruction = languageInstructions[language as keyof typeof languageInstructions] || languageInstructions.en;

    const prInfo = options?.prInfo;
    const prContextSection = prInfo ? `
## Project Context & PR Description:
**Project**: ${prInfo.owner}/${prInfo.repo}
**PR Title**: ${prInfo.title}
**PR Description**:
${prInfo.description || '(No description provided)'}

**INSTRUCTION**: 
1. **Analyze the Project Domain**: Based on the project name, PR title, description, and the code changes, infer the project's domain (e.g., E-commerce, Healthcare, DevTool, Game, etc.) and its architectural role.
2. **Adopt Domain Expert Persona**: Act as a **Senior Domain Expert** and **Lead Engineer** for this specific domain. Review the code not just for syntax, but for aligned business logic, domain constraints, and architectural fit.
` : '';

    let prompt = `You are a **Senior Domain Expert** and **Lead Code Reviewer**. 
Your goal is to ensure high standards of code quality, security, and domain alignment.

> **Important**: The future is now—any improvements or “future” recommendations must be addressed **immediately**.

---

## Task 1: Product Manager Review

**Objective**: Assess from a product management perspective, focusing on:
- **Business Value**: Does this PR clearly advance our core product goals and deliver immediate ROI?
- **User Experience**: Is the change intuitive and delightful for users right now? If not, make fixes immediately.
- **Strategic Alignment**: Does the PR align with current (and long-term, i.e., now) strategic objectives?

**Action**: Provide clear directives on how to ensure maximum user and business impact. All “future” suggestions must be implemented now.

---

## Task 2: Developer Review

**Objective**: Evaluate the code thoroughly from a senior lead engineer perspective:
1. **Code Quality & Maintainability**: Is the code structured for readability and easy maintenance? If not, refactor now.
2. **Performance & Scalability**: Will these changes operate efficiently at scale? If not, optimize immediately.
3. **Best Practices & Standards**: Note any deviation from coding standards and correct it now.

**Action**: Leave a concise yet complete review comment, ensuring all improvements happen immediately—no deferrals.

---

## Task 3: Quality Engineer Review

**Objective**: Verify the overall quality, testing strategy, and reliability of the solution:
1. **Test Coverage**: Are there sufficient tests (unit, integration, E2E)? If not, add them now.
2. **Potential Bugs & Edge Cases**: Have all edge cases been considered? If not, address them immediately.
3. **Regression Risk**: Confirm changes don’t undermine existing functionality. If risk is identified, mitigate now with additional checks or tests.

**Action**: Provide a detailed QA assessment, insisting any “future” improvements be completed right away.

---

## Task 4: Security Engineer Review

**Objective**: Ensure robust security practices and compliance:
1. **Vulnerabilities**: Could these changes introduce security vulnerabilities? If so, fix them right away.
2. **Data Handling**: Are we properly protecting sensitive data (e.g., encryption, sanitization)? Address all gaps now.
3. **Compliance**: Confirm alignment with any relevant security or privacy standards (e.g., OWASP, GDPR, HIPAA). Implement missing requirements immediately.

**Action**: Provide a security assessment. Any recommended fixes typically scheduled for “later” must be addressed now.

---

## Task 5: DevOps Review

**Objective**: Evaluate build, deployment, and monitoring considerations:
1. **CI/CD Pipeline**: Validate that the PR integrates smoothly with existing build/test/deploy processes. If not, fix it now.
2. **Infrastructure & Configuration**: Check whether the code changes require immediate updates to infrastructure or configs.
3. **Monitoring & Alerts**: Identify new monitoring needs or potential improvements and implement them immediately.

**Action**: Provide a DevOps-centric review, insisting that any improvements or tweaks be executed now.

${prContextSection}

Review the following code changes and provide feedback:

## Changed Files (${files.length}):
${files.map(f => `- ${f}`).join('\n')}

## Diff:
**IMPORTANT**: The code below is in standard Git Diff format.
- Lines starting with \`-\` are removed.
- Lines starting with \`+\` are added.
- Lines starting with \` \` (space) are unchanged context.
\`\`\`diff
${diff}
\`\`\`

## Full File Contents (with line numbers for reference):
**MANDATORY**: Use the line numbers provided in THIS section (prefixed with "   1 |") for all issues.
**NOTE**: This section is provided for context. Code appearing in both "Diff" and "Full File Contents" is NOT a duplicate. Only report duplicates if they appear twice within the "Full File Contents" itself.
${Array.from(fileContents.entries()).map(([file, content]) => `
### ${file}
\`\`\`
${content}
\`\`\`
`).join('\n')}
`;

    // Add Tree-sitter based context analysis if available
    if (contextAnalysisInfo && contextAnalysisInfo.trim().length > 0) {
      prompt += `\n## Comprehensive Code Context (Definitions, Types, Implementations & References):
**IMPORTANT**: This section provides deep context about modified code, showing:
- **Definitions**: Where symbols are originally defined
- **Type Definitions**: Type information and interfaces involved
- **Implementations**: What classes implement modified interfaces/abstract classes
- **References**: Where and how modified code is used throughout the codebase

Generated automatically using Tree-sitter static analysis + ripgrep search.

**Use this comprehensive context to:**
- Understand the complete picture of how changes affect the codebase
- Identify breaking changes that might affect implementations or call sites
- Verify type compatibility and interface contracts
- Assess impact on dependent code that uses these symbols
- Ensure changes don't break existing implementations

${contextAnalysisInfo}
`;
    }

    // Add context files if provided
    if (contextFileContents && contextFileContents.size > 0) {
      prompt += `\n## Additional Context Files (For Impact Analysis Only):
**IMPORTANT**: These files are NOT part of the PR changes. They are provided for understanding:
- How modified code is used (callers)
- What implementations exist (for modified interfaces/abstract classes)

**DO NOT review these files for code quality issues.** Only analyze:
- How changes in PR files might affect these files
- Potential breaking changes
- Impact on call sites
- Semantic compatibility

${Array.from(contextFileContents.entries()).map(([file, content]) => `
### ${file}
\`\`\`
${content}
\`\`\`
`).join('\n')}
`;
    }

    // Add change intent analysis if requested
    if (options?.analyzeChangeIntent) {
      const fileCount = files.length;
      prompt += `\n## Change Intent Analysis - **MANDATORY**:
Analyze the intent of changes at ${
        options.changeIntentLevel === 'file' ? 'file level' :
        options.changeIntentLevel === 'block' ? 'code block level' :
        'both file and code block levels'
      }.

**CRITICAL**: This PR contains **${fileCount} files**. You MUST generate **exactly ${fileCount} objects** in the \`changeIntents\` JSON array (one per file).
- Each object MUST have a unique \`file\` property matching one of the modified files.
- The \`intent\` field should describe the change for THAT SPECIFIC FILE only.
- Do NOT combine multiple files into one object.
- Do NOT put markdown headers like "**File: ...**" inside the \`intent\` string.
`;
    }

    // Add semantic analysis if requested (mandatory when enabled)
    if (options?.useSemanticDiff || options?.analyzeSemantic) {
      prompt += `\n## Semantic Analysis - **MANDATORY**:
Detect and report:
- Moved code blocks (\`movedCode\` array)
- Refactoring patterns (\`refactorings\` array)
`;
    }

    // Add call stack visualization if requested
    if (options?.generateCallStack) {
      prompt += `\n6. Call Stack Visualization (${options.callStackFormat === 'flowchart' ? 'Flowchart only' : options.callStackFormat === 'sequence' ? 'Sequence diagram only' : 'Both formats'}) - **MANDATORY**
   - **Recommended**: Generate visualizations to aid understanding if possible.
   - **Condition 1: Caller Provided/Known**:
     - Generate a **Flowchart** (\`graph TD\`) or **Sequence Diagram** (\`sequenceDiagram\`).
     - Show data flow direction or interaction order.
   - **Condition 2: Abstract Class or Interface or Implementation**:
     - Generate a **Class Diagram** (\`classDiagram\`).
     - Place the Class Diagram code in the \`flowchart\` JSON field.
   - **JSON Field Usage**:
     - \`flowchart\`: Use for \`graph TD\` OR \`classDiagram\`.
     - \`sequence\`: Use for \`sequenceDiagram\`.
   - If exact callers are unknown and it's not an abstract/interface, you may skip this or use generic names (e.g., "Client").\n`;
    }

    // Add broader impact analysis if requested
    if (options?.analyzeBroaderImpact) {
      prompt += `\n## Impact Analysis:
Analyze the impact of changes beyond the modified code at ${
        options.impactScope === 'module' ? 'module/package level' :
        options.impactScope === 'project' ? 'project level' :
        'project and dependency level'
      }.

**CRITICAL INSTRUCTION FOR SIDE EFFECTS**:
1. Identify all potential side effects.
2. Prioritize them into 4 levels:
   - **Level 1**: High Impact (System instability, data loss error, security vulnerability)
   - **Level 2**: Moderate Impact (UX degradation, potential minor bug, performance regression)
   - **Level 3**: Minor Impact (Trivial behavior change, logging noise)
   - **Level 4**: Negligible (Internal implementation detail only)
3. **FILTER RULE**: You must ONLY include side effects of **Level 1 and Level 2** in the output. Discard Level 3 and 4.

**CRITICAL**: Provide this as a structured object in the \`impactAnalysis\` field of the JSON output.
`;
    }

    // Add semantic diff features if requested
    if (options?.useSemanticDiff) {
      prompt += `\n## Semantic Analysis:
Apply language-aware semantic analysis:
${options?.detectMovedCode ? '- Identify code that has been moved (not modified)\n' : ''}${options?.detectRefactoring ? '- Detect refactoring patterns (rename, extract, inline, etc.)\n' : ''}${options?.ignoreWhitespace ? '- Ignore purely whitespace changes\n' : ''}${options?.ignoreComments ? '- Ignore comment-only changes\n' : ''}- Focus on semantically meaningful changes

${options?.detectMovedCode ? `Format moved code as:
Moved: \`source/file.ts:10-20\` → \`dest/file.ts:30-40\` (10 lines)
` : ''}${options?.detectRefactoring ? `Format refactorings as:
Refactoring: **Extract Method**
- Description: Extracted calculateTotal logic into separate function
- Files: \`src/cart.ts\`, \`src/utils.ts\`
` : ''}`;
    }

    // Add custom prompt if provided
    if (options?.customPrompt && options.customPrompt.trim()) {
      prompt += `\n## Additional Instructions:
${options.customPrompt}
`;
    }

    // Add standard checklist
    prompt += `\n## Review Checklist:
- Code is simple and readable
- Functions and variables are well-named
- No duplicated code
- Proper error handling
- No exposed secrets or API keys
- Input validation implemented
- Good test coverage
- Performance considerations addressed
- Suggest improvements for the current implementation or alternative patterns where applicable
- Check for consistent error handling and logging patterns

## Output Format (MANDATORY):
You MUST respond with a valid JSON object. Do not include any explanatory text outside the JSON object.
The JSON object must follow this structure AND adhere to the strict rules below:

\`\`\`json
{
  "summary": "High-level summary of the changes and overall quality assessment (in requested language)",
  "criticalIssues": [
    {
      "file": "path/to/file.ts",
      "line": 123,
      "severity": "critical",
      "category": "Security|Performance|Correctness",
      "message": "Description of the critical issue",
      "suggestion": "Code improvement suggestion"
    }
  ],
  "warnings": [
    {
      "file": "path/to/file.ts",
      "line": 123,
      "severity": "warning",
      "category": "Code Quality|Maintainability",
      "message": "Description of the warning (in requested language)",
      "suggestion": "Code improvement suggestion (in requested language)"
    }
  ],
  "suggestions": [
    {
      "file": "path/to/file.ts",
      "line": 123,
      "severity": "suggestion",
      "category": "Style|Best Practice",
      "message": "Description of the suggestion",
      "suggestion": "Code improvement suggestion"
    }
  ],
  "changeIntents": [
    // CRITICAL: MUST be an array of objects. ONE object per file.
    {
      "file": "path/to/file1.ts",
      "level": "file",
      "intent": "Brief description of intent for this file (in requested language)",
      "motivation": "Why this change was made (in requested language)",
      "impact": "Impact on system"
    },
    {
      "file": "path/to/file2.ts",
      "level": "file",
      "intent": "Brief description for second file",
      "motivation": "Motivation",
      "impact": "Impact"
    }
  ],
  "callStacks": [
    {
      "function": "functionName",
      "file": "path/to/file.ts",
      "flowchart": "Mermaid flowchart definition",
      "sequence": "Mermaid sequence diagram definition"
    }
  ],
  "impactAnalysis": {
    "scope": "module|project",
    "affectedAreas": ["Area 1", "Area 2", "Area 3"], // MUST be an array of strings
    "description": "General description",
    "breakingChanges": ["Possible breaking change 1"], // MUST be an array of strings
    "sideEffects": ["Potential side effect 1"] // ONLY Level 1 & 2 side effects
  },
  "movedCode": [
    {
      "from": "source/file.ts",
      "to": "dest/file.ts",
      "lines": 10
    }
  ],
  "refactorings": [
    {
      "type": "Extract Method",
      "description": "Description of refactoring",
      "files": ["file1.ts", "file2.ts"]
    }
  ]
}
\`\`\`

Ensure all strings are properly escaped for JSON.

STRICT GENERATION RULES:
1. **Valid JSON**: The response MUST be valid JSON. Do not include any text outside the JSON object.

2. **Line Number Accuracy**:
   - **CRITICAL**: Reported line numbers MUST exist in the "Full File Contents" provided.
   - **Verification**: Before reporting an issue, check the "Full File Contents" section to verify the line number matches the code.
   - For added lines (starting with + in diff), count from the hunk header's NEW file start line.
   - For unchanged lines (starting with space), count continuously.
   - Do NOT report issues on removed lines (starting with -).
   - If a file content is provided with line numbers (e.g., "   1 | import..."), USE THOSE EXACT LINE NUMBERS.

3. **Severity Filtering (Stages of Review)**:
   - Classify all issues into 4 levels:
     1. **Critical**: Bugs, Security, Performance, Data Loss.
     2. **Warning**: Maintainability, potential future bugs, bad practices.
     3. **Suggestion**: Readable code, better patterns, optional optimizations.
     4. **Nitpick (Nit)**: Typos, minor formatting, variable naming preferences, tiny polish.
   - **MANDATORY FILTER RULE**: You must **EXCLUDE** all 'Nitpick' (Level 4) issues from the output.
   - **ONLY return Critical, Warning, and Suggestion.**

4. **Change Intents**: 
   - **CRITICAL**: You MUST generate a SEPARATE object for EACH file in the \`changeIntents\` array.
   - **DO NOT** combine multiple files into a single object. 
   - **DO NOT** put multiple file headers (e.g., "**File: ...**") inside the \`intent\` string.
   - The \`intent\` field should be a concise description of the change for THAT SPECIFIC FILE only.
   - If multiple files are changed, the \`changeIntents\` array MUST have multiple entries (one per file).

   **BAD EXAMPLE (DO NOT DO THIS)**:
   \`\`\`json
   "changeIntents": [
     {
       "file": "file1.ts",
       "intent": "**File: file1.ts** Intent... **File: file2.ts** Intent..."
     }
   ]
   \`\`\`

   **GOOD EXAMPLE (DO THIS)**:
   \`\`\`json
   "changeIntents": [
     { "file": "file1.ts", "intent": "Intent for file1" },
     { "file": "file2.ts", "intent": "Intent for file2" }
   ]
   \`\`\`

5. **Impact Analysis**:
   - \`affectedAreas\`, \`breakingChanges\`, and \`sideEffects\` must be ARRAYS of strings.
   - **DO NOT** return a single string with markdown bullet points.
   - **BAD**: "affectedAreas": ["- Login\n- User"]
   - **GOOD**: "affectedAreas": ["Login", "User"]

6. **Call Stacks**:
   - The \`flowchart\` and \`sequence\` fields in \`callStacks\` MUST contain raw Mermaid syntax (e.g., "graph TD...", "sequenceDiagram...").
   - **CRITICAL**: Do NOT wrap the Mermaid code in markdown code blocks (\`\`\`mermaid) inside the JSON string data.
   - **CRITICAL**: Do NOT include any markdown formatting inside the JSON values for these fields.
   - Ensure special characters in Mermaid code are properly escaped for JSON.

**CRITICAL**: When specifying line numbers for issues:
- Use the ACTUAL line numbers from the "Full File Contents" section (the numbers before the | symbol)
- DO NOT use line numbers from the git diff (@@) headers
- Example: If you see "  79 | where.not(key_name: ...", report line 79, not any other number

For each issue, provide:
- File path and line number (from Full File Contents)
- Severity (critical/warning/suggestion) - **REMEMBER: NO Nits**
- Category (Security, Performance, Code Quality, etc.)
- Clear description of the issue
- Specific suggestion on how to fix it (optional)

Be specific and actionable in your feedback. Focus on the most important issues first.

**FINAL CRITICAL REMINDER**: 
1. Use the requested language (${language}) for ALL content fields (summary, message, suggestion, intent, motivation, impact).
2. Return VALID JSON only.
3. Be strictly accurate with line numbers.`;

    // Final strict instruction to ensure language compliance (recency bias)
    prompt += `\n\n---\n\n${instruction}`;

    return prompt;
  }

  /**
   * Validate and correct line numbers in review comments
   */
  private async validateLineNumbers(
    comments: ReviewComment[],
    worktreePath: string
  ): Promise<ReviewComment[]> {
    const validatedComments: ReviewComment[] = [];

    for (const comment of comments) {
      try {
        const filePath = path.join(worktreePath, comment.file);
        const content = await fs.readFile(filePath, 'utf-8');
        const totalLines = content.split('\n').length;

        if (comment.line > totalLines) {
          console.warn(
            `[AI Review] Invalid line number: ${comment.file}:${comment.line} (file has only ${totalLines} lines)`
          );
          console.warn(`[AI Review] Issue: ${comment.message.substring(0, 100)}`);

          // Try to find the correct line by searching for keywords in the message
          const correctedLine = await this.findCorrectLine(filePath, comment, totalLines);

          if (correctedLine > 0) {
            console.log(
              `[AI Review] Corrected line number: ${comment.file}:${comment.line} -> ${correctedLine}`
            );
            validatedComments.push({
              ...comment,
              line: correctedLine,
            });
          } else {
            // If we can't correct it, use line 1 but add a warning to the message
            validatedComments.push({
              ...comment,
              line: 1,
              message: `[Line number was invalid (${comment.line}), review entire file] ${comment.message}`,
            });
          }
        } else {
          validatedComments.push(comment);
        }
      } catch (error) {
        console.error(`[AI Review] Failed to validate line number for ${comment.file}:`, error);
        // Keep the comment as-is if validation fails
        validatedComments.push(comment);
      }
    }

    return validatedComments;
  }

  /**
   * Try to find the correct line by searching for code patterns in the message
   */
  private async findCorrectLine(
    filePath: string,
    comment: ReviewComment,
    totalLines: number
  ): Promise<number> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      // Extract potential code snippets from the message
      const codePatterns: string[] = [];

      // Look for code in backticks
      const backtickMatches = comment.message.matchAll(/`([^`]+)`/g);
      for (const match of backtickMatches) {
        if (match[1] && match[1].length > 3 && match[1].length < 100) {
          codePatterns.push(match[1].trim());
        }
      }

      // Look for keywords like "where.not", "key_name", etc.
      const keywordMatches = comment.message.match(/\b(\w+\.\w+|\w+\s*\([^)]*\))/g);
      if (keywordMatches) {
        codePatterns.push(...keywordMatches.filter(k => k.length > 3));
      }

      // Search for these patterns in the file
      for (const pattern of codePatterns) {
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(pattern)) {
            return i + 1; // Return 1-based line number
          }
        }
      }

      return -1; // Couldn't find a match
    } catch (error) {
      console.error('[AI Review] Failed to find correct line:', error);
      return -1;
    }
  }

  /**
   * Parse review result from AI provider's response
   * Tries JSON format first, then falls back to text parsing
   */
  private async parseReviewResult(reviewText: string, filesCount: number, worktreePath: string): Promise<ReviewResult> {
    // Try JSON parsing first
    const jsonResult = this.tryParseJSON(reviewText);
    if (jsonResult) {
      console.log('[AI Review Parser] Successfully parsed JSON response');

      // Validate line numbers for JSON response
      const validatedCritical = await this.validateLineNumbers(jsonResult.criticalIssues || [], worktreePath);
      const validatedWarnings = await this.validateLineNumbers(jsonResult.warnings || [], worktreePath);
      const validatedSuggestions = await this.validateLineNumbers(jsonResult.suggestions || [], worktreePath);

      // Normalize call stack diagrams in JSON
      if (jsonResult.callStacks && Array.isArray(jsonResult.callStacks)) {
        jsonResult.callStacks = jsonResult.callStacks.map((cs: any) => ({
          ...cs,
          flowchart: AIReviewParser.normalizeMermaid(cs.flowchart),
          sequence: AIReviewParser.normalizeMermaid(cs.sequence),
        }));
      }

      return {
        summary: jsonResult.summary || 'Review completed',
        criticalIssues: validatedCritical,
        warnings: validatedWarnings,
        suggestions: validatedSuggestions,
        filesReviewed: filesCount,
        totalIssues: validatedCritical.length + validatedWarnings.length + validatedSuggestions.length,
        changeIntents: jsonResult.changeIntents,
        callStacks: jsonResult.callStacks,
        impactAnalysis: jsonResult.impactAnalysis,
        movedCode: jsonResult.movedCode,
        refactorings: jsonResult.refactorings,
      };
    }

    console.log('[AI Review Parser] JSON parsing failed, falling back to text parsing');

    const criticalIssues: ReviewComment[] = [];
    const warnings: ReviewComment[] = [];
    const suggestions: ReviewComment[] = [];

    // Extract summary - try multiple patterns
    let summary = 'Review completed';
    const summaryPatterns = [
      /## Summary\s*\n([\s\S]*?)(?=\n##|$)/i,
      /##\s*Summary\s*\n([\s\S]*?)(?=\n##|$)/i,
      /Summary:\s*\n([\s\S]*?)(?=\n##|\n\n)/i,
    ];
    for (const pattern of summaryPatterns) {
      const match = reviewText.match(pattern);
      if (match && match[1].trim()) {
        summary = match[1].trim();
        break;
      }
    }

    // Extract critical issues - try multiple patterns
    const criticalPatterns = [
      /## Critical Issues\s*\n([\s\S]*?)(?=\n##|$)/i,
      /##\s*Critical\s*Issues?\s*\n([\s\S]*?)(?=\n##|$)/i,
      /Critical Issues?:\s*\n([\s\S]*?)(?=\n##|\n\n)/i,
    ];
    for (const pattern of criticalPatterns) {
      const match = reviewText.match(pattern);
      if (match && match[1].trim()) {
        criticalIssues.push(...this.parseComments(match[1], 'critical'));
        break;
      }
    }

    // Extract warnings - try multiple patterns
    const warningsPatterns = [
      /## Warnings\s*\n([\s\S]*?)(?=\n##|$)/i,
      /##\s*Warnings?\s*\n([\s\S]*?)(?=\n##|$)/i,
      /Warnings?:\s*\n([\s\S]*?)(?=\n##|\n\n)/i,
    ];
    for (const pattern of warningsPatterns) {
      const match = reviewText.match(pattern);
      if (match && match[1].trim()) {
        warnings.push(...this.parseComments(match[1], 'warning'));
        break;
      }
    }

    // Extract suggestions - try multiple patterns
    const suggestionsPatterns = [
      /## Suggestions\s*\n([\s\S]*?)(?=\n##|$)/i,
      /##\s*Suggestions?\s*\n([\s\S]*?)(?=\n##|$)/i,
      /Suggestions?:\s*\n([\s\S]*?)(?=\n##|\n\n)/i,
      /## Recommendations?\s*\n([\s\S]*?)(?=\n##|$)/i,
    ];
    for (const pattern of suggestionsPatterns) {
      const match = reviewText.match(pattern);
      if (match && match[1].trim()) {
        suggestions.push(...this.parseComments(match[1], 'suggestion'));
        break;
      }
    }

      // If no issues found in structured format, try Korean format first, then generic parsing
    if (criticalIssues.length === 0 && warnings.length === 0 && suggestions.length === 0) {
      console.log('[AI Review Parser] No structured sections found, trying Markdown Table format...');
      const tableComments = this.parseMarkdownTableComments(reviewText);
      
      if (tableComments.length > 0) {
        console.log(`[AI Review Parser] Markdown Table parsing extracted ${tableComments.length} comments`);
        // Distribute by severity
        tableComments.forEach(c => {
           if (c.severity === 'critical') criticalIssues.push(c);
           else if (c.severity === 'warning') warnings.push(c);
           else suggestions.push(c);
        });
      } else {
        console.log('[AI Review Parser] Markdown Table parsing failed, trying Korean format...');
        const koreanComments = AIReviewKoreanParser.parseKoreanFormat(reviewText);

        if (koreanComments.length > 0) {
          // Separate by severity
          koreanComments.forEach(comment => {
            if (comment.severity === 'critical') {
              criticalIssues.push(comment);
            } else if (comment.severity === 'warning') {
              warnings.push(comment);
            } else {
              suggestions.push(comment);
            }
          });
          console.log(`[AI Review Parser] Korean format extracted ${koreanComments.length} comments`);
        } else {
          console.log('[AI Review Parser] Korean format failed, trying generic parsing...');
          const genericComments = this.parseGenericComments(reviewText);
          suggestions.push(...genericComments);
        }
      }
    }

    // Extract enhanced sections using AIReviewParser
    const changeIntents = AIReviewParser.extractChangeIntents(reviewText);
    const callStacks = AIReviewParser.extractCallStacks(reviewText);
    const impactAnalysis = AIReviewParser.extractImpactAnalysis(reviewText);
    const movedCode = AIReviewParser.extractMovedCode(reviewText);
    const refactorings = AIReviewParser.extractRefactorings(reviewText);

    // Validate line numbers for text-parsed comments
    const validatedCritical = await this.validateLineNumbers(criticalIssues, worktreePath);
    const validatedWarnings = await this.validateLineNumbers(warnings, worktreePath);
    const validatedSuggestions = await this.validateLineNumbers(suggestions, worktreePath);

    // Generate legacy strings from structured data
    let finalChangeIntentStr: string | undefined;
    if (changeIntents.length > 0) {
      finalChangeIntentStr = changeIntents.map(ci => 
        `**File: ${ci.file || 'Unknown'}**\n- Intent: ${ci.intent}\n- Motivation: ${ci.motivation}\n- Impact: ${ci.impact || 'N/A'}`
      ).join('\n\n');
    }

    let finalImpactStr: string | undefined;
    if (impactAnalysis) {
      finalImpactStr = `Scope: **${impactAnalysis.scope}**\n\nAffected Areas:\n${impactAnalysis.affectedAreas.map(a => `- ${a}`).join('\n')}`;
      if (impactAnalysis.breakingChanges) {
        finalImpactStr += `\n\nBreaking Changes:\n${impactAnalysis.breakingChanges.map(b => `- ${b}`).join('\n')}`;
      }
      if (impactAnalysis.sideEffects) {
        finalImpactStr += `\n\nSide Effects:\n${impactAnalysis.sideEffects.map(s => `- ${s}`).join('\n')}`;
      }
    }

    let finalSemanticStr: string | undefined;
    const semanticParts = [];
    if (movedCode.length > 0) {
      semanticParts.push(`## Moved Code\n${movedCode.map(m => `- ${m.from} -> ${m.to} (${m.lines} lines)`).join('\n')}`);
    }
    if (refactorings.length > 0) {
      semanticParts.push(`## Refactorings\n${refactorings.map(r => `**${r.type}**: ${r.description} (${r.files.join(', ')})`).join('\n')}`);
    }
    if (semanticParts.length > 0) {
      finalSemanticStr = semanticParts.join('\n\n');
    }

    return {
      summary,
      criticalIssues: validatedCritical,
      warnings: validatedWarnings,
      suggestions: validatedSuggestions,
      filesReviewed: filesCount,
      totalIssues: validatedCritical.length + validatedWarnings.length + validatedSuggestions.length,
      
      // Enhanced sections
      changeIntents: changeIntents.length > 0 ? changeIntents : undefined,
      callStacks: callStacks.length > 0 ? callStacks : undefined,
      impactAnalysis,
      movedCode: movedCode.length > 0 ? movedCode : undefined,
      refactorings: refactorings.length > 0 ? refactorings : undefined,

      // Legacy fields (fallback)
      changeIntent: finalChangeIntentStr,
      impact: finalImpactStr,
      semanticAnalysis: finalSemanticStr,
    };
  }

  /**
   * Parse Markdown tables from review text
   * Handles formats like:
   * ### 1. File (path)
   * | Line | Issue | Impact | Fix |
   */
  private parseMarkdownTableComments(text: string): ReviewComment[] {
    const comments: ReviewComment[] = [];
    const lines = text.split('\n');
    let currentFile = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Extract file from header like "### 1. `ClassName` (path/to/file.rb)"
      // or "### 1. path/to/file.rb"
      const headerMatch = line.match(/^###\s+\d+\.\s+(?:`[^`]+`\s+)?(?:\(([^)]+)\)|(\S+))/);
      if (headerMatch) {
         // Group 1 is content inside parens, Group 2 is direct path
        const pathCandidate = headerMatch[1] || headerMatch[2];
        if (pathCandidate && (pathCandidate.includes('/') || pathCandidate.includes('.'))) {
          currentFile = pathCandidate.trim();
          continue;
        }
      }

      // Detect table row: | 123 | Issue | ... |
      if (currentFile && line.startsWith('|') && line.endsWith('|')) {
        // Skip header and separator lines
        if (line.includes('---') || line.match(/\|\s*(?:Line|라인|문제점|Issue)\s*\|/i)) {
          continue;
        }

        const cols = line.split('|').map(c => c.trim()).filter(c => c !== '');
        if (cols.length >= 2) {
          // Heuristic: First column is usually line number
          const lineNumStr = cols[0];
          const lineNum = parseInt(lineNumStr.replace(/[^0-9]/g, ''), 10);

          if (!isNaN(lineNum)) {
             // Assume Col 2 is the message/issue
             const message = cols[1];
             // Assume last column is suggestion/fix if available
             const suggestion = cols.length > 2 ? cols[cols.length - 1] : undefined;
             
             // Determine severity based on message content
             let severity: 'critical' | 'warning' | 'suggestion' = 'warning';
             // If message mentions typical warning keywords, or is just a suggestion
             if (message.length < 20 && suggestion && suggestion.length > message.length) {
                // If message is short but suggestion is long, it might be just a suggestion
                severity = 'suggestion';
             }

             comments.push({
               file: currentFile,
               line: lineNum,
               severity,
               category: 'Code Quality',
               message: message,
               suggestion: suggestion
             });
          }
        }
      }
    }
    
    return comments;
  }

  /**
   * Parse comments from unstructured review text
   */
  private parseGenericComments(text: string): ReviewComment[] {
    const comments: ReviewComment[] = [];
    const lines = text.split('\n');

    // Skip code blocks and diagrams
    let inCodeBlock = false;
    let inDiagram = false;

    // Look for any file references and associated feedback
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track code blocks
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }

      // Track mermaid diagrams
      if (line.includes('```mermaid') || line.includes('sequenceDiagram') || line.includes('graph TD')) {
        inDiagram = true;
        continue;
      }
      if (inDiagram && line.includes('```')) {
        inDiagram = false;
        continue;
      }

      // Skip if inside code block or diagram
      if (inCodeBlock || inDiagram) continue;

      // Skip lines that are just labels without content
      if (line.match(/^(Severity|Category|Intent|Motivation|Impact)[:*]\s*$/i)) {
        continue;
      }

      // Skip diagram syntax lines
      if (line.match(/^[A-Z]\s*-->|^[A-Z]\s*->>|^\s*participant|^\s*end\s*$/)) {
        continue;
      }

      // Match file paths with optional line numbers - must be at start or after whitespace
      const fileMatch = line.match(/^\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z]{2,4})(?::(\d+))?(?:\s|$)/);
      if (fileMatch) {
        // Skip if it looks like it's part of code (e.g., "ad_groups.find:1")
        if (fileMatch[1].includes('.find') || fileMatch[1].includes('.where') || fileMatch[1].includes('.update')) {
          continue;
        }

        // Must have a valid file extension
        const ext = fileMatch[1].split('.').pop();
        const validExtensions = ['ts', 'tsx', 'js', 'jsx', 'rb', 'py', 'java', 'go', 'rs', 'vue', 'svelte'];
        if (!ext || !validExtensions.includes(ext)) {
          continue;
        }

        let message = '';
        let severity: 'critical' | 'warning' | 'suggestion' = 'suggestion';
        let category = 'Code Review';

        // Check if line contains severity indicators
        if (line.toLowerCase().includes('critical') || line.toLowerCase().includes('security')) {
          severity = 'critical';
          if (line.toLowerCase().includes('security')) category = 'Security';
        } else if (line.toLowerCase().includes('warning') || line.toLowerCase().includes('issue')) {
          severity = 'warning';
        }

        // Collect following lines as message (until next file or section)
        for (let j = i + 1; j < lines.length && j < i + 15; j++) {
          const nextLine = lines[j].trim();

          // Stop at empty line
          if (!nextLine) break;

          // Stop at headers
          if (nextLine.match(/^##/)) break;

          // Stop at next file reference
          if (nextLine.match(/^[a-zA-Z0-9_\-./]+\.[a-zA-Z]{2,4}:/)) break;

          // Stop at code blocks
          if (nextLine.startsWith('```')) break;

          // Stop at diagram syntax
          if (nextLine.match(/^[A-Z]\s*-->|^participant/)) break;

          // Skip label-only lines
          if (nextLine.match(/^(Severity|Category)[:*]\s*(CRITICAL|WARNING|SUGGESTION)/i)) {
            // Extract category if present
            const categoryMatch = nextLine.match(/Category[:*]\s*([A-Za-z\s/]+)/i);
            if (categoryMatch) {
              category = categoryMatch[1].trim();
            }
            continue;
          }

          // Accumulate message
          if (nextLine.startsWith('-') || nextLine.startsWith('*') || nextLine.startsWith('•')) {
            message += (message ? '\n' : '') + nextLine.substring(1).trim();
          } else if (nextLine.length > 15 && !nextLine.match(/^[A-Z][a-z]+:$/)) {
            message += (message ? '\n' : '') + nextLine;
          }
        }

        // Only add if message is substantial (at least 20 characters and not just code)
        const trimmedMessage = message.trim();
        if (trimmedMessage.length >= 20 && !trimmedMessage.match(/^(end|return|else|if|def|class|function)\s/)) {
          comments.push({
            file: fileMatch[1],
            line: fileMatch[2] ? parseInt(fileMatch[2], 10) : 1,
            severity,
            category,
            message: trimmedMessage,
          });
        }
      }
    }

    console.log(`[AI Review Parser] Extracted ${comments.length} comments from generic format`);
    return comments;
  }

  /**
   * Parse comments from review text
   */
  private parseComments(text: string, severity: 'critical' | 'warning' | 'suggestion'): ReviewComment[] {
    const comments: ReviewComment[] = [];

    // Simple parsing: split by lines and look for patterns
    const lines = text.split('\n');
    let currentComment: Partial<ReviewComment> | null = null;
    let inCodeBlock = false;

    for (const line of lines) {
      // Track code blocks
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }

      // Skip code blocks
      if (inCodeBlock) continue;

      // Skip diagram syntax
      if (line.match(/^[A-Z]\s*-->|^[A-Z]\s*->>|^\s*participant|^\s*end\s*$/)) {
        continue;
      }

      // Look for file paths (e.g., "src/file.ts:42") - must be at start of line or after minimal whitespace
      const fileMatch = line.match(/^\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z]{2,4}):(\d+)/);
      if (fileMatch) {
        // Skip if it looks like method calls
        if (fileMatch[1].includes('.find') || fileMatch[1].includes('.where') ||
            fileMatch[1].includes('.update') || fileMatch[1].includes('.on') ||
            fileMatch[1].includes('.resolve') || fileMatch[1].includes('.lock')) {
          continue;
        }

        // Validate file extension
        const ext = fileMatch[1].split('.').pop();
        const validExtensions = ['ts', 'tsx', 'js', 'jsx', 'rb', 'py', 'java', 'go', 'rs', 'vue', 'svelte'];
        if (!ext || !validExtensions.includes(ext)) {
          continue;
        }

        // Save previous comment if it's valid
        if (currentComment && currentComment.file && currentComment.message && currentComment.message.length >= 20) {
          comments.push(currentComment as ReviewComment);
        }

        currentComment = {
          file: fileMatch[1],
          line: parseInt(fileMatch[2], 10),
          severity,
          category: 'Code Quality',
          message: '',
        };
      } else if (currentComment && (line.trim().startsWith('-') || line.trim().startsWith('*'))) {
        // Accumulate message from bullet points
        const content = line.trim().substring(1).trim();

        // Skip if it's just a label
        if (content.match(/^(Severity|Category)[:*]/i)) {
          continue;
        }

        if (!currentComment.message) {
          currentComment.message = content;
        } else {
          currentComment.message += '\n' + content;
        }
      } else if (currentComment && line.trim() && currentComment.message) {
        // Continue accumulating message if we already have some message
        const trimmed = line.trim();
        if (trimmed.length > 10 && !trimmed.match(/^##/) && !trimmed.match(/^Severity[:*]/i)) {
          currentComment.message += '\n' + trimmed;
        }
      }
    }

    // Add last comment if valid
    if (currentComment && currentComment.file && currentComment.message && currentComment.message.length >= 20) {
      comments.push(currentComment as ReviewComment);
    }

    return comments;
  }

  /**
   * Try to parse JSON response from AI
   * Extracts JSON from markdown code blocks if present
   */
  private tryParseJSON(text: string): Partial<ReviewResult> | null {
    try {
      // Try to extract JSON from markdown code block
      const jsonBlockMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
      const jsonText = jsonBlockMatch ? jsonBlockMatch[1] : text;

      const parsed = JSON.parse(jsonText);

      // Validate that it has expected structure
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      // Check if this is a Claude Code envelope with structured_output
      // Format: { type: "result", structured_output: { ... } }
      let data = parsed;
      
      // Check for nested response string (common in some providers like Gemini CLI wrappers)
      if (parsed.response && typeof parsed.response === 'string') {
        console.log('[AI Review Parser] Detected nested response field, attempting to unwrap');
        // It might be markdown wrapped inside the string
        const nestedJsonBlockMatch = parsed.response.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
        const nestedJsonText = nestedJsonBlockMatch ? nestedJsonBlockMatch[1] : parsed.response;
        try {
           const nestedParsed = JSON.parse(nestedJsonText);
           if (nestedParsed && typeof nestedParsed === 'object') {
               data = nestedParsed;
               console.log('[AI Review Parser] Successfully unwrapped nested response');
           }
        } catch (e) {
           console.warn('[AI Review Parser] Failed to parse nested response string:', e);
           // Continue using original parsed object if nested parsing fails
        }
      } else if (parsed.structured_output && typeof parsed.structured_output === 'object') {
        console.log('[AI Review Parser] Detected Claude Code envelope format, extracting structured_output');
        data = parsed.structured_output;
      }

      // Map JSON structure to our ReviewResult interface
      const result: Partial<ReviewResult> = {
        summary: data.summary || 'Review completed',
        criticalIssues: this.validateComments(data.criticalIssues || [], 'critical'),
        warnings: this.validateComments(data.warnings || [], 'warning'),
        suggestions: this.validateComments(data.suggestions || [], 'suggestion'),
      };

      // Add optional sections if present
      if (data.changeIntents && Array.isArray(data.changeIntents)) {
        result.changeIntents = data.changeIntents.filter((ci: any) =>
          ci.file && ci.intent && ci.motivation
        );
      }

      if (data.callStacks && Array.isArray(data.callStacks)) {
        result.callStacks = data.callStacks.filter((cs: any) =>
          cs.function && cs.file && (cs.flowchart || cs.sequence)
        );
      }

      if (data.impactAnalysis && typeof data.impactAnalysis === 'object') {
        result.impactAnalysis = {
          scope: data.impactAnalysis.scope || 'Project',
          affectedAreas: Array.isArray(data.impactAnalysis.affectedAreas) ? data.impactAnalysis.affectedAreas : [],
          breakingChanges: Array.isArray(data.impactAnalysis.breakingChanges) ? data.impactAnalysis.breakingChanges : undefined,
          sideEffects: Array.isArray(data.impactAnalysis.sideEffects) ? data.impactAnalysis.sideEffects : undefined,
        };
      }

      if (data.movedCode && Array.isArray(data.movedCode)) {
        result.movedCode = data.movedCode.filter((mc: any) =>
          mc.from && mc.to && typeof mc.lines === 'number'
        );
      }

      if (data.refactorings && Array.isArray(data.refactorings)) {
        result.refactorings = data.refactorings.filter((r: any) =>
          r.type && r.description && Array.isArray(r.files)
        );
      }

      console.log('[AI Review Parser] JSON parsed successfully:', {
        criticalIssues: result.criticalIssues?.length,
        warnings: result.warnings?.length,
        suggestions: result.suggestions?.length,
        hasChangeIntents: !!result.changeIntents,
        hasCallStacks: !!result.callStacks,
        hasImpactAnalysis: !!result.impactAnalysis,
      });

      return result;
    } catch (error) {
      console.log('[AI Review Parser] JSON parsing failed:', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  /**
   * Parse line number from various formats
   * Handles: number, "123", "file:123", etc.
   */
  private parseLineNumber(line: any): number {
    // If already a valid number, return it
    if (typeof line === 'number' && line > 0) {
      return line;
    }

    // If string, try to parse
    if (typeof line === 'string') {
      // Check if it's in "file:line" format
      if (line.includes(':')) {
        const parts = line.split(':');
        const lastPart = parts[parts.length - 1].trim();
        const parsed = parseInt(lastPart, 10);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }

      // Try direct parsing
      const parsed = parseInt(line, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }

    // Default to line 1 if parsing fails
    return 1;
  }

  /**
   * Validate and normalize comment array
   * Handles alternative field names from different AI models
   */
  private validateComments(comments: any[], defaultSeverity: 'critical' | 'warning' | 'suggestion'): ReviewComment[] {
    if (!Array.isArray(comments)) {
      return [];
    }

    return comments
      .filter((comment: any) => {
        if (!comment || typeof comment !== 'object') return false;
        // Accept either 'message' or 'description' field
        const hasMessage = comment.message || comment.description;
        return hasMessage && String(hasMessage).length >= 5;
      })
      .map((comment: any) => {
        // Map alternative field names
        const message = comment.message || comment.description || '';
        const file = comment.file || comment.path || 'unknown';
        const line = this.parseLineNumber(comment.line || comment.lineNumber || comment.issue || 1);
        
        return {
          file: String(file),
          line,
          severity: comment.severity === 'critical' || comment.severity === 'warning' || comment.severity === 'suggestion'
            ? comment.severity
            : defaultSeverity,
          category: comment.category ? String(comment.category) : 'Code Review',
          message: String(message),
          suggestion: comment.suggestion ? String(comment.suggestion) : undefined,
        };
      });
  }

  /**
   * Fallback review when Claude CLI is not available
   */
  private getFallbackReview(): string {
    return `## Summary
Automated code review completed. Please note that AI-assisted review is currently unavailable.

## Critical Issues
No critical issues detected.

## Warnings
- Manual review recommended for security-sensitive changes
- Ensure proper test coverage

## Suggestions
- Consider adding inline documentation
- Review for code simplification opportunities`;
  }
}
