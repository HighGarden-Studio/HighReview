import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { useTheme } from '../contexts/ThemeContext';

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
    labels?: {
      name: string;
      color: string;
      description: string;
    }[];
  };
}

export function PRCard({ pr }: PRCardProps) {
  const navigate = useNavigate();
  const [owner, repo] = pr.repository.split('/');
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  // Check if AI Review exists for this PR via API
  const { data: aiReviewCheck } = useQuery({
    queryKey: ['ai-review-check', owner, repo, pr.number],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/prs/${owner}/${repo}/${pr.number}/ai-review/check`);
        if (!response.ok) {
          console.error('[PRCard] Failed to check AI review:', response.status);
          return { exists: false };
        }
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('[PRCard] Error checking AI review:', error);
        return { exists: false };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  const hasAIReview = aiReviewCheck?.exists || false;

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
        {hasAIReview && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-md bg-gradient-to-r from-purple-500/10 to-blue-500/10 dark:from-purple-400/10 dark:to-blue-400/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 dark:border-purple-400/30" title="AI Review completed">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 7H7v6h6V7z" />
              <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd" />
            </svg>
            AI Reviewed
          </span>
        )}
        {/* Labels */}
        {pr.labels && pr.labels.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {pr.labels.map((label) => (
              <span
                key={label.name}
                className="px-2 py-0.5 text-xs font-bold rounded-full border shadow-sm transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: `#${label.color}20`,
                  borderColor: `#${label.color}40`,
                  color: isDarkMode ? `#${label.color}` : `color-mix(in srgb, #${label.color}, black 20%)`,
                }}
                title={label.description}
              >
                {label.name}
              </span>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary border border-light-border dark:border-dark-border hover:bg-light-border dark:hover:bg-dark-border transition-colors"
            title="View on GitHub"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
            </svg>
            View on GitHub
          </a>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg ${
              pr.state === 'OPEN'
                ? 'bg-light-accent-success/10 dark:bg-dark-accent-success/10 text-light-accent-success dark:text-dark-accent-success border border-light-accent-success/20 dark:border-dark-accent-success/20 shadow-sm'
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
        <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-4 p-3 rounded-lg border border-light-border dark:border-dark-border bg-light-surface-elevated dark:bg-dark-surface-elevated">
          <div className="line-clamp-6 prose prose-sm dark:prose-invert max-w-none overflow-hidden" style={{ lineHeight: '1.4' }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={[rehypeRaw, rehypeSanitize]}
              components={{
                p: ({node, children, ...props}) => {
                  const hasCodeBlock = React.Children.toArray(children).some((child: any) => {
                    return child?.props?.className?.includes('language-');
                  });
                  const Element = hasCodeBlock ? 'div' : 'p';
                  return (
                    <Element className="mb-1 text-light-text-secondary dark:text-dark-text-secondary" style={{ lineHeight: '1.4' }} {...props}>
                      {children}
                    </Element>
                  );
                },
              a: ({node, ...props}) => <a className="text-light-accent-primary dark:text-dark-accent-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
              strong: ({node, ...props}) => <strong className="font-semibold text-light-text-primary dark:text-dark-text-primary" {...props} />,
              em: ({node, ...props}) => <em className="italic" {...props} />,
              code: ({node, inline, ...props}: any) => {
                if (inline) {
                  return (
                    <code className="px-1 py-0.5 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary font-mono text-xs" {...props} />
                  );
                }
                return <code {...props} />;
              },
              ul: ({node, ...props}) => <ul className="list-disc list-inside mb-1 mt-0 text-light-text-secondary dark:text-dark-text-secondary" style={{ marginTop: '0' }} {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-1 mt-0 text-light-text-secondary dark:text-dark-text-secondary" style={{ marginTop: '0' }} {...props} />,
              li: ({node, ...props}) => <li className="text-light-text-secondary dark:text-dark-text-secondary" {...props} />,
              h1: ({node, ...props}) => <span className="font-semibold text-light-text-primary dark:text-dark-text-primary" {...props} />,
              h2: ({node, ...props}) => <span className="font-semibold text-light-text-primary dark:text-dark-text-primary" {...props} />,
              h3: ({node, ...props}) => <span className="font-semibold text-light-text-primary dark:text-dark-text-primary" {...props} />,
              h4: ({node, ...props}) => <span className="font-semibold text-light-text-primary dark:text-dark-text-primary" {...props} />,
              h5: ({node, ...props}) => <span className="font-semibold text-light-text-primary dark:text-dark-text-primary" {...props} />,
              h6: ({node, ...props}) => <span className="font-semibold text-light-text-primary dark:text-dark-text-primary" {...props} />,
            }}
            >
              {pr.body}
            </ReactMarkdown>
          </div>
        </div>
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
        {((pr.commentCount || 0) + (pr.reviewCount || 0)) > 0 && (
          <div className="flex items-center gap-1.5 text-light-text-muted dark:text-dark-text-muted">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">
              {(pr.commentCount || 0) + (pr.reviewCount || 0)}
            </span>
          </div>
        )}

        {/* Created Time */}
        <div className="flex items-center gap-1.5 text-light-text-muted dark:text-dark-text-muted ml-auto">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
          <span className="font-medium text-xs">Created {formatDate(pr.createdAt)}</span>
        </div>

        {/* Updated Time */}
        <div className="flex items-center gap-1.5 text-light-text-muted dark:text-dark-text-muted">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium text-xs">Updated {formatDate(pr.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}
