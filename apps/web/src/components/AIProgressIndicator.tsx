import { useEffect, useState } from 'react';

interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed';
  description?: string;
}

export type AIReviewStep = 'preparing' | 'analyzing' | 'thinking' | 'generating' | 'finalizing' | 'completed';

interface AIProgressIndicatorProps {
  isActive: boolean;
  currentStep?: AIReviewStep;
  onComplete?: () => void;
}

/**
 * Displays AI processing progress with animated steps
 * Shows actual progress based on currentStep prop instead of simulating
 */
export function AIProgressIndicator({ isActive, currentStep = 'preparing', onComplete }: AIProgressIndicatorProps) {
  const [steps, setSteps] = useState<ProgressStep[]>([
    { id: 'prepare', label: 'Preparing review', status: 'pending', description: 'Loading files...' },
    { id: 'analyze', label: 'Analyzing changes', status: 'pending', description: 'Parsing diffs...' },
    { id: 'thinking', label: 'AI is thinking', status: 'pending', description: 'This may take 2-5 minutes...' },
    { id: 'generate', label: 'Generating review', status: 'pending', description: 'Creating feedback...' },
    { id: 'parse', label: 'Finalizing', status: 'pending', description: 'Parsing results...' },
  ]);

  const stepMapping: Record<AIReviewStep, number> = {
    preparing: 0,
    analyzing: 1,
    thinking: 2,
    generating: 3,
    finalizing: 4,
    completed: 5,
  };

  // Update steps based on currentStep prop
  useEffect(() => {
    if (!isActive) {
      // Reset on inactive
      setSteps([
        { id: 'prepare', label: 'Preparing review', status: 'pending', description: 'Loading files...' },
        { id: 'analyze', label: 'Analyzing changes', status: 'pending', description: 'Parsing diffs...' },
        { id: 'thinking', label: 'AI is thinking', status: 'pending', description: 'This may take 2-5 minutes...' },
        { id: 'generate', label: 'Generating review', status: 'pending', description: 'Creating feedback...' },
        { id: 'parse', label: 'Finalizing', status: 'pending', description: 'Parsing results...' },
      ]);
      return;
    }

    const currentStepIndex = stepMapping[currentStep];

    setSteps(prevSteps =>
      prevSteps.map((s, i) => {
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
  }, [isActive, currentStep, onComplete]);

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
