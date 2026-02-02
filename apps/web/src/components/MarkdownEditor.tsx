import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useTheme } from '../contexts/ThemeContext';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: number;
  minHeight?: number;
  maxHeight?: number;
  preview?: 'edit' | 'live' | 'preview';
  hideToolbar?: boolean;
  className?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Write your comment here...',
  height = 200,
  minHeight,
  maxHeight,
  preview = 'edit',
  hideToolbar = false,
  className = '',
}: MarkdownEditorProps) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>(preview === 'preview' ? 'preview' : 'write');

  // Calculate effective height
  const effectiveHeight = minHeight || maxHeight || height;

  return (
    <div className={`${className} border border-light-border dark:border-dark-border rounded-md overflow-hidden`}>
      {/* Tabs - only show if not hideToolbar */}
      {!hideToolbar && (
        <div className="flex items-center gap-2 px-3 py-2 bg-light-surface-elevated dark:bg-dark-surface-elevated border-b border-light-border dark:border-dark-border">
          <button
            onClick={() => setActiveTab('write')}
            className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
              activeTab === 'write'
                ? 'bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary'
                : 'text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary'
            }`}
          >
            Write
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
              activeTab === 'preview'
                ? 'bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary'
                : 'text-light-text-muted dark:text-dark-text-muted hover:text-light-text-primary dark:hover:text-dark-text-primary'
            }`}
          >
            Preview
          </button>
        </div>
      )}

      {/* Content */}
      <div className="bg-light-surface dark:bg-dark-surface">
        {activeTab === 'write' || preview === 'edit' ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 text-sm bg-transparent text-light-text-primary dark:text-dark-text-primary resize-none focus:outline-none"
            style={{
              height: `${effectiveHeight}px`,
              minHeight: minHeight ? `${minHeight}px` : undefined,
              maxHeight: maxHeight ? `${maxHeight}px` : undefined,
            }}
          />
        ) : (
          <div
            className="px-3 py-2 text-sm prose prose-sm dark:prose-invert max-w-none overflow-y-auto"
            style={{
              height: `${effectiveHeight}px`,
              minHeight: minHeight ? `${minHeight}px` : undefined,
              maxHeight: maxHeight ? `${maxHeight}px` : undefined,
            }}
          >
            {value ? (
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {value}
              </ReactMarkdown>
            ) : (
              <p className="text-light-text-muted dark:text-dark-text-muted italic">Nothing to preview</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
