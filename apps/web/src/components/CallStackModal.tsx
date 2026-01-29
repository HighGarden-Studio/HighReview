import { useState } from 'react';
import { CallStackVisualization } from './CallStackVisualization';

interface CallStackInfo {
  function: string;
  file: string;
  flowchart?: string;
  sequence?: string;
}

interface CallStackModalProps {
  callStack: CallStackInfo;
  onClose: () => void;
}

export function CallStackModal({ callStack, onClose }: CallStackModalProps) {
  const [activeTab, setActiveTab] = useState<'flowchart' | 'sequence'>(
    callStack.flowchart ? 'flowchart' : 'sequence'
  );

  const exportDiagram = (format: 'png' | 'svg') => {
    // Get the SVG element from the Mermaid diagram
    const svgElement = document.querySelector('.call-stack-modal svg');
    if (!svgElement) return;

    if (format === 'svg') {
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const blob = new Blob([svgData], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${callStack.function}-callstack.svg`;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      // For PNG, we need to convert SVG to canvas first
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            const pngUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = pngUrl;
            link.download = `${callStack.function}-callstack.png`;
            link.click();
            URL.revokeObjectURL(pngUrl);
          }
        });
        URL.revokeObjectURL(url);
      };

      img.src = url;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-light-surface dark:bg-dark-surface rounded-lg shadow-2xl w-[90vw] h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
          <div>
            <h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              Call Stack Visualization
            </h2>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
              {callStack.function} in {callStack.file}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Export Buttons */}
            <button
              onClick={() => exportDiagram('png')}
              className="px-3 py-1.5 text-sm rounded-md
                       bg-light-surface-elevated dark:bg-dark-surface-elevated
                       hover:bg-light-border dark:hover:bg-dark-border
                       text-light-text-primary dark:text-dark-text-primary
                       transition-colors flex items-center gap-1"
              title="Export as PNG"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              PNG
            </button>
            <button
              onClick={() => exportDiagram('svg')}
              className="px-3 py-1.5 text-sm rounded-md
                       bg-light-surface-elevated dark:bg-dark-surface-elevated
                       hover:bg-light-border dark:hover:bg-dark-border
                       text-light-text-primary dark:text-dark-text-primary
                       transition-colors flex items-center gap-1"
              title="Export as SVG"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              SVG
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated
                       text-light-text-muted dark:text-dark-text-muted
                       hover:text-light-text-primary dark:hover:text-dark-text-primary
                       transition-colors"
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        {callStack.flowchart && callStack.sequence && (
          <div className="flex gap-2 p-4 border-b border-light-border dark:border-dark-border">
            <button
              onClick={() => setActiveTab('flowchart')}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                activeTab === 'flowchart'
                  ? 'bg-light-accent-primary dark:bg-dark-accent-primary text-white'
                  : 'bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary'
              }`}
            >
              Flowchart
            </button>
            <button
              onClick={() => setActiveTab('sequence')}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                activeTab === 'sequence'
                  ? 'bg-light-accent-primary dark:bg-dark-accent-primary text-white'
                  : 'bg-light-surface-elevated dark:bg-dark-surface-elevated text-light-text-primary dark:text-dark-text-primary'
              }`}
            >
              Sequence Diagram
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 call-stack-modal">
          {!callStack.flowchart && !callStack.sequence ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <svg
                className="w-16 h-16 text-light-text-muted dark:text-dark-text-muted mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <p className="text-light-text-muted dark:text-dark-text-muted">
                No call stack visualization available.
                <br />
                Run AI review with call stack visualization enabled.
              </p>
            </div>
          ) : (
            <CallStackVisualization
              flowchart={activeTab === 'flowchart' ? callStack.flowchart : undefined}
              sequence={activeTab === 'sequence' ? callStack.sequence : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
