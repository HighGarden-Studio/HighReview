/**
 * ChunkedReviewExecutor
 * Executes chunked file reviews with sequential (local) or parallel (cloud) processing
 */

import {
  FileReviewChunk,
  ChunkReviewResult,
  ChunkedReviewProgress,
  ChunkingConfig,
  ChangedFileWithDiff,
  ChangeIntent,
  ImpactAnalysis,
  CallStackInfo,
  MovedCode,
  Refactoring,
} from '../types/ChunkedReviewTypes';
import { createHash } from 'crypto';
import { AIReviewParser } from './AIReviewParser.js';
import { ChunkingStrategyService, getChunkingStrategyService } from './ChunkingStrategyService.js';
import { DatabaseService } from './DatabaseService.js';
import type { AIProvider } from './providers/index.js';

// Re-export types needed by consumers
export interface ReviewComment {
  file: string;
  line: number;
  severity: 'critical' | 'warning' | 'suggestion';
  category: string;
  message: string;
  suggestion?: string;
}

export interface MergedReviewResult {
  summary: string;
  criticalIssues: ReviewComment[];
  warnings: ReviewComment[];
  suggestions: ReviewComment[];
  
  // Enhanced structured data
  changeIntents?: ChangeIntent[];
  impactAnalysis?: ImpactAnalysis;
  callStacks?: CallStackInfo[];
  movedCode?: MovedCode[];
  refactorings?: Refactoring[];
  
  // Legacy fields (kept for backward compatibility)
  changeIntent?: string;
  impact?: string;
  semanticAnalysis?: string;
  
  filesReviewed: number;
  totalIssues: number;
  chunkResults: ChunkReviewResult[];
  processingTimeMs: number;
  globalSuggestions?: string[];
}

export class ChunkedReviewExecutor {
  private chunkingService: ChunkingStrategyService;
  private db: DatabaseService;

  constructor(
    private provider: AIProvider,
    private providerType: string
  ) {
    this.chunkingService = getChunkingStrategyService();
    this.db = DatabaseService.getInstance();
  }

  /**
   * Execute chunked review on files
   */
  async executeChunkedReview(
    files: ChangedFileWithDiff[],
    fullContext: string,
    language: string,
    options: any,
    onProgress?: (progress: ChunkedReviewProgress) => void
  ): Promise<MergedReviewResult> {
    const startTime = Date.now();
    const config = this.chunkingService.getConfig(this.providerType);

    // Report: Preparing
    this.reportProgress(onProgress, {
      currentChunk: 0,
      totalChunks: 0,
      currentFiles: [],
      completedFiles: [],
      failedFiles: [],
      status: 'preparing',
      message: 'Preparing chunked review...',
    });

    // Create chunks
    const chunks = this.chunkingService.createChunks(files, config);

    // Report: Chunking complete
    this.reportProgress(onProgress, {
      currentChunk: 0,
      totalChunks: chunks.length,
      currentFiles: [],
      completedFiles: [],
      failedFiles: [],
      status: 'chunking',
      message: `Created ${chunks.length} chunks for ${files.length} files`,
    });

    // Add context to each chunk
    for (const chunk of chunks) {
      const chunkContext = this.chunkingService.extractChunkContext(
        chunk,
        fullContext,
        config.maxTokensPerChunk / 2 // Use half tokens for context, half for response
      );
      chunk.contexts = chunkContext ? [chunkContext] : [];
    }

    // Execute based on strategy
    let chunkResults: ChunkReviewResult[];
    if (config.strategy === 'parallel') {
      chunkResults = await this.executeParallel(chunks, config, language, options, onProgress);
    } else {
      chunkResults = await this.executeSequential(chunks, config, language, options, onProgress);
    }

    // Report: Merging
    const completedFiles = chunkResults
      .filter(r => r.success)
      .flatMap(r => r.reviewedFiles);
    const failedFiles = chunkResults
      .filter(r => !r.success)
      .flatMap(r => r.reviewedFiles);

    this.reportProgress(onProgress, {
      currentChunk: chunks.length,
      totalChunks: chunks.length,
      currentFiles: [],
      completedFiles,
      failedFiles,
      status: 'merging',
      message: 'Merging review results...',
    });

    // Merge results
    let mergedResult = this.mergeResults(chunkResults, startTime);

    // Report: Summarizing
    this.reportProgress(onProgress, {
      currentChunk: chunks.length,
      totalChunks: chunks.length,
      currentFiles: [],
      completedFiles,
      failedFiles,
      status: 'summarizing',
      message: 'AI is refining summary and impact analysis...',
    });

    // Refine summary with AI (condense per-file summaries)
    mergedResult = await this.refineSummaryWithAI(mergedResult, language);

    // Report: Completed
    this.reportProgress(onProgress, {
      currentChunk: chunks.length,
      totalChunks: chunks.length,
      currentFiles: [],
      completedFiles,
      failedFiles,
      status: 'completed',
      message: `Review completed: ${mergedResult.totalIssues} issues found`,
      elapsedMs: Date.now() - startTime,
    });

    return mergedResult;
  }

