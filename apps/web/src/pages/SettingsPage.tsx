import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AIProviderSelector } from '../components/AIProviderSelector';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageSelector } from '../components/LanguageSelector';

interface AIReviewOptions {
  includeContext: boolean;
  contextScope: 'callers' | 'implementations' | 'both';
  analyzeChangeIntent: boolean;
  changeIntentLevel: 'file' | 'block' | 'both';
  generateCallStack: boolean;
  callStackFormat: 'flowchart' | 'sequence' | 'both';
  analyzeBroaderImpact: boolean;
  impactScope: 'module' | 'project' | 'dependencies';
  useSemanticDiff: boolean;
  detectMovedCode: boolean;
  detectRefactoring: boolean;
  ignoreWhitespace: boolean;
  ignoreComments: boolean;
  customPrompt: string;
}

interface Repository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  cronSchedule?: string;
  autoReview: boolean;
  aiReviewOptions?: AIReviewOptions;
}

export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'ai' | 'repos' | 'cron' | 'history'>('ai');
  const [newRepoOwner, setNewRepoOwner] = useState('');
  const [newRepoName, setNewRepoName] = useState('');
  const [expandedRepoOptions, setExpandedRepoOptions] = useState<number | null>(null);
  const [editingOptions, setEditingOptions] = useState<Record<number, AIReviewOptions>>({});

  // Default AI review options
  const defaultAIOptions: AIReviewOptions = {
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

  // Fetch repositories
  const { data: repositories, isLoading: reposLoading } = useQuery({
    queryKey: ['repositories'],
    queryFn: async () => {
      const response = await fetch('/api/repositories');
      if (!response.ok) throw new Error('Failed to fetch repositories');
      return response.json();
    },
  });

  // Fetch auto review history
  const { data: reviewHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['review-history'],
    queryFn: async () => {
      const response = await fetch('/api/auto-review/history');
      if (!response.ok) throw new Error('Failed to fetch review history');
      return response.json();
    },
    enabled: activeTab === 'history',
  });

  // Add repository
  const addRepository = useMutation({
    mutationFn: async (repo: { owner: string; name: string }) => {
      const response = await fetch('/api/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(repo),
      });
      if (!response.ok) throw new Error('Failed to add repository');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
      toast.success('Repository added successfully');
      setNewRepoOwner('');
      setNewRepoName('');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add repository: ${error.message}`);
    },
  });

  // Remove repository
  const removeRepository = useMutation({
    mutationFn: async (repoId: string) => {
      const response = await fetch(`/api/repositories/${repoId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to remove repository');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
      toast.success('Repository removed successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove repository: ${error.message}`);
    },
  });

  // Update cron schedule
  const updateCronSchedule = useMutation({
    mutationFn: async ({ repoId, schedule, autoReview }: { repoId: string; schedule: string; autoReview: boolean }) => {
      const response = await fetch(`/api/repositories/${repoId}/cron`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule, autoReview }),
      });
      if (!response.ok) throw new Error('Failed to update cron schedule');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
      toast.success('Cron schedule updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update cron schedule: ${error.message}`);
    },
  });

  // Update AI review options
  const updateAIReviewOptions = useMutation({
    mutationFn: async ({ repoId, options }: { repoId: string; options: AIReviewOptions }) => {
      const response = await fetch(`/api/repositories/${repoId}/ai-options`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiReviewOptions: options }),
      });
      if (!response.ok) throw new Error('Failed to update AI review options');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
      toast.success('AI review options saved successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save AI review options: ${error.message}`);
    },
  });



  const handleAddRepository = () => {
    if (!newRepoOwner.trim() || !newRepoName.trim()) {
      toast.error('Please enter both owner and repository name');
      return;
    }
    addRepository.mutate({ owner: newRepoOwner.trim(), name: newRepoName.trim() });
  };



  const toggleRepoOptions = (repoId: number, repo: Repository) => {
    if (expandedRepoOptions === repoId) {
      setExpandedRepoOptions(null);
    } else {
      setExpandedRepoOptions(repoId);
      // Initialize with existing options or defaults
      setEditingOptions({
        ...editingOptions,
        [repoId]: repo.aiReviewOptions || defaultAIOptions,
      });
    }
  };

  const updateRepoOption = <K extends keyof AIReviewOptions>(
    repoId: number,
    key: K,
    value: AIReviewOptions[K]
  ) => {
    setEditingOptions({
      ...editingOptions,
      [repoId]: {
        ...(editingOptions[repoId] || defaultAIOptions),
        [key]: value,
      },
    });
  };

  const saveRepoOptions = (repoId: string) => {
    const repoIdNum = parseInt(repoId);
    const options = editingOptions[repoIdNum];
    if (options) {
      updateAIReviewOptions.mutate({ repoId, options });
      setExpandedRepoOptions(null);
    }
  };

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg">
      {/* Header */}
      <header className="border-b border-light-border dark:border-dark-border bg-light-surface/80 dark:bg-dark-surface/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-lg hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors"
              title="Back to home"
            >
              <svg className="w-5 h-5 text-light-text-primary dark:text-dark-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary">
                Settings
              </h1>
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                Configure HighReview preferences
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSelector />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-light-border dark:border-dark-border">
            <button
              onClick={() => setActiveTab('ai')}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === 'ai'
                  ? 'border-light-accent-primary dark:border-dark-accent-primary text-light-accent-primary dark:text-dark-accent-primary'
                  : 'border-transparent text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary'
              }`}
            >
              AI Provider
            </button>
            <button
              onClick={() => setActiveTab('repos')}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === 'repos'
                  ? 'border-light-accent-primary dark:border-dark-accent-primary text-light-accent-primary dark:text-dark-accent-primary'
                  : 'border-transparent text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary'
              }`}
            >
              Repositories
            </button>
            <button
              onClick={() => setActiveTab('cron')}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === 'cron'
                  ? 'border-light-accent-primary dark:border-dark-accent-primary text-light-accent-primary dark:text-dark-accent-primary'
                  : 'border-transparent text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary'
              }`}
            >
              Auto Review
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === 'history'
                  ? 'border-light-accent-primary dark:border-dark-accent-primary text-light-accent-primary dark:text-dark-accent-primary'
                  : 'border-transparent text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary'
              }`}
            >
              History
            </button>
          </div>

          {/* AI Provider Tab */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              <div className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-xl p-6">
                <h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
                  AI Provider Configuration
                </h2>
                <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-6">
                  Select the AI provider to use for code review and analysis.
                </p>
                <AIProviderSelector
                  onProviderSelected={(providerId) => {
                    console.log('[Settings] Provider selected:', providerId);
                    toast.success('AI Provider updated successfully');
                  }}
                />
              </div>
            </div>
          )}

          {/* Repositories Tab */}
          {activeTab === 'repos' && (
            <div className="space-y-6">
              {/* Add Repository */}
              <div className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-xl p-6">
                <h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
                  Add Repository
                </h2>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newRepoOwner}
                    onChange={(e) => setNewRepoOwner(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddRepository()}
                    placeholder="Owner (e.g., octocat)"
                    className="flex-1 px-4 py-2 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary placeholder-light-text-muted dark:placeholder-dark-text-muted focus:outline-none focus:ring-2 focus:ring-light-accent-primary dark:focus:ring-dark-accent-primary"
                  />
                  <input
                    type="text"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddRepository()}
                    placeholder="Repository (e.g., hello-world)"
                    className="flex-1 px-4 py-2 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary placeholder-light-text-muted dark:placeholder-dark-text-muted focus:outline-none focus:ring-2 focus:ring-light-accent-primary dark:focus:ring-dark-accent-primary"
                  />
                  <button
                    onClick={handleAddRepository}
                    disabled={addRepository.isPending || !newRepoOwner.trim() || !newRepoName.trim()}
                    className="px-6 py-2 bg-light-accent-primary dark:bg-dark-accent-primary text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addRepository.isPending ? 'Adding...' : 'Add'}
                  </button>
                </div>
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-2">
                  Add a GitHub repository to monitor for pull requests
                </p>
              </div>

              {/* Repository List */}
              <div className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-xl p-6">
                <h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
                  Managed Repositories
                </h2>
                {reposLoading ? (
                  <div className="text-center py-8 text-light-text-muted dark:text-dark-text-muted">
                    Loading repositories...
                  </div>
                ) : repositories && repositories.length > 0 ? (
                  <div className="space-y-3">
                    {repositories.map((repo: Repository) => (
                      <div
                        key={repo.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border"
                      >
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-light-text-muted dark:text-dark-text-muted" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 0C4.477 0 0 4.477 0 10c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0110 4.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C17.137 18.165 20 14.418 20 10c0-5.523-4.477-10-10-10z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                              {repo.fullName}
                            </div>
                            {repo.cronSchedule && (
                              <div className="text-xs text-light-text-muted dark:text-dark-text-muted">
                                Schedule: {repo.cronSchedule}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => removeRepository.mutate(repo.id)}
                          disabled={removeRepository.isPending}
                          className="px-3 py-1.5 text-sm text-light-accent-error dark:text-dark-accent-error hover:bg-light-accent-error/10 dark:hover:bg-dark-accent-error/10 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-light-text-muted dark:text-dark-text-muted">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p>No repositories added yet</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cron Schedule Tab */}
          {activeTab === 'cron' && (
            <div className="space-y-6">
              <div className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-xl p-6">
                <h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
                  Automated Review Schedule
                </h2>
                <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-6">
                  Configure automatic AI review schedules for your repositories. Reviews will run at the specified times to check for new PRs.
                </p>

                {reposLoading ? (
                  <div className="text-center py-8 text-light-text-muted dark:text-dark-text-muted">
                    Loading repositories...
                  </div>
                ) : repositories && repositories.length > 0 ? (
                  <div className="space-y-4">
                    {repositories.map((repo: Repository) => {
                      const repoOptions = editingOptions[repo.id] || repo.aiReviewOptions || defaultAIOptions;
                      const isExpanded = expandedRepoOptions === repo.id;

                      return (
                        <div
                          key={repo.id}
                          className="p-4 rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <svg className="w-5 h-5 text-light-text-muted dark:text-dark-text-muted" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 0C4.477 0 0 4.477 0 10c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0110 4.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C17.137 18.165 20 14.418 20 10c0-5.523-4.477-10-10-10z" clipRule="evenodd" />
                              </svg>
                              <div>
                                <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
                                  {repo.fullName}
                                </div>
                              </div>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={repo.autoReview}
                                onChange={(e) => {
                                  updateCronSchedule.mutate({
                                    repoId: repo.id,
                                    schedule: repo.cronSchedule || '0 9 * * *',
                                    autoReview: e.target.checked,
                                  });
                                }}
                                className="rounded"
                              />
                              <span className="text-sm text-light-text-primary dark:text-dark-text-primary">
                                Enabled
                              </span>
                            </label>
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="text"
                              placeholder="0 9 * * * (Every day at 9:00 AM)"
                              defaultValue={repo.cronSchedule || ''}
                              onBlur={(e) => {
                                if (e.target.value !== repo.cronSchedule) {
                                  updateCronSchedule.mutate({
                                    repoId: repo.id,
                                    schedule: e.target.value,
                                    autoReview: repo.autoReview,
                                  });
                                }
                              }}
                              disabled={!repo.autoReview}
                              className="flex-1 px-3 py-2 text-sm rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary placeholder-light-text-muted dark:placeholder-dark-text-muted focus:outline-none focus:ring-2 focus:ring-light-accent-primary dark:focus:ring-dark-accent-primary disabled:opacity-50"
                            />
                          </div>
                          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-2">
                            Cron format: minute hour day month weekday (e.g., "0 9 * * *" for daily at 9:00 AM)
                          </p>

                          {/* AI Review Options */}
                          <div className="mt-3 pt-3 border-t border-light-border dark:border-dark-border">
                            <button
                              onClick={() => toggleRepoOptions(repo.id, repo)}
                              className="flex items-center gap-2 text-sm font-medium text-light-accent-primary dark:text-dark-accent-primary hover:opacity-80 transition-opacity"
                            >
                              <svg
                                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              AI Review Options {repo.aiReviewOptions ? '(Configured)' : '(Default)'}
                            </button>

                            {isExpanded && (
                              <div className="mt-4 space-y-4 p-4 bg-light-surface dark:bg-dark-surface rounded-lg border border-light-border dark:border-dark-border">
                                {/* Context-Aware Review */}
                                <div className="space-y-2">
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={repoOptions.includeContext}
                                      onChange={(e) => updateRepoOption(repo.id, 'includeContext', e.target.checked)}
                                      className="w-4 h-4 rounded"
                                    />
                                    <span className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">
                                      🧠 Context-Aware Review (Tree-sitter-based)
                                    </span>
                                  </label>
                                  <p className="text-xs text-light-text-muted dark:text-dark-text-muted ml-6">
                                    Uses Tree-sitter static analysis to find callers and implementations of modified code. Context files are analyzed for impact only, not reviewed for code quality.
                                  </p>
                                  {repoOptions.includeContext && (
                                    <div className="ml-6 space-y-1">
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          checked={repoOptions.contextScope === 'callers'}
                                          onChange={() => updateRepoOption(repo.id, 'contextScope', 'callers')}
                                          className="w-3 h-3"
                                        />
                                        <span className="text-xs text-light-text-muted dark:text-dark-text-muted">Callers only</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          checked={repoOptions.contextScope === 'implementations'}
                                          onChange={() => updateRepoOption(repo.id, 'contextScope', 'implementations')}
                                          className="w-3 h-3"
                                        />
                                        <span className="text-xs text-light-text-muted dark:text-dark-text-muted">Implementations only</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          checked={repoOptions.contextScope === 'both'}
                                          onChange={() => updateRepoOption(repo.id, 'contextScope', 'both')}
                                          className="w-3 h-3"
                                        />
                                        <span className="text-xs text-light-text-muted dark:text-dark-text-muted">Both callers and implementations</span>
                                      </label>
                                    </div>
                                  )}
                                </div>

                                {/* Change Intent Analysis */}
                                <div className="space-y-2">
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={repoOptions.analyzeChangeIntent}
                                      onChange={(e) => updateRepoOption(repo.id, 'analyzeChangeIntent', e.target.checked)}
                                      className="w-4 h-4 rounded"
                                    />
                                    <span className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">
                                      🎯 Analyze change intent and display on diff view
                                    </span>
                                  </label>
                                  {repoOptions.analyzeChangeIntent && (
                                    <div className="ml-6 space-y-1">
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          checked={repoOptions.changeIntentLevel === 'file'}
                                          onChange={() => updateRepoOption(repo.id, 'changeIntentLevel', 'file')}
                                          className="w-3 h-3"
                                        />
                                        <span className="text-xs text-light-text-muted dark:text-dark-text-muted">File level only</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          checked={repoOptions.changeIntentLevel === 'block'}
                                          onChange={() => updateRepoOption(repo.id, 'changeIntentLevel', 'block')}
                                          className="w-3 h-3"
                                        />
                                        <span className="text-xs text-light-text-muted dark:text-dark-text-muted">Code block level only</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          checked={repoOptions.changeIntentLevel === 'both'}
                                          onChange={() => updateRepoOption(repo.id, 'changeIntentLevel', 'both')}
                                          className="w-3 h-3"
                                        />
                                        <span className="text-xs text-light-text-muted dark:text-dark-text-muted">Both file and code block level</span>
                                      </label>
                                    </div>
                                  )}
                                </div>

                                {/* Call Stack Visualization */}
                                <div className="space-y-2">
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={repoOptions.generateCallStack}
                                      onChange={(e) => updateRepoOption(repo.id, 'generateCallStack', e.target.checked)}
                                      className="w-4 h-4 rounded"
                                    />
                                    <span className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">
                                      📊 Generate call stack visualization
                                    </span>
                                  </label>
                                  {repoOptions.generateCallStack && (
                                    <div className="ml-6 space-y-1">
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          checked={repoOptions.callStackFormat === 'flowchart'}
                                          onChange={() => updateRepoOption(repo.id, 'callStackFormat', 'flowchart')}
                                          className="w-3 h-3"
                                        />
                                        <span className="text-xs text-light-text-muted dark:text-dark-text-muted">Flowchart only</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          checked={repoOptions.callStackFormat === 'sequence'}
                                          onChange={() => updateRepoOption(repo.id, 'callStackFormat', 'sequence')}
                                          className="w-3 h-3"
                                        />
                                        <span className="text-xs text-light-text-muted dark:text-dark-text-muted">Sequence diagram only</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          checked={repoOptions.callStackFormat === 'both'}
                                          onChange={() => updateRepoOption(repo.id, 'callStackFormat', 'both')}
                                          className="w-3 h-3"
                                        />
                                        <span className="text-xs text-light-text-muted dark:text-dark-text-muted">Both flowchart and sequence</span>
                                      </label>
                                    </div>
                                  )}
                                </div>

                                {/* Impact Analysis */}
                                <div className="space-y-2">
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={repoOptions.analyzeBroaderImpact}
                                      onChange={(e) => updateRepoOption(repo.id, 'analyzeBroaderImpact', e.target.checked)}
                                      className="w-4 h-4 rounded"
                                    />
                                    <span className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">
                                      🔍 Analyze impact beyond modified code
                                    </span>
                                  </label>
                                  {repoOptions.analyzeBroaderImpact && (
                                    <div className="ml-6 space-y-1">
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          checked={repoOptions.impactScope === 'module'}
                                          onChange={() => updateRepoOption(repo.id, 'impactScope', 'module')}
                                          className="w-3 h-3"
                                        />
                                        <span className="text-xs text-light-text-muted dark:text-dark-text-muted">Current module/package only</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          checked={repoOptions.impactScope === 'project'}
                                          onChange={() => updateRepoOption(repo.id, 'impactScope', 'project')}
                                          className="w-3 h-3"
                                        />
                                        <span className="text-xs text-light-text-muted dark:text-dark-text-muted">Entire project</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          checked={repoOptions.impactScope === 'dependencies'}
                                          onChange={() => updateRepoOption(repo.id, 'impactScope', 'dependencies')}
                                          className="w-3 h-3"
                                        />
                                        <span className="text-xs text-light-text-muted dark:text-dark-text-muted">Project + dependencies</span>
                                      </label>
                                    </div>
                                  )}
                                </div>

                                {/* Semantic Diff Features */}
                                <div className="space-y-2">
                                  <div className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-2">
                                    ✨ Semantic Diff Features
                                  </div>
                                  <label className="flex items-center gap-2 ml-6">
                                    <input
                                      type="checkbox"
                                      checked={repoOptions.useSemanticDiff}
                                      onChange={(e) => updateRepoOption(repo.id, 'useSemanticDiff', e.target.checked)}
                                      className="w-4 h-4 rounded"
                                    />
                                    <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                      Use language-aware semantic diff
                                    </span>
                                  </label>
                                  <label className="flex items-center gap-2 ml-6">
                                    <input
                                      type="checkbox"
                                      checked={repoOptions.detectMovedCode}
                                      onChange={(e) => updateRepoOption(repo.id, 'detectMovedCode', e.target.checked)}
                                      className="w-4 h-4 rounded"
                                    />
                                    <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                      Detect moved code blocks
                                    </span>
                                  </label>
                                  <label className="flex items-center gap-2 ml-6">
                                    <input
                                      type="checkbox"
                                      checked={repoOptions.detectRefactoring}
                                      onChange={(e) => updateRepoOption(repo.id, 'detectRefactoring', e.target.checked)}
                                      className="w-4 h-4 rounded"
                                    />
                                    <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                      Detect refactoring patterns
                                    </span>
                                  </label>
                                  <label className="flex items-center gap-2 ml-6">
                                    <input
                                      type="checkbox"
                                      checked={repoOptions.ignoreWhitespace}
                                      onChange={(e) => updateRepoOption(repo.id, 'ignoreWhitespace', e.target.checked)}
                                      className="w-4 h-4 rounded"
                                    />
                                    <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                      Ignore whitespace changes
                                    </span>
                                  </label>
                                  <label className="flex items-center gap-2 ml-6">
                                    <input
                                      type="checkbox"
                                      checked={repoOptions.ignoreComments}
                                      onChange={(e) => updateRepoOption(repo.id, 'ignoreComments', e.target.checked)}
                                      className="w-4 h-4 rounded"
                                    />
                                    <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                                      Ignore comment-only changes
                                    </span>
                                  </label>
                                </div>

                                {/* Custom Prompt */}
                                <div className="space-y-2">
                                  <div className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">
                                    💬 Custom Prompt
                                  </div>
                                  <textarea
                                    value={repoOptions.customPrompt}
                                    onChange={(e) => updateRepoOption(repo.id, 'customPrompt', e.target.value)}
                                    placeholder="Enter additional instructions for AI review (optional)..."
                                    className="w-full h-20 px-3 py-2 text-sm bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg text-light-text-primary dark:text-dark-text-primary placeholder-light-text-muted dark:placeholder-dark-text-muted focus:outline-none focus:ring-2 focus:ring-light-accent-primary dark:focus:ring-dark-accent-primary resize-none"
                                  />
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center justify-end gap-2 pt-2">
                                  <button
                                    onClick={() => {
                                      setEditingOptions({
                                        ...editingOptions,
                                        [repo.id]: defaultAIOptions,
                                      });
                                    }}
                                    className="px-3 py-1.5 text-sm text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary transition-colors"
                                  >
                                    Reset to Defaults
                                  </button>
                                  <button
                                    onClick={() => setExpandedRepoOptions(null)}
                                    className="px-4 py-1.5 text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated rounded-lg transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => saveRepoOptions(repo.id)}
                                    className="px-4 py-1.5 text-sm font-medium bg-light-accent-primary dark:bg-dark-accent-primary text-white rounded-lg hover:opacity-90 transition-opacity"
                                  >
                                    Save Options
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-light-text-muted dark:text-dark-text-muted">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p>Add repositories first to configure automated reviews</p>
                  </div>
                )}

                <div className="mt-6 p-4 rounded-lg bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 border border-light-accent-primary/20 dark:border-dark-accent-primary/20">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-light-accent-primary dark:text-dark-accent-primary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-light-text-primary dark:text-dark-text-primary">
                      <p className="font-medium mb-1">About Automated Reviews</p>
                      <p className="text-light-text-muted dark:text-dark-text-muted">
                        When enabled, HighReview will automatically check for new pull requests at the scheduled times and run AI code reviews. You'll receive notifications when reviews are complete.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}



          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              <div className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-xl p-6">
                <h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
                  Auto Review History
                </h2>
                <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-6">
                  View the history of automatic PR reviews performed by the system
                </p>

                {historyLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : !reviewHistory || reviewHistory.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="flex flex-col items-center text-light-text-muted dark:text-dark-text-muted">
                      <p className="text-lg mb-2">No review history yet</p>
                      <p className="text-sm">Auto reviews will appear here once executed</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviewHistory.map((item: any) => {
                      // Parse JSON strings from database
                      const parsedOptions = item.options ? JSON.parse(item.options) : {};
                      const parsedFiles = item.filesReviewed ? JSON.parse(item.filesReviewed) : [];

                      return (
                        <div
                          key={item.id}
                          className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-xl p-6 hover:shadow-lg transition-shadow"
                        >
                          {/* Header */}
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-base font-semibold text-light-text-primary dark:text-dark-text-primary">
                                  {item.owner}/{item.repo} #{item.prNumber}
                                </h3>
                                <span
                                  className={`px-2 py-1 text-xs font-medium rounded ${
                                    item.status === 'success'
                                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                      : item.status === 'failed'
                                      ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                      : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                                  }`}
                                >
                                  {item.status}
                                </span>
                              </div>
                              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-1">
                                {item.prTitle}
                              </p>
                              <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                                {new Date(item.executedAt).toLocaleString()}
                              </p>
                            </div>
                          </div>

                          {/* Options Summary */}
                          {Object.keys(parsedOptions).length > 0 && (
                            <div className="mb-3 p-3 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg">
                              <h4 className="text-xs font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
                                Review Options:
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {parsedOptions.includeContext && (
                                  <span className="px-2 py-1 text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded">
                                    Context-Aware ({parsedOptions.contextScope || 'both'})
                                  </span>
                                )}
                                {parsedOptions.analyzeChangeIntent && (
                                  <span className="px-2 py-1 text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded">
                                    Change Intent ({parsedOptions.changeIntentLevel || 'detailed'})
                                  </span>
                                )}
                                {parsedOptions.generateCallStack && (
                                  <span className="px-2 py-1 text-xs bg-green-500/10 text-green-600 dark:text-green-400 rounded">
                                    Call Stack ({parsedOptions.callStackFormat || 'tree'})
                                  </span>
                                )}
                                {parsedOptions.useSemanticDiff && (
                                  <span className="px-2 py-1 text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded">
                                    Semantic Diff
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Files Reviewed */}
                          {parsedFiles && parsedFiles.length > 0 && (
                            <div className="mb-3">
                              <h4 className="text-xs font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
                                Files Reviewed ({parsedFiles.length}):
                              </h4>
                              <div className="flex flex-wrap gap-1">
                                {parsedFiles.slice(0, 5).map((file: string, idx: number) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-1 text-xs bg-light-surface dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary rounded font-mono"
                                  >
                                    {file.split('/').pop()}
                                  </span>
                                ))}
                                {parsedFiles.length > 5 && (
                                  <span className="px-2 py-1 text-xs text-light-text-muted dark:text-dark-text-muted">
                                    +{parsedFiles.length - 5} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Review Summary */}
                          {item.summary && (
                            <div className="p-3 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg">
                              <h4 className="text-xs font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
                                AI Review Summary:
                              </h4>
                              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary leading-relaxed">
                                {item.summary}
                              </p>
                              <div className="mt-2 flex items-center gap-4 text-xs">
                                {item.criticalCount > 0 && (
                                  <span className="text-red-600 dark:text-red-400">
                                    🚨 {item.criticalCount} Critical
                                  </span>
                                )}
                                {item.warningCount > 0 && (
                                  <span className="text-yellow-600 dark:text-yellow-400">
                                    ⚠️ {item.warningCount} Warnings
                                  </span>
                                )}
                                {item.suggestionCount > 0 && (
                                  <span className="text-blue-600 dark:text-blue-400">
                                    💡 {item.suggestionCount} Suggestions
                                  </span>
                                )}
                                {item.issueCount > 0 && (
                                  <span className="text-light-text-muted dark:text-dark-text-muted">
                                    Total: {item.issueCount} issues
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Error Message (for failed reviews) */}
                          {item.error && (
                            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                              <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">
                                Error Details:
                              </h4>
                              <p className="text-xs text-red-600 dark:text-red-400 font-mono">
                                {item.error}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>


    </div>
  );
}
