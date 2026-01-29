import { useState, useEffect, useRef } from 'react';

export interface MentionSuggestion {
  type: 'file' | 'issue' | 'change' | 'impact' | 'callstack' | 'semantic';
  id: string;
  label: string;
  description?: string;
  icon?: string;
}

interface MentionAutocompleteProps {
  query: string;
  suggestions: MentionSuggestion[];
  onSelect: (suggestion: MentionSuggestion) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

export function MentionAutocomplete({
  query,
  suggestions,
  onSelect,
  onClose,
  position,
}: MentionAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on query
  const filteredSuggestions = query
    ? suggestions.filter(
        (s) =>
          s.label.toLowerCase().includes(query.toLowerCase()) ||
          s.description?.toLowerCase().includes(query.toLowerCase())
      )
    : suggestions;

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, suggestions.length]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredSuggestions.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredSuggestions[selectedIndex]) {
            onSelect(filteredSuggestions[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, filteredSuggestions, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      const selectedElement = container.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (filteredSuggestions.length === 0) {
    return (
      <div
        className="absolute z-50 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-lg p-3"
        style={{ top: position.top, left: position.left }}
      >
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
          No suggestions found
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute z-50 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-lg max-h-64 overflow-y-auto"
      style={{ top: position.top, left: position.left, minWidth: '300px' }}
    >
      {filteredSuggestions.map((suggestion, index) => (
        <button
          key={`${suggestion.type}-${suggestion.id}`}
          type="button"
          onClick={() => onSelect(suggestion)}
          className={`w-full text-left px-3 py-2 hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated transition-colors ${
            index === selectedIndex
              ? 'bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 border-l-2 border-light-accent-primary dark:border-dark-accent-primary'
              : ''
          }`}
        >
          <div className="flex items-start gap-2">
            {/* Icon */}
            <span className="text-base flex-shrink-0 mt-0.5">
              {getTypeIcon(suggestion.type)}
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-secondary dark:text-dark-text-secondary">
                  @{suggestion.type}
                </span>
                <span className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary truncate">
                  {suggestion.label}
                </span>
              </div>
              {suggestion.description && (
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1 line-clamp-2">
                  {suggestion.description}
                </p>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function getTypeIcon(type: MentionSuggestion['type']): string {
  switch (type) {
    case 'file':
      return '📄';
    case 'issue':
      return '🚨';
    case 'change':
      return '🔄';
    case 'impact':
      return '💥';
    case 'callstack':
      return '📊';
    case 'semantic':
      return '🔍';
    default:
      return '📌';
  }
}