  /**
   * Execute chunks sequentially (for local models)
   */
  private async executeSequential(
    chunks: FileReviewChunk[],
    config: ChunkingConfig,
    language: string,
    options: any,
    onProgress?: (progress: ChunkedReviewProgress) => void
  ): Promise<ChunkReviewResult[]> {
    const results: ChunkReviewResult[] = [];
    const completedFiles: string[] = [];
    const failedFiles: string[] = [];

    console.log(`[ChunkedReview] Starting sequential processing of ${chunks.length} chunks`);

    for (const chunk of chunks) {
      // Report progress
      this.reportProgress(onProgress, {
        currentChunk: chunk.chunkIndex + 1,
        totalChunks: chunks.length,
        currentFiles: chunk.files,
        completedFiles: [...completedFiles],
        failedFiles: [...failedFiles],
        status: 'reviewing',
        message: `Reviewing chunk ${chunk.chunkIndex + 1}/${chunks.length}: ${chunk.files.join(', ')}`,
      });

      const result = await this.reviewChunk(chunk, config, language, options);
      results.push(result);

      if (result.success) {
        completedFiles.push(...result.reviewedFiles);
      } else {
        failedFiles.push(...result.reviewedFiles);
        console.error(`[ChunkedReview] Chunk ${chunk.chunkIndex} failed: ${result.error}`);
      }
    }

    return results;
  }

  /**
   * Execute chunks in parallel (for cloud models)
   */
  private async executeParallel(
    chunks: FileReviewChunk[],
    config: ChunkingConfig,
    language: string,
    options: any,
    onProgress?: (progress: ChunkedReviewProgress) => void
  ): Promise<ChunkReviewResult[]> {
    const maxConcurrency = config.maxConcurrency || 5;
    const results: ChunkReviewResult[] = new Array(chunks.length);
    const completedFiles: string[] = [];
    const failedFiles: string[] = [];
    let completedCount = 0;

    console.log(`[ChunkedReview] Starting parallel processing of ${chunks.length} chunks (concurrency: ${maxConcurrency})`);

    // Process in batches based on concurrency
    for (let i = 0; i < chunks.length; i += maxConcurrency) {
      const batch = chunks.slice(i, i + maxConcurrency);
      const currentFiles = batch.flatMap(c => c.files);

      // Report progress
      this.reportProgress(onProgress, {
        currentChunk: completedCount + 1,
        totalChunks: chunks.length,
        currentFiles,
        completedFiles: [...completedFiles],
        failedFiles: [...failedFiles],
        status: 'reviewing',
        message: `Reviewing chunks ${i + 1}-${Math.min(i + maxConcurrency, chunks.length)} of ${chunks.length}`,
      });

      // Execute batch in parallel
      const batchPromises = batch.map(chunk => 
        this.reviewChunk(chunk, config, language, options)
      );

      const batchResults = await Promise.all(batchPromises);

      // Store results and update tracking
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const chunkIndex = i + j;
        results[chunkIndex] = result;
        completedCount++;

        if (result.success) {
          completedFiles.push(...result.reviewedFiles);
        } else {
          failedFiles.push(...result.reviewedFiles);
          console.error(`[ChunkedReview] Chunk ${chunkIndex} failed: ${result.error}`);
        }
      }
    }

