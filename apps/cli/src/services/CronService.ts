import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { DatabaseService, Repository } from './DatabaseService.js';
import { GitHubCLIService } from './GitHubCLIService.js';
import { AIReviewService } from './AIReviewService.js';

interface CronJob {
  repoId: string;
  task: ScheduledTask;
}

export class CronService {
  private static instance: CronService;
  private db: DatabaseService;
  private githubService: GitHubCLIService;
  private aiReviewService: AIReviewService;
  private jobs: Map<string, CronJob> = new Map();

  private constructor() {
    this.db = DatabaseService.getInstance();
    this.githubService = new GitHubCLIService();
    this.aiReviewService = new AIReviewService();
  }

  public static getInstance(): CronService {
    if (!CronService.instance) {
      CronService.instance = new CronService();
    }
    return CronService.instance;
  }

  /**
   * Initialize all cron jobs from database
   */
  public async initializeJobs(): Promise<void> {
    console.log('[CronService] Initializing cron jobs...');
    const repos = this.db.getAutoReviewRepositories();

    for (const repo of repos) {
      if (repo.cronSchedule) {
        await this.scheduleJob(repo);
      }
    }

    console.log(`[CronService] Initialized ${this.jobs.size} cron jobs`);
  }

  /**
   * Schedule a cron job for a repository
   */
  public async scheduleJob(repo: Repository): Promise<void> {
    // Stop existing job if any
    this.stopJob(repo.id);

    if (!repo.autoReview || !repo.cronSchedule) {
      console.log(`[CronService] Skipping ${repo.fullName} - auto review disabled or no schedule`);
      return;
    }

    // Validate cron schedule
    if (!cron.validate(repo.cronSchedule)) {
      console.error(`[CronService] Invalid cron schedule for ${repo.fullName}: ${repo.cronSchedule}`);
      return;
    }

    console.log(`[CronService] Scheduling job for ${repo.fullName} with schedule: ${repo.cronSchedule}`);

    const task = cron.schedule(repo.cronSchedule, async () => {
      await this.runAutoReview(repo);
    });

    this.jobs.set(repo.id, { repoId: repo.id, task });
  }

  /**
   * Stop a cron job for a repository
   */
  public stopJob(repoId: string): void {
    const job = this.jobs.get(repoId);
    if (job) {
      job.task.stop();
      this.jobs.delete(repoId);
      console.log(`[CronService] Stopped job for ${repoId}`);
    }
  }

