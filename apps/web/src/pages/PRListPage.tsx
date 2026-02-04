import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PRCard } from '../components/PRCard';
import { Scanner } from '../components/Scanner';



export function PRListPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'review-requested' | 'my-repos' | 'authored'>('review-requested');
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [isRepoFilterOpen, setIsRepoFilterOpen] = useState(false);

  const {
    data: reviewRequestedData,
    isLoading: loadingReviewRequested,
    refetch: refetchReviewRequested,
  } = useQuery({
    queryKey: ['prs', 'review-requested'],
    queryFn: async () => {
      const response = await fetch('/api/prs/review-requested');
      if (!response.ok) throw new Error('Failed to fetch PRs');
      return response.json();
    },
    enabled: filter === 'review-requested',
  });

  const {
    data: myReposData,
    isLoading: loadingMyRepos,
    refetch: refetchMyRepos,
  } = useQuery({
    queryKey: ['repositories', 'prs'],
    queryFn: async () => {
      const response = await fetch('/api/repositories/prs');
      if (!response.ok) throw new Error('Failed to fetch repository PRs');
      return response.json();
    },
    enabled: filter === 'my-repos',
  });

  const {
    data: authoredData,
    isLoading: loadingAuthored,
    refetch: refetchAuthored,
  } = useQuery({
    queryKey: ['prs', 'authored'],
    queryFn: async () => {
      const response = await fetch('/api/prs/authored');
      if (!response.ok) throw new Error('Failed to fetch authored PRs');
      return response.json();
    },
    enabled: filter === 'authored',
  });

  useQuery({
    queryKey: ['authStatus'],
    queryFn: async () => {
      const response = await fetch('/api/auth/status');
      if (!response.ok) throw new Error('Failed to check auth status');
      return response.json();
    },
  });

  const handleRefresh = () => {
    if (filter === 'review-requested') {
      refetchReviewRequested();
    } else if (filter === 'my-repos') {
      refetchMyRepos();
    } else {
      refetchAuthored();
    }
  };

  const currentData =
    filter === 'review-requested' ? reviewRequestedData :
    filter === 'my-repos' ? myReposData :
    authoredData;

  const isLoading =
    filter === 'review-requested' ? loadingReviewRequested :
    filter === 'my-repos' ? loadingMyRepos :
    loadingAuthored;

  // Get unique repositories and their counts
  const repositories = currentData?.pullRequests
    ? currentData.pullRequests.reduce((acc: { [key: string]: number }, pr: any) => {
        acc[pr.repository] = (acc[pr.repository] || 0) + 1;
        return acc;
      }, {})
    : {};

  const sortedRepos = Object.entries(repositories).sort((a, b) => (b[1] as number) - (a[1] as number));

  // Filter PRs by selected repository
  const filteredPRs = currentData?.pullRequests.filter((pr: any) =>
    selectedRepo === 'all' || pr.repository === selectedRepo
  ) || [];

  return (
    <div className="h-full overflow-y-auto bg-light-bg dark:bg-dark-bg p-4">
      {/* Main Content */}
      <main className="container mx-auto py-4">
        {/* Filter Tabs */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setFilter('review-requested');
                setSelectedRepo('all');
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'review-requested'
                  ? 'bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 text-light-accent-primary dark:text-dark-accent-primary border border-light-accent-primary/20 dark:border-dark-accent-primary/20'
                  : 'bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated border border-transparent'
              }`}
            >
              Review Requested
              {reviewRequestedData && (
                <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                  filter === 'review-requested'
                    ? 'bg-light-accent-primary/20 dark:bg-dark-accent-primary/20 text-light-accent-primary dark:text-dark-accent-primary'
                    : 'bg-light-surface-elevated dark:bg-dark-surface-elevated'
                }`}>
                  {reviewRequestedData.count}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setFilter('my-repos');
                setSelectedRepo('all');
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'my-repos'
                  ? 'bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 text-light-accent-primary dark:text-dark-accent-primary border border-light-accent-primary/20 dark:border-dark-accent-primary/20'
                  : 'bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated border border-transparent'
              }`}
            >
              My Repositories
              {myReposData && (
                <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                  filter === 'my-repos'
                    ? 'bg-light-accent-primary/20 dark:bg-dark-accent-primary/20 text-light-accent-primary dark:text-dark-accent-primary'
                    : 'bg-light-surface-elevated dark:bg-dark-surface-elevated'
                }`}>
                  {myReposData.count}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setFilter('authored');
                setSelectedRepo('all');
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'authored'
                  ? 'bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 text-light-accent-primary dark:text-dark-accent-primary border border-light-accent-primary/20 dark:border-dark-accent-primary/20'
                  : 'bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated border border-transparent'
              }`}
            >
              My PRs
              {authoredData && (
                <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                  filter === 'authored'
                    ? 'bg-light-accent-primary/20 dark:bg-dark-accent-primary/20 text-light-accent-primary dark:text-dark-accent-primary'
                    : 'bg-light-surface-elevated dark:bg-dark-surface-elevated'
                }`}>
                  {authoredData.count}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Repository Filter */}
            {sortedRepos.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setIsRepoFilterOpen(!isRepoFilterOpen)}
                  className="px-4 py-2 rounded-lg font-medium bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors border border-light-border dark:border-dark-border flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm">
                    {selectedRepo === 'all' ? 'All Repositories' : selectedRepo.split('/').pop()}
                  </span>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border">
                    {selectedRepo === 'all' ? currentData?.count || 0 : repositories[selectedRepo] || 0}
                  </span>
                  <svg className={`w-4 h-4 transition-transform ${isRepoFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isRepoFilterOpen && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsRepoFilterOpen(false)}
                    />

                    {/* Dropdown */}
                    <div className="absolute right-0 mt-2 w-80 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-xl z-20 max-h-96 overflow-y-auto">
                      <div className="p-2">
                        {/* All Repositories Option */}
                        <button
                          onClick={() => {
                            setSelectedRepo('all');
                            setIsRepoFilterOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-md transition-colors flex items-center justify-between ${
                            selectedRepo === 'all'
                              ? 'bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 text-light-accent-primary dark:text-dark-accent-primary'
                              : 'text-light-text-primary dark:text-dark-text-primary hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                            </svg>
                            <span className="font-medium text-sm">All Repositories</span>
                          </div>
                          <span className={`px-2 py-0.5 text-xs rounded-full font-semibold ${
                            selectedRepo === 'all'
                              ? 'bg-light-accent-primary/20 dark:bg-dark-accent-primary/20'
                              : 'bg-light-surface-elevated dark:bg-dark-surface-elevated'
                          }`}>
                            {currentData?.count || 0}
                          </span>
                        </button>

                        {/* Separator */}
                        <div className="my-2 border-t border-light-border dark:border-dark-border" />

                        {/* Individual Repositories */}
                        {sortedRepos.map(([repo, count]) => (
                          <button
                            key={repo}
                            onClick={() => {
                              setSelectedRepo(repo);
                              setIsRepoFilterOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-md transition-colors flex items-center justify-between ${
                              selectedRepo === repo
                                ? 'bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 text-light-accent-primary dark:text-dark-accent-primary'
                                : 'text-light-text-primary dark:text-dark-text-primary hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                              </svg>
                              <span className="font-medium text-sm truncate">{repo}</span>
                            </div>
                            <span className={`px-2 py-0.5 text-xs rounded-full font-semibold flex-shrink-0 ml-2 ${
                              selectedRepo === repo
                                ? 'bg-light-accent-primary/20 dark:bg-dark-accent-primary/20'
                                : 'bg-light-surface-elevated dark:bg-dark-surface-elevated'
                            }`}>
                              {count as any}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg font-medium bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors disabled:opacity-50 border border-light-border dark:border-dark-border"
            >
              <svg
                className={`w-4 h-4 inline-block mr-2 ${isLoading ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* PR List */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Scanner 
              label="Loading pull requests..." 
            />
          </div>
        ) : filteredPRs.length > 0 ? (

          <div className="space-y-4">
            {filteredPRs.map((pr: any) => (
              <PRCard key={`${pr.repository}-${pr.number}`} pr={pr} />
            ))}
          </div>
        ) : currentData && currentData.pullRequests.length > 0 ? (
          <div className="bg-light-surface dark:bg-dark-surface rounded-lg border border-light-border dark:border-dark-border p-12 text-center">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-light-text-muted dark:text-dark-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
              />
            </svg>
            <h3 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
              No pull requests in this repository
            </h3>
            <p className="text-light-text-secondary dark:text-dark-text-secondary mb-4">
              Try selecting a different repository from the filter.
            </p>
            <button
              onClick={() => setSelectedRepo('all')}
              className="px-4 py-2 bg-light-accent-primary dark:bg-dark-accent-primary text-white rounded-lg font-medium hover:shadow-lg transition-all"
            >
              Show All Repositories
            </button>
          </div>
        ) : (
          <div className="bg-light-surface dark:bg-dark-surface rounded-lg border border-light-border dark:border-dark-border p-12 text-center">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-light-text-muted dark:text-dark-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
              No pull requests found
            </h3>
            <p className="text-light-text-secondary dark:text-dark-text-secondary">
              {filter === 'review-requested'
                ? 'You have no pending review requests.'
                : filter === 'my-repos'
                  ? 'No open pull requests in your configured repositories. Add repositories in Settings.'
                  : 'You have not created any open pull requests.'}
            </p>
            {filter === 'my-repos' && (
              <button
                onClick={() => navigate('/settings')}
                className="mt-4 px-4 py-2 bg-light-accent-primary dark:bg-dark-accent-primary text-white rounded-lg font-medium hover:shadow-lg transition-all"
              >
                Go to Settings
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
