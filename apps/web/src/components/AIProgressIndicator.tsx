import { useEffect, useState } from 'react';

interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed';
  description?: string;
}

export type AIReviewStep = 'cloning' | 'checkout' | 'indexing' | 'lsp-ready' | 'loading' | 'preparing' | 'collecting' | 'analyzing' | 'thinking' | 'generating' | 'finalizing' | 'completed';

interface AIProgressIndicatorProps {
  isActive: boolean;
  currentStep?: AIReviewStep;
  onComplete?: () => void;
  indexingProgress?: { current: number; total: number }; // For showing file count during indexing
}

/**
 * Displays AI processing progress with animated steps
 * Shows actual progress based on currentStep prop instead of simulating
 */
export function AIProgressIndicator({ isActive, currentStep = 'indexing', onComplete, indexingProgress }: AIProgressIndicatorProps) {
  const [steps, setSteps] = useState<ProgressStep[]>([
    { id: 'indexing', label: 'Indexing project files', status: 'pending', description: 'Loading all files into editor...' },
    { id: 'lsp-ready', label: 'Waiting for LSP server', status: 'pending', description: 'Waiting for code intelligence server to analyze project (15-30 seconds)...' },
    { id: 'prepare', label: 'Starting AI review', status: 'pending', description: 'Initializing AI analysis...' },
    { id: 'analyze', label: 'Analyzing code changes', status: 'pending', description: 'Parsing file diffs...' },
    { id: 'thinking', label: 'AI deep analysis', status: 'pending', description: 'This may take 2-5 minutes...' },
    { id: 'generate', label: 'Generating review', status: 'pending', description: 'Creating detailed feedback...' },
    { id: 'parse', label: 'Finalizing results', status: 'pending', description: 'Processing AI response...' },
  ]);

  const stepMapping: Record<AIReviewStep, number> = {
    indexing: 0,
    'lsp-ready': 1,
    preparing: 2,
    analyzing: 3,
    thinking: 4,
    generating: 5,
    finalizing: 6,
    completed: 7,
  };

  // Update steps based on currentStep prop
  useEffect(() => {
    if (!isActive) {
      // Reset on inactive
      setSteps([
        { id: 'indexing', label: 'Indexing project files', status: 'pending', description: 'Loading all files into editor...' },
        { id: 'lsp-ready', label: 'Preparing code intelligence', status: 'pending', description: 'LSP server analyzing code...' },
        { id: 'prepare', label: 'Starting AI review', status: 'pending', description: 'Initializing AI analysis...' },
        { id: 'analyze', label: 'Analyzing code changes', status: 'pending', description: 'Parsing file diffs...' },
        { id: 'thinking', label: 'AI deep analysis', status: 'pending', description: 'This may take 2-5 minutes...' },
        { id: 'generate', label: 'Generating review', status: 'pending', description: 'Creating detailed feedback...' },
        { id: 'parse', label: 'Finalizing results', status: 'pending', description: 'Processing AI response...' },
      ]);
      return;
    }

    const currentStepIndex = stepMapping[currentStep];

    setSteps(prevSteps =>
      prevSteps.map((s, i) => {
        // Update indexing step description with progress
        if (s.id === 'indexing' && indexingProgress) {
          const description = `Loading files: ${indexingProgress.current} / ${indexingProgress.total}`;
          if (i < currentStepIndex) return { ...s, status: 'completed' as const, description };
          if (i === currentStepIndex) return { ...s, status: 'active' as const, description };
          return { ...s, status: 'pending' as const, description };
        }

        if (i < currentStepIndex) return { ...s, status: 'completed' as const };
        if (i === currentStepIndex) return { ...s, status: 'active' as const };
        return { ...s, status: 'pending' as const };
      })
    );

    // Trigger completion callback when all steps are done
    if (currentStep === 'completed') {
      setSteps(prevSteps =>
        prevSteps.map(s => ({ ...s, status: 'completed' as const }))
      );
      onComplete?.();
    }
  }, [isActive, currentStep, indexingProgress, onComplete]);

  if (!isActive) {
    return null;
  }

  const currentStepIndex = stepMapping[currentStep];
  const totalSteps = steps.length;

  return (
    <div className="p-6 bg-light-surface dark:bg-dark-surface rounded-lg border border-light-border dark:border-dark-border">
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`flex items-start gap-3 transition-opacity duration-300 ${
              step.status === 'pending' ? 'opacity-40' : 'opacity-100'
            }`}
          >
            {/* Status Icon */}
            <div className="flex-shrink-0 mt-0.5">
              {step.status === 'completed' ? (
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : step.status === 'active' ? (
                <div className="w-5 h-5 border-2 border-light-accent-primary dark:border-dark-accent-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-light-border dark:border-dark-border" />
              )}
            </div>

            {/* Step Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-medium ${
                    step.status === 'active'
                      ? 'text-light-accent-primary dark:text-dark-accent-primary'
                      : step.status === 'completed'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-light-text-secondary dark:text-dark-text-secondary'
                  }`}
                >
                  {step.label}
                </span>
                {step.status === 'active' && (
                  <span className="flex gap-1">
                    <span className="w-1 h-1 rounded-full bg-light-accent-primary dark:bg-dark-accent-primary animate-pulse" />
                    <span className="w-1 h-1 rounded-full bg-light-accent-primary dark:bg-dark-accent-primary animate-pulse delay-75" />
                    <span className="w-1 h-1 rounded-full bg-light-accent-primary dark:bg-dark-accent-primary animate-pulse delay-150" />
                  </span>
                )}
              </div>
              {step.status === 'active' && step.description && (
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-0.5">
                  {step.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Overall Progress Bar */}
      <div className="mt-6">
        <div className="h-1 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-light-accent-primary dark:bg-dark-accent-primary transition-all duration-500 ease-out"
            style={{
              width: `${(currentStepIndex / totalSteps) * 100}%`,
            }}
          />
        </div>
        <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-2 text-center">
          {currentStep === 'thinking' ? (
            'AI is processing... This may take 2-5 minutes'
          ) : currentStep === 'completed' ? (
            'Completed!'
          ) : (
            `Processing... (${currentStepIndex + 1}/${totalSteps})`
          )}
        </p>
      </div>
    </div>
  );
}
