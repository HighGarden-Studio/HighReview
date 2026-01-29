import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

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

  useEffect(() => {
    // Detect dark mode from Tailwind CSS class on document element
    const isDarkMode = document.documentElement.classList.contains('dark');

    // Initialize mermaid with theme support for both light and dark modes
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: isDarkMode ? {
        // Dark mode colors
        primaryColor: '#3b82f6',
        primaryTextColor: '#f8fafc',
        primaryBorderColor: '#60a5fa',
        lineColor: '#94a3b8',
        secondaryColor: '#8b5cf6',
        tertiaryColor: '#10b981',
        background: '#0f172a',
        mainBkg: '#1e293b',
        secondBkg: '#334155',
        mainContrastColor: 'lightgrey',
        darkMode: true,
        fontFamily: 'ui-monospace, monospace',
        // Sequence diagram specific colors for dark mode
        actorBkg: '#1e293b',
        actorBorder: '#60a5fa',
        actorTextColor: '#f8fafc',
        actorLineColor: '#94a3b8',
        signalColor: '#f8fafc',
        signalTextColor: '#f8fafc',
        labelBoxBkgColor: '#1e293b',
        labelBoxBorderColor: '#60a5fa',
        labelTextColor: '#f8fafc',
        loopTextColor: '#f8fafc',
        noteBorderColor: '#60a5fa',
        noteBkgColor: '#1e293b',
        noteTextColor: '#f8fafc',
        activationBorderColor: '#60a5fa',
        activationBkgColor: '#334155',
        sequenceNumberColor: '#f8fafc',
      } : {
        // Light mode colors
        primaryColor: '#3b82f6',
        primaryTextColor: '#1e293b',
        primaryBorderColor: '#3b82f6',
        lineColor: '#475569',
        secondaryColor: '#8b5cf6',
        tertiaryColor: '#10b981',
        background: '#ffffff',
        mainBkg: '#f8fafc',
        secondBkg: '#e2e8f0',
        mainContrastColor: '#1e293b',
        darkMode: false,
        fontFamily: 'ui-monospace, monospace',
        // Sequence diagram specific colors for light mode
        actorBkg: '#f8fafc',
        actorBorder: '#3b82f6',
        actorTextColor: '#1e293b',
        actorLineColor: '#475569',
        signalColor: '#1e293b',
        signalTextColor: '#1e293b',
        labelBoxBkgColor: '#f8fafc',
        labelBoxBorderColor: '#3b82f6',
        labelTextColor: '#1e293b',
        loopTextColor: '#1e293b',
        noteBorderColor: '#3b82f6',
        noteBkgColor: '#f8fafc',
        noteTextColor: '#1e293b',
        activationBorderColor: '#3b82f6',
        activationBkgColor: '#e2e8f0',
        sequenceNumberColor: '#1e293b',
      },
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis',
      },
      sequence: {
        useMaxWidth: true,
        actorMargin: 50,
        boxMargin: 10,
        boxTextMargin: 5,
        noteMargin: 10,
        messageMargin: 35,
      },
    });

    // Re-initialize when theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const newIsDarkMode = document.documentElement.classList.contains('dark');
          // Re-render diagrams when theme changes
          if (flowchart && flowchartRef.current) {
            renderDiagram(flowchart, flowchartRef.current, 'flowchart');
          }
          if (sequence && sequenceRef.current) {
            renderDiagram(sequence, sequenceRef.current, 'sequence');
          }
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [flowchart, sequence]);

  useEffect(() => {
    if (flowchart && flowchartRef.current) {
      renderDiagram(flowchart, flowchartRef.current, 'flowchart');
    }
  }, [flowchart, file, onFileClick]);

  useEffect(() => {
    if (sequence && sequenceRef.current) {
      renderDiagram(sequence, sequenceRef.current, 'sequence');
    }
  }, [sequence, file, onFileClick]);

  const extractFileReferences = (diagram: string): Map<string, string> => {
    const fileMap = new Map<string, string>();

    // Extract file paths from node labels (e.g., "functionName\n(file.ts)" or "file.ts:functionName")
    const patterns = [
      /\[(.*?)\((.*?\.(?:ts|tsx|js|jsx|py|rb|java|go|rs|php|cpp|c|h))\)\]/g, // [label (file.ext)]
      /([\w\/\-\.]+\.(?:ts|tsx|js|jsx|py|rb|java|go|rs|php|cpp|c|h)):/g,      // file.ext:label
      /-->.*?\[(.*?\.(?:ts|tsx|js|jsx|py|rb|java|go|rs|php|cpp|c|h))\]/g,     // --> [file.ext]
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

    // Add click handlers to all nodes in the SVG
    const nodes = container.querySelectorAll('.node, .actor, g.nodes > g');

    nodes.forEach((node) => {
      const textElement = node.querySelector('text, tspan');
      if (!textElement) return;

      const nodeText = textElement.textContent?.trim() || '';

      // Check if this node references a file
      let targetFile: string | undefined;

      // First try to match the main file from CallStackInfo
      if (file && nodeText.toLowerCase().includes(file.split('/').pop()?.toLowerCase() || '')) {
        targetFile = file;
      } else {
        // Try to find a match in extracted file references
        for (const [label, filePath] of fileRefs.entries()) {
          if (nodeText.includes(label) || nodeText.includes(filePath)) {
            targetFile = filePath;
            break;
          }
        }
      }

      if (targetFile) {
        // Add pointer cursor and click handler
        const element = node as HTMLElement;
        element.style.cursor = 'pointer';
        element.style.transition = 'opacity 0.2s';

        element.addEventListener('mouseenter', () => {
          element.style.opacity = '0.7';
        });

        element.addEventListener('mouseleave', () => {
          element.style.opacity = '1';
        });

        element.addEventListener('click', (e) => {
          e.stopPropagation();
          onFileClick(targetFile!);
        });

        // Add a title for tooltip
        element.setAttribute('title', `Navigate to ${targetFile}`);
      }
    });
  };

  const renderDiagram = async (diagram: string, container: HTMLElement, type: string) => {
    try {
      // Clear previous content
      container.innerHTML = '';

      // Strip markdown code fences if present (```mermaid ... ```)
      let cleanDiagram = diagram.trim();
      if (cleanDiagram.startsWith('```mermaid')) {
        cleanDiagram = cleanDiagram.replace(/^```mermaid\s*\n/, '').replace(/\n```\s*$/, '');
      } else if (cleanDiagram.startsWith('```')) {
        cleanDiagram = cleanDiagram.replace(/^```\s*\n/, '').replace(/\n```\s*$/, '');
      }

      // Validate diagram is not empty and has valid structure
      if (!cleanDiagram || cleanDiagram.length < 5) {
        console.warn(`[Mermaid] ${type} diagram is empty or too short`);
        container.innerHTML = `
          <div class="p-4 bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border rounded-lg text-center">
            <p class="text-light-text-muted dark:text-dark-text-muted text-sm">
              No ${type} diagram available
            </p>
          </div>
        `;
        return;
      }

      // Check if diagram has valid mermaid syntax (starts with diagram type)
      const validStarts = ['graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt', 'pie', 'journey'];
      const hasValidStart = validStarts.some(start => cleanDiagram.toLowerCase().startsWith(start.toLowerCase()));

      if (!hasValidStart) {
        console.warn(`[Mermaid] ${type} diagram doesn't start with valid diagram type:`, cleanDiagram.substring(0, 50));
        container.innerHTML = `
          <div class="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p class="text-amber-800 dark:text-amber-300 text-sm font-medium mb-2">
              Invalid ${type} diagram format
            </p>
            <p class="text-xs text-amber-700 dark:text-amber-400 mb-2">
              Diagram must start with: ${validStarts.join(', ')}
            </p>
            <details class="text-xs">
              <summary class="cursor-pointer text-amber-600 dark:text-amber-500 hover:underline">Show diagram content</summary>
              <pre class="mt-2 text-light-text-muted dark:text-dark-text-muted overflow-x-auto">${cleanDiagram}</pre>
            </details>
          </div>
        `;
        return;
      }

      // Re-initialize mermaid with current theme before rendering
      const isDarkMode = document.documentElement.classList.contains('dark');
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: isDarkMode ? {
          // Dark mode colors
          primaryColor: '#3b82f6',
          primaryTextColor: '#f8fafc',
          primaryBorderColor: '#60a5fa',
          lineColor: '#94a3b8',
          secondaryColor: '#8b5cf6',
          tertiaryColor: '#10b981',
          background: '#0f172a',
          mainBkg: '#1e293b',
          secondBkg: '#334155',
          mainContrastColor: 'lightgrey',
          darkMode: true,
          fontFamily: 'ui-monospace, monospace',
          actorBkg: '#1e293b',
          actorBorder: '#60a5fa',
          actorTextColor: '#f8fafc',
          actorLineColor: '#94a3b8',
          signalColor: '#f8fafc',
          signalTextColor: '#f8fafc',
          labelBoxBkgColor: '#1e293b',
          labelBoxBorderColor: '#60a5fa',
          labelTextColor: '#f8fafc',
          loopTextColor: '#f8fafc',
          noteBorderColor: '#60a5fa',
          noteBkgColor: '#1e293b',
          noteTextColor: '#f8fafc',
          activationBorderColor: '#60a5fa',
          activationBkgColor: '#334155',
          sequenceNumberColor: '#f8fafc',
        } : {
          // Light mode colors
          primaryColor: '#3b82f6',
          primaryTextColor: '#1e293b',
          primaryBorderColor: '#3b82f6',
          lineColor: '#475569',
          secondaryColor: '#8b5cf6',
          tertiaryColor: '#10b981',
          background: '#ffffff',
          mainBkg: '#f8fafc',
          secondBkg: '#e2e8f0',
          mainContrastColor: '#1e293b',
          darkMode: false,
          fontFamily: 'ui-monospace, monospace',
          actorBkg: '#f8fafc',
          actorBorder: '#3b82f6',
          actorTextColor: '#1e293b',
          actorLineColor: '#475569',
          signalColor: '#1e293b',
          signalTextColor: '#1e293b',
          labelBoxBkgColor: '#f8fafc',
          labelBoxBorderColor: '#3b82f6',
          labelTextColor: '#1e293b',
          loopTextColor: '#1e293b',
          noteBorderColor: '#3b82f6',
          noteBkgColor: '#f8fafc',
          noteTextColor: '#1e293b',
          activationBorderColor: '#3b82f6',
          activationBkgColor: '#e2e8f0',
          sequenceNumberColor: '#1e293b',
        },
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
          curve: 'basis',
        },
        sequence: {
          useMaxWidth: true,
          actorMargin: 50,
          boxMargin: 10,
          boxTextMargin: 5,
          noteMargin: 10,
          messageMargin: 35,
        },
      });

      // Generate unique ID
      const id = `mermaid-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Render the diagram
      const { svg } = await mermaid.render(id, cleanDiagram);
      container.innerHTML = svg;

      // Add click handlers to navigate to files
      setTimeout(() => addClickHandlers(container, diagram), 100);
    } catch (error) {
      console.error(`[Mermaid] Failed to render ${type} diagram:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      container.innerHTML = `
        <div class="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
          <p class="text-red-800 dark:text-red-300 text-sm font-medium mb-2">
            Failed to render ${type} diagram
          </p>
          <p class="text-xs text-red-700 dark:text-red-400 mb-2">
            ${errorMessage}
          </p>
          <details class="text-xs">
            <summary class="cursor-pointer text-red-600 dark:text-red-500 hover:underline">Show diagram content</summary>
            <pre class="mt-2 text-light-text-muted dark:text-dark-text-muted overflow-x-auto max-h-40">${diagram}</pre>
          </details>
        </div>
      `;
    }
  };

  if (!flowchart && !sequence) {
    return null;
  }

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
              <span className="w-6 h-6 rounded bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 flex items-center justify-center text-xs">
                🔀
              </span>
              Flowchart
            </h5>
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
          <div
            ref={flowchartRef}
            className="p-4 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border overflow-x-auto"
          />
        </div>
      )}

      {sequence && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-light-accent-secondary/10 dark:bg-dark-accent-secondary/10 flex items-center justify-center text-xs">
                ⏱️
              </span>
              Sequence Diagram
            </h5>
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
          <div
            ref={sequenceRef}
            className="p-4 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-lg border border-light-border dark:border-dark-border overflow-x-auto"
          />
        </div>
      )}
    </div>
  );
}
