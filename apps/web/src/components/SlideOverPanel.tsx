import { useEffect, useState, useRef } from 'react';

interface SlideOverPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  resizable?: boolean;
  defaultWidth?: number; // Percentage of viewport width (0-100)
}

export function SlideOverPanel({
  isOpen,
  onClose,
  title,
  children,
  width = 'xl',
  resizable = false,
  defaultWidth = 60,
}: SlideOverPanelProps) {
  const [panelWidth, setPanelWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle resize
  useEffect(() => {
    if (!resizable || !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const viewportWidth = window.innerWidth;
      const distanceFromRight = viewportWidth - e.clientX;
      const newWidth = (distanceFromRight / viewportWidth) * 100;

      // Constrain between 30% and 90%
      const constrainedWidth = Math.max(30, Math.min(90, newWidth));
      setPanelWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizable]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  if (!isOpen) return null;

  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
        onClick={onClose}
        style={{ animation: isOpen ? 'fadeIn 0.3s' : 'fadeOut 0.3s' }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed inset-y-0 right-0 ${resizable ? '' : `${widthClasses[width]} w-full`} bg-light-surface dark:bg-dark-surface shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out`}
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          ...(resizable && { width: `${panelWidth}%` }),
        }}
      >
        {/* Resize Handle */}
        {resizable && (
          <div
            onMouseDown={handleResizeStart}
            className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-light-accent-primary dark:hover:bg-dark-accent-primary transition-colors group"
            style={{ marginLeft: '-2px' }}
          >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-12 rounded-full bg-light-border dark:bg-dark-border group-hover:bg-light-accent-primary dark:group-hover:bg-dark-accent-primary transition-colors" />
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-light-border dark:border-dark-border bg-gradient-to-r from-light-accent-primary to-light-accent-secondary dark:from-dark-accent-primary dark:to-dark-accent-secondary">
          <h2 className="text-lg font-semibold text-white">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-white"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `}</style>
    </>
  );
}
