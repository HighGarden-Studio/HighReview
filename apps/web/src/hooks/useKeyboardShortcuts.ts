import { useEffect } from 'react';

interface KeyboardShortcutsHandlers {
  onNextFile?: () => void;
  onPreviousFile?: () => void;
  onAddComment?: () => void;
  onToggleAIReview?: () => void;
  onSubmitReview?: () => void;
  onFocusSearch?: () => void;
  onShowHelp?: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutsHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs or textareas
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // j - Next file
      if (e.key === 'j' && !cmdOrCtrl && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handlers.onNextFile?.();
      }

      // k - Previous file
      if (e.key === 'k' && !cmdOrCtrl && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handlers.onPreviousFile?.();
      }

      // c - Add comment at cursor
      if (e.key === 'c' && !cmdOrCtrl && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handlers.onAddComment?.();
      }

      // Cmd/Ctrl + / - Toggle AI review panel
      if (e.key === '/' && cmdOrCtrl && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handlers.onToggleAIReview?.();
      }

      // Cmd/Ctrl + Enter - Submit review
      if (e.key === 'Enter' && cmdOrCtrl && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handlers.onSubmitReview?.();
      }

      // f - Focus file search
      if (e.key === 'f' && !cmdOrCtrl && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handlers.onFocusSearch?.();
      }

      // ? - Show shortcuts help
      if (e.key === '?' && !cmdOrCtrl && !e.altKey) {
        e.preventDefault();
        handlers.onShowHelp?.();
      }

      // Esc - Close modals (handled by modal components)
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}

export const KEYBOARD_SHORTCUTS = {
  navigation: [
    { key: 'j', description: 'Next file' },
    { key: 'k', description: 'Previous file' },
    { key: 'f', description: 'Focus file search' },
  ],
  comments: [
    { key: 'c', description: 'Add comment at cursor' },
    { key: 'Cmd/Ctrl + Enter', description: 'Submit review' },
  ],
  panels: [
    { key: 'Cmd/Ctrl + /', description: 'Toggle AI review panel' },
  ],
  general: [
    { key: '?', description: 'Show keyboard shortcuts' },
    { key: 'Esc', description: 'Close modal' },
  ],
};
