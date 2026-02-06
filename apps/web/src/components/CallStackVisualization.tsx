import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { toast } from 'react-hot-toast';

interface CallStackVisualizationProps {
  flowchart?: string;
  sequence?: string;
  title?: string;
  file?: string;
  onFileClick?: (file: string) => void;
  onExpand?: (diagramType: 'flowchart' | 'sequence' | 'both') => void;
}

export function CallStackVisualization({ flowchart, sequence, title, file, onFileClick, onExpand }: CallStackVisualizationProps) {
  const flowchartRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef<HTMLDivElement>(null);
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'default'>('default');

  useEffect(() => {
    // Detect initial dark mode
    const isDark = document.documentElement.classList.contains('dark');
    setCurrentTheme(isDark ? 'dark' : 'default');

    // Watch for theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const isDarkNow = document.documentElement.classList.contains('dark');
          setCurrentTheme(isDarkNow ? 'dark' : 'default');
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Initialize mermaid with the current theme
    mermaid.initialize({
      startOnLoad: false,
      theme: currentTheme,
      securityLevel: 'loose',
      fontFamily: 'ui-monospace, monospace',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis',
      },
      sequence: {
        useMaxWidth: true,
        actorMargin: 50,
      },
    });

    // Re-render diagrams when theme changes
    if (flowchart && flowchartRef.current) {
      renderDiagram(flowchart, flowchartRef.current, 'flowchart');
    }
    if (sequence && sequenceRef.current) {
      renderDiagram(sequence, sequenceRef.current, 'sequence');
    }
  }, [currentTheme, flowchart, sequence]);

  const handleCopyMermaid = async (text?: string) => {
    if (!text) return;
    try {
      // Strip markdown code fences if present
      let cleanText = text.trim();
      if (cleanText.startsWith('```mermaid')) {
        cleanText = cleanText.replace(/^```mermaid\s*\n/, '').replace(/\n```\s*$/, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```\s*\n/, '').replace(/\n```\s*$/, '');
      }
      
      await navigator.clipboard.writeText(cleanText);
      toast.success('Mermaid source copied to clipboard');
    } catch (err) {
      console.error('Failed to copy text: ', err);
      toast.error('Failed to copy to clipboard');
    }
  };

  const extractFileReferences = (diagram: string): Map<string, string> => {
    const fileMap = new Map<string, string>();
    const patterns = [
      /\[(.*?)\((.*?\.(?:ts|tsx|js|jsx|py|rb|java|go|rs|php|cpp|c|h))\)\]/g,
      /([\w\/\-\.]+\.(?:ts|tsx|js|jsx|py|rb|java|go|rs|php|cpp|c|h)):/g,
      /-->.*?\[(.*?\.(?:ts|tsx|js|jsx|py|rb|java|go|rs|php|cpp|c|h))\]/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(diagram)) !== null) {
        const filePath = match[2] || match[1];
        if (filePath) {
          const nodeLabel = match[1] || match[0];
          fileMap.set(nodeLabel, filePath);
        }
      }
    }
    return fileMap;
  };

  const addClickHandlers = (container: HTMLElement, diagram: string) => {
    if (!onFileClick) return;
    const fileRefs = extractFileReferences(diagram);
    const nodes = container.querySelectorAll('.node, .actor, g.nodes > g');

    nodes.forEach((node) => {
      const textElement = node.querySelector('text, tspan');
      if (!textElement) return;
      const nodeText = textElement.textContent?.trim() || '';
      let targetFile: string | undefined;

      if (file && nodeText.toLowerCase().includes(file.split('/').pop()?.toLowerCase() || '')) {
        targetFile = file;
      } else {
        for (const [label, filePath] of fileRefs.entries()) {
          if (nodeText.includes(label) || nodeText.includes(filePath)) {
            targetFile = filePath;
            break;
          }
        }
      }

      if (targetFile) {
        const element = node as HTMLElement;
        element.style.cursor = 'pointer';
        element.style.transition = 'opacity 0.2s';
        element.addEventListener('mouseenter', () => { element.style.opacity = '0.7'; });
        element.addEventListener('mouseleave', () => { element.style.opacity = '1'; });
        element.addEventListener('click', (e) => {
          e.stopPropagation();
          onFileClick(targetFile!);
        });
        element.setAttribute('title', `Navigate to ${targetFile}`);
      }
    });
  };

  const renderDiagram = async (diagram: string, container: HTMLElement, type: string) => {
    try {
      container.innerHTML = '';
      let cleanDiagram = diagram.trim();
      if (cleanDiagram.startsWith('```mermaid')) {
        cleanDiagram = cleanDiagram.replace(/^```mermaid\s*\n/, '').replace(/\n```\s*$/, '');
      } else if (cleanDiagram.startsWith('```')) {
        cleanDiagram = cleanDiagram.replace(/^```\s*\n/, '').replace(/\n```\s*$/, '');
      }

      if (!cleanDiagram || cleanDiagram.length < 5) {
        container.innerHTML = `<div class="p-4 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg text-center"><p class="text-light-text-muted dark:text-dark-text-muted text-sm">No ${type} diagram available</p></div>`;
        return;
      }

      // Check syntax first to avoid visual error rendering
      try {
        await mermaid.parse(cleanDiagram);
      } catch (parseError) {
        console.error(`[Mermaid] Syntax validation failed for ${type}:`, parseError);
        // Do NOT render error message to the user, just stop
        // Optionally show a placeholder or nothing
        container.innerHTML = `<div class="p-4 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg text-center"><p class="text-light-text-muted dark:text-dark-text-muted text-sm">Visual diagram unavailable (Syntax Error)</p></div>`;
        return;
      }

      const id = `mermaid-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const { svg } = await mermaid.render(id, cleanDiagram);
      container.innerHTML = svg;
      setTimeout(() => addClickHandlers(container, diagram), 100);
    } catch (error) {
      console.error(`[Mermaid] Failed to render ${type} diagram:`, error);
      // Suppress visual error display for user
      container.innerHTML = `<div class="p-4 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg text-center"><p class="text-light-text-muted dark:text-dark-text-muted text-sm">Visual diagram unavailable</p></div>`;
    }
  };

  if (!flowchart && !sequence) return null;

  return (
    <div className="space-y-4">
      {title && (
        <h4 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
          {title}
        </h4>
      )}

      {flowchart && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 flex items-center justify-center text-xs">🔀</span>
              Flowchart
            </h5>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopyMermaid(flowchart)}
                className="px-2 py-1 text-xs font-medium rounded bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copy
              </button>
              {onExpand && (
                <button
                  onClick={() => onExpand('flowchart')}
                  className="px-2 py-1 text-xs font-medium rounded bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 text-light-accent-primary dark:text-dark-accent-primary hover:bg-light-accent-primary/20 dark:hover:bg-dark-accent-primary/20 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  Expand
                </button>
              )}
            </div>
          </div>
          <div ref={flowchartRef} className="p-4 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border overflow-x-auto" />
        </div>
      )}

      {sequence && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-light-accent-secondary/10 dark:bg-dark-accent-secondary/10 flex items-center justify-center text-xs">⏱️</span>
              Sequence Diagram
            </h5>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopyMermaid(sequence)}
                className="px-2 py-1 text-xs font-medium rounded bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copy
              </button>
              {onExpand && (
                <button
                  onClick={() => onExpand('sequence')}
                  className="px-2 py-1 text-xs font-medium rounded bg-light-accent-secondary/10 dark:bg-dark-accent-secondary/10 text-light-accent-secondary dark:text-dark-accent-secondary hover:bg-light-accent-secondary/20 dark:hover:bg-dark-accent-secondary/20 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  Expand
                </button>
              )}
            </div>
          </div>
          <div ref={sequenceRef} className="p-4 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border overflow-x-auto" />
        </div>
      )}
    </div>
  );
}
