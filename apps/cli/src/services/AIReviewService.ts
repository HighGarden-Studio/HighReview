import { execa } from 'execa';
import * as path from 'path';
import * as fs from 'fs/promises';
import { AIReviewParser } from './AIReviewParser.js';
import { AIReviewKoreanParser } from './AIReviewKoreanParser.js';
import { AIProviderFactory, registerProviders, getDefaultProvider } from './providers/index.js';
import type { AIProvider } from './providers/index.js';
import { getAIConfigService } from './AIConfigService.js';
import { ContextAnalyzer } from './ContextAnalyzer.js';

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
   */
  private async initializeProvider(): Promise<void> {
    if (this.provider) {
      return; // Already initialized
    }

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
    options?: any
  ): Promise<ReviewResult> {
    try {
      // Initialize provider if needed
      await this.initializeProvider();

      console.log('[AI Review] Starting review for worktree:', worktreePath);

      // Get diff
      const diff = await this.getDiff(worktreePath, baseBranch);

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
      const allChangedFiles = await this.getChangedFiles(worktreePath, baseBranch);

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
          const comprehensiveContext = await contextAnalyzer.analyzeComprehensiveContext(diff, worktreePath);

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
      const settings = await configService.getProviderSettings();
      const model = settings?.model;

      if (model) {
        console.log(`[AI Review] Using configured model: ${model}`);
      }

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
        const debugPath = path.join('/tmp', `ai-review-debug-${Date.now()}.txt`);
        await fs.writeFile(debugPath, response.content, 'utf-8');
        console.log('[AI Review] Saved full response to:', debugPath);
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
   * Get git diff for the worktree
   */
  private async getDiff(worktreePath: string, baseBranch: string): Promise<string> {
    try {
      // Try with origin/ prefix first (for remote branches)
      try {
        const { stdout } = await execa('git', ['diff', `origin/${baseBranch}`, '--', '.'], {
          cwd: worktreePath,
        });
        console.log(`[AI Review] Got diff from origin/${baseBranch}, ${stdout.length} bytes`);
        return stdout;
      } catch (originError) {
        console.log(`[AI Review] origin/${baseBranch} not found, trying without origin/`);
      }

      // Try without origin/ prefix
      const { stdout } = await execa('git', ['diff', baseBranch, '--', '.'], {
        cwd: worktreePath,
      });
      console.log(`[AI Review] Got diff from ${baseBranch}, ${stdout.length} bytes`);
      return stdout;
    } catch (error: any) {
      console.error('[AI Review] Failed to get diff:', error);

      // Last resort: try to get diff from merge-base
      try {
        console.log('[AI Review] Trying merge-base approach...');
        const { stdout: mergeBase } = await execa('git', ['merge-base', 'HEAD', `origin/${baseBranch}`], {
          cwd: worktreePath,
        });
        const { stdout } = await execa('git', ['diff', mergeBase.trim(), '--', '.'], {
          cwd: worktreePath,
        });
        console.log(`[AI Review] Got diff from merge-base, ${stdout.length} bytes`);
        return stdout;
      } catch (mergeBaseError) {
        console.error('[AI Review] Merge-base approach also failed:', mergeBaseError);
        return '';
      }
    }
  }

  /**
   * Get list of changed files
   */
  private async getChangedFiles(worktreePath: string, baseBranch: string): Promise<string[]> {
    try {
      // Try with origin/ prefix first
      try {
        const { stdout } = await execa(
          'git',
          ['diff', '--name-only', `origin/${baseBranch}`, '--', '.'],
          { cwd: worktreePath }
        );
        const files = stdout.split('\n').filter(Boolean);
        console.log(`[AI Review] Found ${files.length} changed files from origin/${baseBranch}`);
        return files;
      } catch (originError) {
        // Try without origin/
        const { stdout } = await execa(
          'git',
          ['diff', '--name-only', baseBranch, '--', '.'],
          { cwd: worktreePath }
        );
        const files = stdout.split('\n').filter(Boolean);
        console.log(`[AI Review] Found ${files.length} changed files from ${baseBranch}`);
        return files;
      }
    } catch (error: any) {
      console.error('[AI Review] Failed to get changed files:', error);

      // Last resort: merge-base
      try {
        const { stdout: mergeBase } = await execa('git', ['merge-base', 'HEAD', `origin/${baseBranch}`], {
          cwd: worktreePath,
        });
        const { stdout } = await execa(
          'git',
          ['diff', '--name-only', mergeBase.trim(), '--', '.'],
          { cwd: worktreePath }
        );
        const files = stdout.split('\n').filter(Boolean);
        console.log(`[AI Review] Found ${files.length} changed files from merge-base`);
        return files;
      } catch (mergeBaseError) {
        console.error('[AI Review] Merge-base approach also failed:', mergeBaseError);
        return [];
      }
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
      en: 'Please respond in English.',
      ko: 'Please respond in Korean (한국어).',
      ja: 'Please respond in Japanese (日本語).',
      zh: 'Please respond in Chinese (中文).',
    };

    const instruction = languageInstructions[language as keyof typeof languageInstructions] || languageInstructions.en;

    let prompt = `You are a senior code reviewer ensuring high standards of code quality and security. ${instruction}

Review the following code changes and provide feedback:

## Changed Files (${files.length}):
${files.map(f => `- ${f}`).join('\n')}

## Diff:
\`\`\`diff
${diff}
\`\`\`

## Full File Contents (with line numbers for reference):
**IMPORTANT**: Each line is prefixed with its actual line number (e.g., "   1 | code"). Always use these line numbers when reporting issues.
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
      prompt += `\n## Change Intent Analysis:
Analyze the intent of changes at ${
        options.changeIntentLevel === 'file' ? 'file level' :
        options.changeIntentLevel === 'block' ? 'code block level' :
        'both file and code block levels'
      }.

Format as:
**File: \`path/to/file.ts\`**
- Intent: [What is being changed]
- Motivation: [Why the change is needed]
- Impact: [How it affects the codebase]

For each change, explain:
- What is being changed and why
- The likely purpose/motivation behind the change
- How it fits into the larger codebase
`;
    }

    // Add call stack visualization if requested
    if (options?.generateCallStack) {
      prompt += `\n## Call Stack Visualization:
For modified functions/methods, provide ${
        options.callStackFormat === 'flowchart' ? 'a flowchart representation' :
        options.callStackFormat === 'sequence' ? 'a sequence diagram' :
        'both flowchart and sequence diagram representations'
      } using Mermaid syntax.

Format each function as:
**Function: \`functionName\` in \`file/path.ts\`**

${options.callStackFormat !== 'sequence' ? `Flowchart:
\`\`\`mermaid
graph TD
    A[Caller] --> B[Current Function]
    B --> C[Called Function]
\`\`\`
` : ''}${options.callStackFormat !== 'flowchart' ? `Sequence Diagram:
\`\`\`mermaid
sequenceDiagram
    participant Caller
    participant CurrentFunction
    participant CalledFunction
    Caller->>CurrentFunction: call()
    CurrentFunction->>CalledFunction: process()
\`\`\`
` : ''}
Include:
- Callers of the modified function
- Functions called by the modified function
- Data flow between components
`;
    }

    // Add broader impact analysis if requested
    if (options?.analyzeBroaderImpact) {
      prompt += `\n## Impact Analysis:
Analyze the impact of changes beyond the modified code at ${
        options.impactScope === 'module' ? 'module/package level' :
        options.impactScope === 'project' ? 'project level' :
        'project and dependency level'
      }.

Format as:
Scope: **${
        options.impactScope === 'module' ? 'Module/Package' :
        options.impactScope === 'project' ? 'Project' :
        'Project + Dependencies'
      }**

Affected Areas:
- Area 1
- Area 2

Breaking Changes:
- Breaking change 1
- Breaking change 2

Side Effects:
- Side effect 1
- Side effect 2

Consider:
- Which other parts of the codebase might be affected
- Potential breaking changes
- Side effects on related functionality
- API contract changes
- Database schema impacts
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

## Output Format (MANDATORY):
You MUST respond with a valid JSON object. Do not include any explanatory text outside the JSON object.
The JSON object must follow this structure:

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
      "message": "Description of the warning",
      "suggestion": "Code improvement suggestion"
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
    // Only if change intent analysis is enabled
    {
      "file": "path/to/file.ts",
      "level": "file|block",
      "intent": "Brief description of intent",
      "motivation": "Why this change was made",
      "impact": "Impact on system"
    }
  ],
  "callStacks": [
    // Only if call stack generation is enabled
    {
      "function": "functionName",
      "file": "path/to/file.ts",
      "flowchart": "Mermaid flowchart definition",
      "sequence": "Mermaid sequence diagram definition"
    }
  ],
  "impactAnalysis": {
    // Only if impact analysis is enabled
    "scope": "module|project",
    "affectedAreas": ["Area 1", "Area 2"],
    "breakingChanges": ["Possible breaking change 1"],
    "sideEffects": ["Potential side effect 1"]
  },
  "movedCode": [
    // Only if moved code detection is enabled
    {
      "from": "source/file.ts",
      "to": "dest/file.ts",
      "lines": 10
    }
  ],
  "refactorings": [
    // Only if refactoring detection is enabled
    {
      "type": "Extract Method",
      "description": "Description of refactoring",
      "files": ["file1.ts", "file2.ts"]
    }
  ]
}
\`\`\`

Ensure all strings are properly escaped for JSON.

**CRITICAL**: When specifying line numbers for issues:
- Use the ACTUAL line numbers from the "Full File Contents" section (the numbers before the | symbol)
- DO NOT use line numbers from the git diff (@@) headers
- Example: If you see "  79 | where.not(key_name: ...", report line 79, not any other number

For each issue, provide:
- File path and line number (from Full File Contents)
- Severity (critical/warning/suggestion)
- Category (Security, Performance, Code Quality, etc.)
- Clear description of the issue
- Specific suggestion on how to fix it (optional)

Be specific and actionable in your feedback. Focus on the most important issues first.`;

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
      if (parsed.structured_output && typeof parsed.structured_output === 'object') {
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
