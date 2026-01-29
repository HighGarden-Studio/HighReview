import { useNavigate } from 'react-router-dom';

interface PRCardProps {
  pr: {
    number: number;
    title: string;
    body: string;
    state: string;
    author: string;
    url: string;
    repository: string;
    repositoryUrl: string;
    headRefName: string;
    baseRefName: string;
    createdAt: string;
    updatedAt: string;
    commentCount?: number;
    reviewCount?: number;
    fileCount?: number;
  };
}

export function PRCard({ pr }: PRCardProps) {
  const navigate = useNavigate();
  const [owner, repo] = pr.repository.split('/');

  const handleClick = () => {
    navigate(`/prs/${owner}/${repo}/${pr.number}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      onClick={handleClick}
      className="bg-light-surface dark:bg-dark-surface border-2 border-light-border dark:border-dark-border rounded-xl p-5 hover:border-light-accent-primary dark:hover:border-dark-accent-primary hover:shadow-lg transition-all cursor-pointer group"
    >
      {/* Header with Repository and PR Number */}
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-light-text-muted dark:text-dark-text-muted flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
        </svg>
        <span className="text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">
          {pr.repository}
        </span>
        <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-muted dark:text-dark-text-muted border border-light-border dark:border-dark-border">
          #{pr.number}
        </span>
        <div className="ml-auto">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg ${
              pr.state === 'OPEN'
                ? 'bg-light-accent-success dark:bg-dark-accent-success text-white shadow-sm'
                : 'bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-muted dark:text-dark-text-muted border border-light-border dark:border-dark-border'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              {pr.state === 'OPEN' ? (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 9.293 8.707 8.707a1 1 0 000-1.414z" clipRule="evenodd" />
              )}
            </svg>
            {pr.state === 'OPEN' ? 'Open' : 'Closed'}
          </span>
        </div>
      </div>

      {/* PR Title */}
      <h3 className="text-lg font-bold text-light-text-primary dark:text-dark-text-primary group-hover:text-light-accent-primary dark:group-hover:text-dark-accent-primary mb-3 transition-colors">
        {pr.title}
      </h3>

      {/* PR Body Preview */}
      {pr.body && (
        <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4 line-clamp-2">
          {pr.body}
        </p>
      )}

      {/* Metadata Row */}
      <div className="flex items-center flex-wrap gap-3 text-sm">
        {/* Author */}
        <div className="flex items-center gap-1.5 text-light-text-muted dark:text-dark-text-muted">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
          <span className="font-medium">{pr.author}</span>
        </div>

        {/* Branch Arrow */}
        <svg className="w-4 h-4 text-light-text-muted dark:text-dark-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        {/* Branches with Tags */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 text-light-accent-primary dark:text-dark-accent-primary border border-light-accent-primary/20 dark:border-dark-accent-primary/20">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            {pr.headRefName}
          </span>
          <svg className="w-3.5 h-3.5 text-light-text-muted dark:text-dark-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-light-accent-secondary/10 dark:bg-dark-accent-secondary/10 text-light-accent-secondary dark:text-dark-accent-secondary border border-light-accent-secondary/20 dark:border-dark-accent-secondary/20">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
            </svg>
            {pr.baseRefName}
          </span>
        </div>

        {/* File Count */}
        {pr.fileCount !== undefined && (
          <div className="flex items-center gap-1.5 text-light-text-muted dark:text-dark-text-muted">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">
              {pr.fileCount} {pr.fileCount === 1 ? 'file' : 'files'}
            </span>
          </div>
        )}

        {/* Comment Count */}
        {(pr.commentCount !== undefined || pr.reviewCount !== undefined) && (
          <div className="flex items-center gap-1.5 text-light-text-muted dark:text-dark-text-muted">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">
              {(pr.commentCount || 0) + (pr.reviewCount || 0)}
            </span>
          </div>
        )}

        {/* Updated Time */}
        <div className="flex items-center gap-1.5 text-light-text-muted dark:text-dark-text-muted ml-auto">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">{formatDate(pr.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}
