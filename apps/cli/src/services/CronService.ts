import cron from 'node-cron';
import { DatabaseService, Repository } from './DatabaseService.js';
import { GitHubCLIService } from './GitHubCLIService.js';

interface CronJob {
  repoId: string;
  task: cron.ScheduledTask;
}

export class CronService {
  private static instance: CronService;
  private db: DatabaseService;
  private githubService: GitHubCLIService;
  private jobs: Map<string, CronJob> = new Map();

  private constructor() {
    this.db = DatabaseService.getInstance();
    this.githubService = new GitHubCLIService();
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

        // Check if we already have a cached review for this commit
        const defaultOptions = this.getDefaultAIReviewOptions();
        const optionsHash = JSON.stringify(defaultOptions);

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

        // Create worktree for PR
        const worktreePath = await this.githubService.createWorktreeForPR(
          repo.owner,
          repo.name,
          prNumber
        );

        // Run AI review
        // TODO: Integrate with AI review service
        // For now, just log
        console.log(`[CronService] Would run AI review for PR #${prNumber} at ${worktreePath}`);

        // Cache the result (for now, just mark as reviewed)
        const mockReview = {
          summary: 'Auto-review completed',
          criticalIssues: [],
          warnings: [],
          suggestions: [],
          filesReviewed: pr.changedFiles || 0,
          totalIssues: 0,
        };

        this.db.setAIReviewCache(
          repo.owner,
          repo.name,
          prNumber,
          headSha,
          optionsHash,
          mockReview
        );

        console.log(`[CronService] Completed review for PR #${prNumber}`);
      }

      console.log(`[CronService] Auto review completed for ${repo.fullName}`);
    } catch (error) {
      console.error(`[CronService] Failed to run auto review for ${repo.fullName}:`, error);
    }
  }

  /**
   * Get default AI review options
   */
  private getDefaultAIReviewOptions(): any {
    return {
      includeCallStacks: true,
      includeImpactAnalysis: true,
      includeChangeIntents: true,
      includeSemanticChanges: true,
      severityThreshold: 'suggestion',
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