  /**
   * Run auto review for a repository
   */
  private async runAutoReview(repo: Repository): Promise<void> {
    console.log(`[CronService] Running auto review for ${repo.fullName}...`);

    try {
      // Get open PRs for this repository
      const prs = await this.githubService.listPullRequests(repo.owner, repo.name, 'open');
      console.log(`[CronService] Found ${prs.length} open PRs for ${repo.fullName}`);

      for (const pr of prs) {
        const prNumber = pr.number;
        const headSha = pr.headRefOid;

        // Get AI review options (use saved options or defaults)
        const aiOptions = this.getAIReviewOptions(repo);
        const optionsHash = JSON.stringify(aiOptions);

        const hasCache = this.db.hasAIReviewCache(
          repo.owner,
          repo.name,
          prNumber,
          headSha,
          optionsHash
        );

        if (hasCache) {
          console.log(`[CronService] Skipping PR #${prNumber} - already reviewed (commit: ${headSha.substring(0, 7)})`);
          continue;
        }

        console.log(`[CronService] Reviewing PR #${prNumber} (commit: ${headSha.substring(0, 7)})...`);

        let worktreePath: string | null = null;
        const reviewStartTime = Date.now();

        try {
          // Create worktree for PR
          worktreePath = await this.githubService.createWorktreeForPR(
            repo.owner,
            repo.name,
            prNumber
          );

          console.log(`[CronService] Created worktree at ${worktreePath}`);

          // Get base branch (default to main if not specified)
          const baseBranch = pr.baseRefName || 'main';

          // Run AI review with configured options
          const reviewResult = await this.aiReviewService.reviewPR(
            worktreePath,
            baseBranch,
            'en', // Default to English for automated reviews
            {
              includeContext: aiOptions.includeContext,
              contextScope: aiOptions.contextScope,
              analyzeChangeIntent: aiOptions.analyzeChangeIntent,
              changeIntentLevel: aiOptions.changeIntentLevel,
              generateCallStack: aiOptions.generateCallStack,
              callStackFormat: aiOptions.callStackFormat,
              analyzeBroaderImpact: aiOptions.analyzeBroaderImpact,
              impactScope: aiOptions.impactScope,
              useSemanticDiff: aiOptions.useSemanticDiff,
              detectMovedCode: aiOptions.detectMovedCode,
              detectRefactoring: aiOptions.detectRefactoring,
              ignoreWhitespace: aiOptions.ignoreWhitespace,
              ignoreComments: aiOptions.ignoreComments,
              customPrompt: aiOptions.customPrompt,
            }
          );

          console.log(`[CronService] AI review completed for PR #${prNumber}:`, {
            filesReviewed: reviewResult.filesReviewed,
            totalIssues: reviewResult.totalIssues,
            criticalIssues: reviewResult.criticalIssues.length,
            warnings: reviewResult.warnings.length,
            suggestions: reviewResult.suggestions.length,
          });

          // Cache the result
          this.db.setAIReviewCache(
            repo.owner,
            repo.name,
            prNumber,
            headSha,
            optionsHash,
            reviewResult
          );

          // Get all reviewed files from the review result
          const reviewedFiles = this.extractReviewedFiles(reviewResult);

          // Save history record for successful review
          this.db.saveAutoReviewHistory({
            repositoryId: repo.id,
            owner: repo.owner,
            repo: repo.name,
            prNumber: prNumber,
            prTitle: pr.title,
            status: 'success',
            options: JSON.stringify(aiOptions),
            filesReviewed: JSON.stringify(reviewedFiles),
            summary: reviewResult.summary || 'No summary available',
            issueCount: reviewResult.totalIssues || 0,
            criticalCount: reviewResult.criticalIssues.length,
            warningCount: reviewResult.warnings.length,
            suggestionCount: reviewResult.suggestions.length,
            executedAt: reviewStartTime,
          });

          console.log(`[CronService] Completed and cached review for PR #${prNumber}, history saved`);
        } catch (reviewError: any) {
          console.error(`[CronService] Failed to review PR #${prNumber}:`, reviewError);

          // Cache a failure result to prevent infinite retries
          const failureResult = {
            summary: `Auto-review failed: ${reviewError.message}`,
            criticalIssues: [],
            warnings: [{
              file: 'unknown',
              line: 1,
              severity: 'warning' as const,
              category: 'Auto Review',
              message: `Automated review failed: ${reviewError.message}. Manual review recommended.`,
            }],
            suggestions: [],
            filesReviewed: 0,
            totalIssues: 1,
            error: reviewError.message,
          };

          this.db.setAIReviewCache(
            repo.owner,
            repo.name,
            prNumber,
            headSha,
            optionsHash,
            failureResult
          );

          // Save history record for failed review
          this.db.saveAutoReviewHistory({
            repositoryId: repo.id,
            owner: repo.owner,
            repo: repo.name,
            prNumber: prNumber,
            prTitle: pr.title,
            status: 'failed',
            options: JSON.stringify(aiOptions),
            filesReviewed: JSON.stringify([]),
            summary: `Auto-review failed: ${reviewError.message}`,
            issueCount: 1,
            criticalCount: 0,
            warningCount: 1,
            suggestionCount: 0,
            executedAt: reviewStartTime,
            error: reviewError.message,
          });

          console.log(`[CronService] Cached failure result for PR #${prNumber} to prevent retries, history saved`);
        } finally {
          // Clean up worktree after review (success or failure)
          if (worktreePath) {
            try {
              console.log(`[CronService] Cleaning up worktree for PR #${prNumber}...`);
              await this.githubService.removeWorktree(worktreePath);
              console.log(`[CronService] Worktree cleaned up successfully`);
            } catch (cleanupError: any) {
              console.error(`[CronService] Failed to cleanup worktree for PR #${prNumber}:`, cleanupError);
              // Don't throw - cleanup failure shouldn't fail the entire job
            }
          }
        }
      }

      console.log(`[CronService] Auto review completed for ${repo.fullName}`);
    } catch (error) {
      console.error(`[CronService] Failed to run auto review for ${repo.fullName}:`, error);
    }
  }

  /**
   * Extract reviewed files from review result
   */
  private extractReviewedFiles(reviewResult: any): string[] {
    const files = new Set<string>();

    // Extract files from issues
    if (reviewResult.criticalIssues) {
      reviewResult.criticalIssues.forEach((issue: any) => {
        if (issue.file) files.add(issue.file);
      });
    }
    if (reviewResult.warnings) {
      reviewResult.warnings.forEach((issue: any) => {
        if (issue.file) files.add(issue.file);
      });
    }
    if (reviewResult.suggestions) {
      reviewResult.suggestions.forEach((issue: any) => {
        if (issue.file) files.add(issue.file);
      });
    }

    return Array.from(files);
  }

  /**
   * Get AI review options for a repository (use saved options or defaults)
   */
  private getAIReviewOptions(repo: Repository): any {
    if (repo.aiReviewOptions) {
      try {
        // Parse saved options
        const savedOptions = JSON.parse(repo.aiReviewOptions);
        return savedOptions;
      } catch (error) {
        console.error(`[CronService] Failed to parse AI options for ${repo.fullName}, using defaults:`, error);
      }
    }

    // Return default options if no saved options or parsing failed
    return {
      includeContext: true,
      contextScope: 'both',
      analyzeChangeIntent: true,
      changeIntentLevel: 'both',
      generateCallStack: true,
      callStackFormat: 'both',
      analyzeBroaderImpact: true,
      impactScope: 'project',
      useSemanticDiff: true,
      detectMovedCode: true,
      detectRefactoring: true,
      ignoreWhitespace: true,
      ignoreComments: false,
      customPrompt: '',
    };
  }

  /**
   * Stop all cron jobs
   */
  public stopAllJobs(): void {
    console.log('[CronService] Stopping all cron jobs...');
    this.jobs.forEach((job) => {
      job.task.stop();
    });
    this.jobs.clear();
    console.log('[CronService] All jobs stopped');
  }

  /**
   * Get active jobs count
   */
  public getActiveJobsCount(): number {
    return this.jobs.size;
  }

  /**
   * Get active jobs
   */
  public getActiveJobs(): string[] {
    return Array.from(this.jobs.keys());
  }
}
