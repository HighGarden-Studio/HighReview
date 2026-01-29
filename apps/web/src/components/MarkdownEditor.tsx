import { useTheme } from '../contexts/ThemeContext';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

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

  return (
    <div
      className={className}
      data-color-mode={theme}
      style={{
        minHeight: minHeight ? `${minHeight}px` : undefined,
        maxHeight: maxHeight ? `${maxHeight}px` : undefined,
      }}
    >
      <MDEditor
        value={value}
        onChange={(val) => onChange(val || '')}
        preview={preview}
        height={height}
        hideToolbar={hideToolbar}
        textareaProps={{
          placeholder,
        }}
        commands={[
          // Basic formatting
          'bold',
          'italic',
          'strikethrough',
          'hr',
          'title',
          'divider',
          'link',
          'quote',
          'code',
          'codeBlock',
          'divider',
          'unorderedListCommand',
          'orderedListCommand',
          'checkedListCommand',
          'divider',
          'table',
          'divider',
          'help',
        ]}
        extraCommands={[
          // Add Preview/Edit/Live tabs
        ]}
      />
    </div>
  );
}