    return results;
  }

  /**
   * Review a single chunk
   */

  private async reviewChunk(
    chunk: FileReviewChunk,
    config: ChunkingConfig,
    language: string,
    options: any
  ): Promise<ChunkReviewResult> {
    const startTime = Date.now();

    try {
      // 1. Check cache
      const signature = this.generateChunkSignature(chunk, language, options);
      const prInfo = options?.prInfo;

      if (prInfo) {
        if (options?.forceRerun) {
          // Explicitly delete cache if forced rerun
          console.log(`[ChunkedReview] Force rerun active, deleting cache for chunk ${chunk.chunkIndex}`);
          this.db.deleteChunkCache(signature);
        } else {
          // Check existing cache
          const cached = this.db.getChunkCache(signature);
          if (cached) {
            console.log(`[ChunkedReview] Cache hit for chunk ${chunk.chunkIndex}`);
            return {
               ...cached.result,
               cached: true,
               processingTimeMs: 0
            };
          }
        }
      }

      // 2. Build prompt for this chunk
      const prompt = this.buildChunkPrompt(chunk, language, options);

      // Save prompt to temp file for debugging
      try {
        // Use synchronous fs to avoid race conditions in logging
        const fs = await import('fs/promises');
        const path = await import('path');
        const timestamp = Date.now();
        const debugPromptPath = path.join('/tmp', `ai-review-chunk-${chunk.chunkIndex}-prompt-${timestamp}.txt`);
        await fs.writeFile(debugPromptPath, prompt, 'utf-8');
        console.log(`[ChunkedReview] Saved chunk ${chunk.chunkIndex} prompt to:`, debugPromptPath);
      } catch (e) {
        console.error('[ChunkedReview] Failed to save debug prompt file:', e);
      }

      // Call provider
      const response = await this.provider.review({
        prompt,
        workingDirectory: process.cwd(),
        model: options?.model, // Pass configured model
        timeout: 300000, // 5 minutes per chunk
        language,
        options: {
          ...options,
          // Enable analysis options for all chunks
          analyzeChangeIntent: options?.analyzeChangeIntent,
          analyzeBroaderImpact: options?.analyzeBroaderImpact,
        },
      });

      // Parse response
      const parsed = this.parseChunkResponse(response.content);

      const result: ChunkReviewResult = {
        chunkIndex: chunk.chunkIndex,
        success: true,
        criticalIssues: parsed.criticalIssues || [],
        warnings: parsed.warnings || [],
        suggestions: parsed.suggestions || [],
        summary: parsed.summary,
        
        // Enhanced structured data
        changeIntents: parsed.changeIntents,
        impactAnalysis: parsed.impactAnalysis,
        callStacks: parsed.callStacks,
        movedCode: parsed.movedCode,
        refactorings: parsed.refactorings,
        
        // Legacy fields (fallback)
        changeIntent: parsed.changeIntent,
        impact: parsed.impact,
        semanticAnalysis: parsed.semanticAnalysis,
        
        processingTimeMs: Date.now() - startTime,
        reviewedFiles: chunk.files,
      };

      // 3. Save to cache
      if (result.success && prInfo) {
        this.db.saveChunkCache({
          signatureHash: signature,
          owner: prInfo.owner,
          repo: prInfo.repo,
          prNumber: prInfo.prNumber,
          chunkIndex: chunk.chunkIndex,
          files: chunk.files,
          result: result,
          createdAt: Date.now()
        });
      }

      return result;
    } catch (error: any) {
      console.error(`[ChunkedReview] Error reviewing chunk ${chunk.chunkIndex}:`, error.message);
      return {
        chunkIndex: chunk.chunkIndex,
        success: false,
        error: error.message,
        processingTimeMs: Date.now() - startTime,
        reviewedFiles: chunk.files,
      };
    }
  }

  /**
   * Build prompt for a single chunk
   */
  private buildChunkPrompt(chunk: FileReviewChunk, language: string, options: any): string {
    const filesSummary = chunk.files.map((f, i) => `- ${f}`).join('\n');
    
    // Use raw diffs (standard Git Diff format)
    const diffsContent = chunk.diffs.join('\n\n---\n\n');
    const contextContent = chunk.contexts.join('\n');

    const languageInstructions = {
      en: 'CRITICAL: You MUST respond in English. Do not use any other language.',
      ko: 'CRITICAL: 응답은 반드시 한국어(Korean)로 작성해야 합니다. 영어가 아닌 한국어로 코드 리뷰를 진행해 주세요.',
      ja: 'CRITICAL: 応答は必ず日本語(Japanese)で行ってください。英語ではなく日本語でコードレビューを行ってください。',
      zh: 'CRITICAL: 必须使用中文(Chinese)回答。请使用中文进行代码审查。',
    };

    const langInstruction = languageInstructions[language as keyof typeof languageInstructions] || languageInstructions.en;

    // Construct JSON structure example
    let jsonStructure = `
{
  "summary": "Brief summary of changes in this chunk",
  "summary_for_context": "One-line technical summary of changes in this chunk for PR-wide analysis",
  "criticalIssues": [{ "file": "path", "line": 123, "message": "issue description", "suggestion": "fix suggestion" }],
  "warnings": [],
  "suggestions": []
}`;

    const prInfo = options?.prInfo;
    const prContextSection = prInfo ? `
## Project Context & PR Description:
**Project**: ${prInfo.owner}/${prInfo.repo}
**PR Title**: ${prInfo.title}
**PR Description**:
${prInfo.description || '(No description provided)'}

**INSTRUCTION**: 
1. **Analyze the Project Domain**: Based on the project name, PR title, description, and the code changes, infer the project's domain and its architectural role.
2. **Adopt Domain Expert Persona**: Act as a **Senior Domain Expert** for this specific domain. Ensure the code aligns with domain-specific best practices.

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

` : '';

    let instructions = `You are a **Senior Domain Expert** reviewing a subset of files from a larger pull request.

${prContextSection}

## Files in this chunk (${chunk.chunkIndex + 1}/${chunk.totalChunks}):
${filesSummary}

${contextContent ? `## Related Context:\n${contextContent}\n` : ''}

## Diffs to Review:
**IMPORTANT**: The code below is in standard Git Diff format.
- Lines starting with \`-\` are removed.
- Lines starting with \`+\` are added.
- Lines starting with \` \` (space) are unchanged context.
- Use the hunk headers (e.g., \`@@ -10,5 +10,6 @@\`) to determine the correct line number for your comments.
- **DO NOT** count lines manually from the top of the block. You MUST use the hunk headers to derive the correct 1-based line number for the *modified* (new) version of the file.

**CRITICAL**: when providing line numbers in your report, calculate the REAL line number in the new file version.

${diffsContent}

Please review these files and provide:
1. Critical issues (security, bugs, errors)
2. Warnings (potential problems, performance issues)
3. Suggestions (improvements, best practices, or alternative implementation methods using other patterns)
`;

    const fileCount = chunk.files.length;

    instructions += `
    **IMPORTANT**: You are in the "Map" phase of a Map-Reduce review process.
    - **DO NOT** perform global analysis (Change Intent, Impact Analysis, Call Stacks).
    - **FOCUS ONLY** on Code Quality (Bugs, Security, Best Practices) for the specific files in this chunk.
    - **MANDATORY**: Provide the \`summary_for_context\` field to help the "Reduce" phase understands what happened here.`;

    instructions += `
Focus only on the files in this chunk. Be specific with file paths and line numbers.

IMPORTANT: Respond ONLY in valid JSON format matching this structure:
${jsonStructure}

**STRICT GENERATION RULES:**
1. **Valid JSON**: The response MUST be valid JSON. Do not include any text outside the JSON object.

2. **summary_for_context**:
   - Provide a CONCISE, one-line technical summary of the changes in this chunk.
   - This will be used as input for a final high-level PR architect to understand the overall impact.
   - Example: "Added pagination support to AdTable component and updated API header for file uploads."

3. **Line Number Accuracy**:
   - **CRITICAL**: Reported line numbers MUST exist in the code context provided.
   - For added lines (starting with + in diff), count from the hunk header's NEW file start line.
   - For unchanged lines (starting with space), count continuously.
   - Do NOT report issues on removed lines (starting with -).

4. **Severity Filtering**:
   - **Classify issues into**: Critical, Warning, Suggestion, and Nitpick (Nit).
   - **FILTER RULE**: **EXCLUDE** 'Nitpick' issues from the output. Only return Critical, Warning, and Suggestion.
   
5. **General**:
   - Ensure the response is valid JSON.
   - Escape all strings properly.
`;

    instructions += `
    
    ## Language Instruction
    ${langInstruction}
    `;

    return instructions;
  }

  /**
   * Parse chunk response into structured result
   */
  private parseChunkResponse(content: string): {
    summary?: string;
    criticalIssues?: ReviewComment[];
    warnings?: ReviewComment[];
    suggestions?: ReviewComment[]
    changeIntent?: string;
    changeIntents?: ChangeIntent[];
    impact?: string;
    impactAnalysis?: ImpactAnalysis;
    semanticAnalysis?: string;
    callStacks?: CallStackInfo[];
    movedCode?: MovedCode[];
    refactorings?: Refactoring[];
    summary_for_context?: string;
  } {
    try {
      // 1. Try to find JSON in markdown code blocks first (most reliable)
      const codeBlockMatch = content.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        const parsed = JSON.parse(codeBlockMatch[1]);
        return this.mapParsedResponse(parsed);
      }

      // 2. Try to find raw JSON object
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
         try {
            const parsed = JSON.parse(jsonMatch[0]);
            return this.mapParsedResponse(parsed);
         } catch (e) {
            // If regex matched too much (e.g. multiple JSONs), try stricter parsing
            // This is a fallback
            console.warn('[ChunkedReview] Regex JSON match failed parsing, falling back to text');
         }
      }
    } catch (e) {
      console.error('[ChunkedReview] Failed to parse chunk response:', e);
      // Fall through to text parsing
    }

    // Basic text parsing fallback
    return {
      summary: content.substring(0, 200),
      criticalIssues: [],
      warnings: [],
      suggestions: [],
    };
  }

  private mapParsedResponse(parsed: any) {
     return {
        summary: parsed.summary,
        criticalIssues: this.normalizeComments(parsed.criticalIssues, 'critical'),
        warnings: this.normalizeComments(parsed.warnings, 'warning'),
        suggestions: this.normalizeComments(parsed.suggestions, 'suggestion'),
        
        // Enhanced Structured Data (with post-processing normalization)
        changeIntents: this.normalizeChangeIntents(parsed.changeIntents),
        impactAnalysis: this.normalizeImpactAnalysis(parsed.impactAnalysis),
        callStacks: this.normalizeCallStacks(parsed.callStacks),
        movedCode: Array.isArray(parsed.movedCode) ? parsed.movedCode : undefined,
        refactorings: Array.isArray(parsed.refactorings) ? parsed.refactorings : undefined,
        summary_for_context: parsed.summary_for_context,

        // Legacy / Fallback
        changeIntent: parsed.changeIntent,
        impact: parsed.impact,
        semanticAnalysis: parsed.semanticAnalysis,
      };
  }

  /**
   * Normalize call stacks by unwrapping mermaid code
   */
  private normalizeCallStacks(callStacks: any): CallStackInfo[] | undefined {
    if (!Array.isArray(callStacks)) return undefined;

    return callStacks.map((cs: any) => ({
      function: cs.function || 'Unknown',
      file: cs.file || 'Unknown',
      callers: Array.isArray(cs.callers) ? cs.callers : [],
      flowchart: AIReviewParser.normalizeMermaid(cs.flowchart),
      sequence: AIReviewParser.normalizeMermaid(cs.sequence),
    }));
  }

  /**
   * Post-process changeIntents to fix malformed AI response
   * When AI generates a single object with merged markdown, parse it into separate objects
   */
  private normalizeChangeIntents(changeIntents: any): ChangeIntent[] | undefined {
    if (!Array.isArray(changeIntents) || changeIntents.length === 0) {
      return undefined;
    }

    // Check if it's a malformed single-item array with merged markdown
    if (changeIntents.length === 1 && changeIntents[0]) {
      const item = changeIntents[0];
      const intentStr = item.intent || '';
      
      // Detect merged markdown pattern: "**File: path**\n- Intent:"
      if (intentStr.includes('**File:') && intentStr.includes('- Intent:')) {
        console.log('[ChunkedReview] Detected merged changeIntents, parsing...');
        return this.parseChangeIntentsFromMarkdown(intentStr);
      }
    }

    // Already properly structured - just validate and return
    return changeIntents.filter((ci: any) => ci && ci.intent).map((ci: any) => ({
      file: ci.file || 'Unknown',
      level: ci.level || 'file',
      intent: ci.intent,
      motivation: ci.motivation || '',
      impact: ci.impact,
    }));
  }

  /**
   * Parse merged markdown blob into individual ChangeIntent objects
   * Handles the AI's tendency to put all files in a single markdown blob
   */
  private parseChangeIntentsFromMarkdown(markdown: string): ChangeIntent[] {
    const results: ChangeIntent[] = [];
    
    // Normalize newlines - handle both literal \n and escaped \\n
    const normalized = markdown.replace(/\\n/g, '\n');
    
    console.log('[ChunkedReview] Parsing markdown blob, length:', normalized.length);
    
    // Split by file sections - each section starts with "**File:"
    // Pattern accounts for leading newlines between sections
    const sections = normalized.split(/\n\n(?=\*\*File:)/);
    
    console.log('[ChunkedReview] Found', sections.length, 'potential file sections');
    
    for (const section of sections) {
      // Skip empty sections
      if (!section.trim()) continue;
      
      // Extract file path: **File: path**
      const fileMatch = section.match(/\*\*File:\s*([^*\n]+)\*\*/);
      if (!fileMatch) {
        // Try alternate pattern: just File: path without bold
        const altFileMatch = section.match(/File:\s*`?([^`\n]+)`?(?:\*\*)?/);
        if (!altFileMatch) continue;
        
        // Parse with alternate pattern
        const intentMatch = section.match(/Intent:\s*([^\n]+)/i);
        const motivationMatch = section.match(/Motivation:\s*([^\n]+)/i);
        const impactMatch = section.match(/Impact:\s*([^\n]+)/i);
        
        if (intentMatch) {
          results.push({
            file: altFileMatch[1].trim(),
            level: 'file',
            intent: intentMatch[1].trim(),
            motivation: motivationMatch?.[1]?.trim() || '',
            impact: impactMatch?.[1]?.trim(),
          });
        }
        continue;
      }
      
      const filePath = fileMatch[1].trim();
      
      // Extract Intent, Motivation, Impact from this section
      // Pattern: "- Intent: text" or just "Intent: text"
      const intentMatch = section.match(/-?\s*Intent:\s*([^\n]+)/i);
      const motivationMatch = section.match(/-?\s*Motivation:\s*([^\n]+)/i);
      const impactMatch = section.match(/-?\s*Impact:\s*([^\n]+)/i);
      
      if (intentMatch) {
        results.push({
          file: filePath,
          level: 'file',
          intent: intentMatch[1].trim(),
          motivation: motivationMatch?.[1]?.trim() || '',
          impact: impactMatch?.[1]?.trim(),
        });
      }
    }

    // Fallback: if splitting didn't work, try global regex
    if (results.length === 0) {
      console.log('[ChunkedReview] Section split failed, trying global regex...');
      
      // More flexible pattern
      const globalPattern = /\*\*File:\s*([^*]+)\*\*[^]*?-?\s*Intent:\s*([^\n]+)(?:[^]*?-?\s*Motivation:\s*([^\n]+))?(?:[^]*?-?\s*Impact:\s*([^\n]+))?/gi;
      
      let match;
      while ((match = globalPattern.exec(normalized)) !== null) {
        results.push({
          file: match[1].trim(),
          level: 'file',
          intent: match[2].trim(),
          motivation: match[3]?.trim() || '',
          impact: match[4]?.trim(),
        });
      }
    }

    console.log(`[ChunkedReview] Successfully parsed ${results.length} changeIntents from markdown`);
    return results;
  }

  /**
   * Post-process impactAnalysis to fix malformed arrays
   * Handles the case where AI dumps everything into affectedAreas as one blob
   */
  private normalizeImpactAnalysis(impactAnalysis: any): ImpactAnalysis | undefined {
    if (!impactAnalysis || typeof impactAnalysis !== 'object') {
      return undefined;
    }

    const result: ImpactAnalysis = {
      scope: 'Module',
      affectedAreas: [],
      breakingChanges: [],
      sideEffects: [],
    };

    // Check if all content is dumped into affectedAreas as a single blob
    if (Array.isArray(impactAnalysis.affectedAreas) && impactAnalysis.affectedAreas.length === 1) {
      const blob = String(impactAnalysis.affectedAreas[0]);
      
      // Normalize newlines
      const normalized = blob.replace(/\\n/g, '\n');
      
      // Check if it contains section markers
      if (normalized.includes('Affected Areas:') || normalized.includes('Breaking Changes:') || normalized.includes('Side Effects:')) {
        console.log('[ChunkedReview] Detected merged impactAnalysis blob, parsing sections...');
        
        // Extract scope
        const scopeMatch = normalized.match(/Scope:\s*\*?\*?([^*\n,]+)/i);
        if (scopeMatch) {
          result.scope = scopeMatch[1].trim().replace(/\*\*/g, '');
        }
        
        // Extract Affected Areas section
        const areasMatch = normalized.match(/Affected Areas:\s*([\s\S]*?)(?=Breaking Changes:|Side Effects:|$)/i);
        if (areasMatch) {
          result.affectedAreas = this.extractListItems(areasMatch[1]);
        }
        
        // Extract Breaking Changes section  
        const breakingMatch = normalized.match(/Breaking Changes:\s*([\s\S]*?)(?=Side Effects:|$)/i);
        if (breakingMatch) {
          result.breakingChanges = this.extractListItems(breakingMatch[1]);
        }
        
        // Extract Side Effects section
        const sideEffectsMatch = normalized.match(/Side Effects:\s*([\s\S]*?)$/i);
        if (sideEffectsMatch) {
          result.sideEffects = this.extractListItems(sideEffectsMatch[1]);
        }
        
        console.log(`[ChunkedReview] Parsed impactAnalysis: ${result.affectedAreas.length} areas, ${result.breakingChanges?.length || 0} breaking, ${result.sideEffects?.length || 0} side effects`);
        return result;
      }
    }

    // Standard normalization for properly structured responses
    result.scope = impactAnalysis.scope || 'Module';
    result.affectedAreas = this.normalizeStringArray(impactAnalysis.affectedAreas);
    
    if (impactAnalysis.breakingChanges) {
      result.breakingChanges = this.normalizeStringArray(impactAnalysis.breakingChanges);
    }
    
    if (impactAnalysis.sideEffects) {
      result.sideEffects = this.normalizeStringArray(impactAnalysis.sideEffects);
    }

    return result;
  }

  /**
   * Extract list items from a markdown section
   */
  private extractListItems(text: string): string[] {
    if (!text) return [];
    
    // Split by markdown list markers
    const items = text
      .split(/\n[-•*]\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('Scope:'));
    
    // If no list markers found, try splitting by newlines
    if (items.length <= 1 && text.includes('\n')) {
      return text
        .split('\n')
        .map(s => s.replace(/^[-•*]\s*/, '').trim())
        .filter(s => s.length > 0 && !s.startsWith('Scope:') && !s.startsWith('Affected'));
    }
    
    return items;
  }

  /**
   * Normalize a string array that might contain a single merged markdown string
   */
  private normalizeStringArray(arr: any): string[] {
    if (!arr) return [];
    if (!Array.isArray(arr)) return [String(arr)];
    
    // Check if it's a single item with embedded list markers
    if (arr.length === 1 && typeof arr[0] === 'string') {
      const str = arr[0].replace(/\\n/g, '\n');
      
      // Detect embedded markdown list: "- Item1\n- Item2"
      if (str.includes('\n-') || str.includes('\n•') || str.includes('\n*')) {
        console.log('[ChunkedReview] Detected merged string array, splitting...');
        return this.extractListItems(str);
      }
    }
    
    // Already properly structured
    return arr.map((item: any) => String(item).trim()).filter((s: string) => s.length > 0);
  }

  /**
   * Normalize comments from AI response
   */
  private normalizeComments(
    comments: any[],
    defaultSeverity: 'critical' | 'warning' | 'suggestion'
  ): ReviewComment[] {
    if (!Array.isArray(comments)) return [];

    return comments
      .filter(c => c && typeof c === 'object')
      .map(c => ({
        file: String(c.file || c.path || 'unknown'),
        line: parseInt(c.line || c.lineNumber || 1, 10) || 1,
        severity: c.severity || defaultSeverity,
        category: String(c.category || 'Code Review'),
        message: String(c.message || c.description || ''),
        suggestion: c.suggestion ? String(c.suggestion) : undefined,
      }))
      .filter(c => c.message.length >= 5);
  }

  /**
   * Merge results from all chunks into single result
   */
  private mergeResults(
    chunkResults: ChunkReviewResult[],
    startTime: number
  ): MergedReviewResult {
    const allCritical: ReviewComment[] = [];
    const allWarnings: ReviewComment[] = [];
    const allSuggestions: ReviewComment[] = [];

    const summaries: string[] = [];
    
    // New array/object collections
    const allChangeIntents: ChangeIntent[] = [];
    const allImpactAnalyses: ImpactAnalysis[] = [];
    const allCallStacks: CallStackInfo[] = [];
    const allMovedCode: MovedCode[] = [];
    const allRefactorings: Refactoring[] = [];
    
    // Legacy string collections
    const changeIntents: string[] = [];
    const impacts: string[] = [];
    const semanticAnalyses: string[] = [];
    
    let filesReviewed = 0;

    for (const result of chunkResults) {
      if (result.success) {
        if (result.criticalIssues) allCritical.push(...result.criticalIssues);
        if (result.warnings) allWarnings.push(...result.warnings);
        if (result.suggestions) allSuggestions.push(...result.suggestions);
        if (result.summary) summaries.push(result.summary);
        
        // Collect enhanced structured data
        if (result.changeIntents && Array.isArray(result.changeIntents)) {
           // Ensure items conform to ChangeIntent interface
           const validItems = result.changeIntents.filter(item => item && item.intent && item.motivation);
           allChangeIntents.push(...validItems as ChangeIntent[]);
        }
        
        if (result.impactAnalysis) {
          allImpactAnalyses.push(result.impactAnalysis as ImpactAnalysis);
        }
        
        if (result.callStacks && Array.isArray(result.callStacks)) {
          allCallStacks.push(...result.callStacks as CallStackInfo[]);
        }
        
        if (result.movedCode && Array.isArray(result.movedCode)) {
          allMovedCode.push(...result.movedCode as MovedCode[]);
        }
        
        if (result.refactorings && Array.isArray(result.refactorings)) {
          allRefactorings.push(...result.refactorings as Refactoring[]);
        }

        // Collect legacy string format (fallback)
        if (result.changeIntent) changeIntents.push(result.changeIntent);
        if (result.impact) impacts.push(result.impact);
        if (result.semanticAnalysis) semanticAnalyses.push(result.semanticAnalysis);
        
        filesReviewed += result.reviewedFiles.length;
      }
    }

    // Deduplicate by file+line+message
    const dedupeComments = (comments: ReviewComment[]): ReviewComment[] => {
      const seen = new Set<string>();
      return comments.filter(c => {
        const key = `${c.file}:${c.line}:${c.message.substring(0, 50)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const criticalIssues = dedupeComments(allCritical);
    const warnings = dedupeComments(allWarnings);
    const suggestions = dedupeComments(allSuggestions);

    // Generate merged summary
    const failedCount = chunkResults.filter(r => !r.success).length;
    const successCount = chunkResults.filter(r => r.success).length;
    const summary = this.generateMergedSummary(summaries, successCount, failedCount, filesReviewed);

    // Merge Impact Analysis
    const mergedImpactAnalysis: ImpactAnalysis | undefined = allImpactAnalyses.length > 0 
      ? {
          scope: Array.from(new Set(allImpactAnalyses.map(i => i.scope))).join(', '),
          affectedAreas: Array.from(new Set(allImpactAnalyses.flatMap(i => i.affectedAreas || []))),
          breakingChanges: Array.from(new Set(allImpactAnalyses.flatMap(i => i.breakingChanges || []))),
          sideEffects: Array.from(new Set(allImpactAnalyses.flatMap(i => i.sideEffects || []))),
          description: allImpactAnalyses.map(i => i.description).filter(Boolean).join('\n\n---\n\n')
        }
      : impacts.length > 0
        ? {
            scope: 'Multiple Files',
            affectedAreas: impacts.flatMap(i => i.split(',').map(s => s.trim())),
            description: impacts.join('\n\n')
          }
        : undefined;

    // Generate legacy strings from structured data if not present
    let finalChangeIntentStr = changeIntents.length > 0 ? changeIntents.join('\n\n---\n\n') : undefined;
    if (!finalChangeIntentStr && allChangeIntents.length > 0) {
      finalChangeIntentStr = allChangeIntents.map(ci => 
        `**File: ${ci.file || 'Unknown'}**\n- Intent: ${ci.intent}\n- Motivation: ${ci.motivation}\n- Impact: ${ci.impact || 'N/A'}`
      ).join('\n\n');
    }

    let finalImpactStr = impacts.length > 0 ? impacts.join('\n\n---\n\n') : undefined;
    if (!finalImpactStr && mergedImpactAnalysis) {
      finalImpactStr = `Scope: **${mergedImpactAnalysis.scope}**\n\nAffected Areas:\n${mergedImpactAnalysis.affectedAreas.map(a => `- ${a}`).join('\n')}\n\nBreaking Changes:\n${(mergedImpactAnalysis.breakingChanges || []).map(b => `- ${b}`).join('\n')}\n\nSide Effects:\n${(mergedImpactAnalysis.sideEffects || []).map(s => `- ${s}`).join('\n')}`;
    }

    let finalSemanticStr = semanticAnalyses.length > 0 ? semanticAnalyses.join('\n\n---\n\n') : undefined;
    if (!finalSemanticStr) {
      const parts = [];
      if (allMovedCode.length > 0) {
        parts.push(`## Moved Code\n${allMovedCode.map(m => `- ${m.from} -> ${m.to} (${m.lines} lines)`).join('\n')}`);
      }
      if (allRefactorings.length > 0) {
        parts.push(`## Refactorings\n${allRefactorings.map(r => `**${r.type}**: ${r.description} (${r.files.join(', ')})`).join('\n')}`);
      }
      if (parts.length > 0) {
        finalSemanticStr = parts.join('\n\n');
      }
    }

    return {
      summary,
      criticalIssues,
      warnings,
      suggestions,
      
      // Enhanced Structured Data
      changeIntents: allChangeIntents.length > 0 ? allChangeIntents : undefined,
      impactAnalysis: mergedImpactAnalysis,
      callStacks: allCallStacks.length > 0 ? allCallStacks : undefined,
      movedCode: allMovedCode.length > 0 ? allMovedCode : undefined,
      refactorings: allRefactorings.length > 0 ? allRefactorings : undefined,
      
      // Legacy fields (kept for backward compatibility)
      changeIntent: finalChangeIntentStr,
      impact: finalImpactStr,
      semanticAnalysis: finalSemanticStr,
      
      filesReviewed,
      totalIssues: criticalIssues.length + warnings.length + suggestions.length,
      chunkResults,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Generate a summary from chunk summaries
   */
  private generateMergedSummary(
    chunkSummaries: string[],
    successCount: number,
    failedCount: number,
    filesReviewed: number
  ): string {
    let summary = `Reviewed ${filesReviewed} files in ${successCount} chunks.`;
    
    if (failedCount > 0) {
      summary += ` (${failedCount} chunks failed)`;
    }

    if (chunkSummaries.length > 0) {
      summary += '\n\n' + chunkSummaries.join('\n');
    }

    return summary;
  }

  /**
   * Report progress to callback
   */
  private reportProgress(
    callback: ((progress: ChunkedReviewProgress) => void) | undefined,
    progress: ChunkedReviewProgress
  ): void {
    if (callback) {
      try {
        callback(progress);
      } catch (e) {
        console.error('[ChunkedReview] Progress callback error:', e);
      }
    }
  }



  /**
   * Generate unique signature for a chunk to use as cache key
   */
  private generateChunkSignature(chunk: FileReviewChunk, language: string, options: any): string {
    const hash = createHash('sha256');
    
    hash.update(language);
    hash.update(JSON.stringify([...chunk.files].sort()));
    hash.update(JSON.stringify([...(chunk.diffHashes || [])].sort()));
    
    // Options (exclude volatile or irrelevant fields)
    const { prInfo, forceRerun, ...stableOptions } = options || {};
    hash.update(JSON.stringify(stableOptions));
    
    // Provider specific
    hash.update(this.providerType);
    
    return hash.digest('hex');
  }

  /**
   * Refine merged summary and impact analysis with AI
   * Condenses per-file summaries into a concise overall PR summary
   */
  async refineSummaryWithAI(
    mergedResult: MergedReviewResult,
    language: string
  ): Promise<MergedReviewResult> {
    try {
      console.log('[ChunkedReview] Starting AI summary refinement...');

      // Build the refinement prompt
      const prompt = this.buildRefinementPrompt(mergedResult, language);
      
      // Call AI provider for refinement
      const response = await this.provider.review({
        prompt,
        workingDirectory: process.cwd(),
        model: undefined, // Use default model
        timeout: 300000, // 5 minute timeout for summarization (Stage 3 Reduce phase)
      });

      // Parse refined response
      const refined = this.parseRefinedSummary(response.content);
      
      if (refined) {
        console.log('[ChunkedReview] AI summary refinement (Reduce Phase) successful');
        return {
          ...mergedResult,
          summary: refined.summary || mergedResult.summary,
          globalSuggestions: refined.globalSuggestions || mergedResult.globalSuggestions,
          changeIntent: refined.changeIntent || mergedResult.changeIntent,
          impactAnalysis: refined.impactAnalysis || mergedResult.impactAnalysis,
          callStacks: refined.callStacks || mergedResult.callStacks,
        };
      }
      
      console.log('[ChunkedReview] Using original merged summary (refinement parse failed)');
      return mergedResult;
    } catch (error) {
      console.error('[ChunkedReview] AI summary refinement failed:', error);
      // Return original merged result if refinement fails
      return mergedResult;
    }
  }

  /**
   * Build prompt for AI summary refinement
   */
  private buildRefinementPrompt(mergedResult: MergedReviewResult, language: string): string {
    const langName = language === 'ko' ? '한국어' : language === 'ja' ? '日本語' : language === 'zh' ? '中文' : 'English';
    
    // Collect summaries from chunks for context
    const chunkSummaries = mergedResult.chunkResults
      .map((r, i) => `[Batch ${i + 1}] ${r.summary_for_context || r.summary || 'No summary'}`)
      .join('\n');

    return `You are a Senior System Architect & Technical Lead. Your task is to perform a global "Reduce" analysis of a Pull Request based on summaries from individual file batch reviews.

## PR Context (Summaries from Batch Reviews):
${chunkSummaries}

## Your Task:
Provide a comprehensive, high-level analysis of the entire PR. 

1. **Overall Summary**: A concise overview of the PR's purpose and what it achieves.
2. **Global Suggestions**: Based on the global context of all changes, provide a list of specific, high-level suggestions. This can include:
   - Ways to improve the implemented code or design
   - Alternative implementation methods using different architectural patterns
   - Global refactoring opportunities that could improve the overall system design
3. **Global Change Intent**: Explain WHY these changes were made and their overall architectural goal.
4. **Impact Analysis**: Assess the PR-wide impact, including scope, affected areas, and risks.
5. **Logic Flow Diagrams**: Generate Mermaid.js code to visualize the overall logic, data flow, or architectural structure.
   - **Flowchart**: Use \`graph TD\` for logic/data flow.
   - **Sequence Diagram**: Use \`sequenceDiagram\` for interactions.
   - **Class Diagram**: Use \`classDiagram\` for class inheritance, interfaces, or relationships.
   - **JSON Field Usage**: Place \`classDiagram\` or \`graph TD\` code in the \`flowchart\` field. Place \`sequenceDiagram\` in the \`sequence\` field.


## JSON Response Format:
{
  "summary": "...",
  "globalSuggestions": ["Suggestion 1", "Suggestion 2", "..."],
  "changeIntent": "...",
  "impactAnalysis": {
    "scope": "Module|Project|Dependencies",
    "affectedAreas": ["..."],
    "breakingChanges": ["..."],
    "sideEffects": ["..."],
    "description": "..."
  },
  "callStacks": [
    {
      "function": "Main Execution Flow",
      "file": "PR-Wide",
      "flowchart": "graph TD\\n  A[Start] --> B[...]",
      "sequence": "sequenceDiagram\\n  Participant A\\n  Participant B\\n  A->>B: Data"
    }
  ]
}

## Constraints:
- Mermaid diagrams: Output RAW mermaid syntax. DO NOT use markdown code blocks (\`\`\`mermaid\`) inside the JSON fields.
- Escape all special characters for valid JSON.
- Output Language: ${langName}.
- Focus on the "Big Picture" and how these batched changes work together.`;
  }

  /**
   * Parse refined summary from AI response
   */
  private parseRefinedSummary(content: string): { 
    summary?: string; 
    globalSuggestions?: string[];
    changeIntent?: string;
    impactAnalysis?: ImpactAnalysis;
    callStacks?: CallStackInfo[];
  } | null {
    try {
      // Try to extract JSON from response
      let jsonContent = content.trim();
      
      // Remove markdown code blocks if present
      const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1].trim();
      }
      
      // Find JSON object
      const startIdx = jsonContent.indexOf('{');
      const endIdx = jsonContent.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        jsonContent = jsonContent.substring(startIdx, endIdx + 1);
      }

      const parsed = JSON.parse(jsonContent);
      
      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
        globalSuggestions: Array.isArray(parsed.globalSuggestions) ? parsed.globalSuggestions : undefined,
        changeIntent: typeof parsed.changeIntent === 'string' ? parsed.changeIntent : undefined,
        impactAnalysis: parsed.impactAnalysis && typeof parsed.impactAnalysis === 'object' 
          ? parsed.impactAnalysis as ImpactAnalysis 
          : undefined,
        callStacks: Array.isArray(parsed.callStacks) ? parsed.callStacks as CallStackInfo[] : undefined,
      };
    } catch (error) {
      console.error('[ChunkedReview] Failed to parse refined summary:', error);
      return null;
    }
  }
}
