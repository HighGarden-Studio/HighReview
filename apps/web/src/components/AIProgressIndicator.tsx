import { useEffect, useState } from 'react';
import { Scanner } from './Scanner';


interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed';
  description?: string;
}

export type AIReviewStep = 'cloning' | 'checkout' | 'indexing' | 'loading' | 'preparing' | 'collecting' | 'analyzing' | 'thinking' | 'generating' | 'finalizing' | 'summarizing' | 'completed';

interface AIProgressIndicatorProps {
  isActive: boolean;
  currentStep?: AIReviewStep;
  onComplete?: () => void;
  indexingProgress?: { current: number; total: number }; // For showing file count during indexing
  chunkedReviewProgress?: {
    currentChunk: number;
    totalChunks: number;
    currentFiles: string[];
    completedFiles: string[];
    status: string;
  } | null;
  isModalOpen?: boolean;
}

/**
 * Displays AI processing progress with animated steps
 * Shows actual progress based on currentStep prop instead of simulating
 */
export function AIProgressIndicator({ isActive, currentStep = 'indexing', onComplete, indexingProgress, chunkedReviewProgress, isModalOpen = false }: AIProgressIndicatorProps) {
  const [steps, setSteps] = useState<ProgressStep[]>([
    { id: 'indexing', label: 'Indexing project files', status: 'pending', description: 'Loading all files into editor...' },
    { id: 'prepare', label: 'Starting AI review', status: 'pending', description: 'Initializing AI analysis...' },
    { id: 'analyze', label: 'Analyzing code changes', status: 'pending', description: 'Parsing file diffs...' },
    { id: 'thinking', label: 'AI deep analysis', status: 'pending', description: 'This may take 2-5 minutes...' },
    { id: 'generate', label: 'Generating review', status: 'pending', description: 'Creating detailed feedback...' },
    { id: 'summarize', label: 'Summarizing results', status: 'pending', description: 'AI is refining overall summary...' },
    { id: 'parse', label: 'Finalizing results', status: 'pending', description: 'Processing AI response...' },
  ]);

  const stepMapping: Record<AIReviewStep, number> = {
    cloning: 0,
    checkout: 0,
    indexing: 0,
    loading: 1,
    preparing: 1,
    collecting: 1,
    analyzing: 2,
    thinking: 3,
    generating: 4,
    finalizing: 5,
    summarizing: 5,
    completed: 7,
  };

  // Update steps based on currentStep prop
  useEffect(() => {
    if (!isActive) {
      // Reset on inactive
      setSteps([
        { id: 'indexing', label: 'Indexing project files', status: 'pending', description: 'Loading all files into editor...' },
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
        
        // Update generating/thinking step with chunk progress
        if ((s.id === 'generate' || s.id === 'thinking' || s.id === 'analyze') && chunkedReviewProgress && currentStepIndex === i) {
          const { currentChunk, totalChunks, currentFiles, completedFiles } = chunkedReviewProgress;
          const percentage = totalChunks > 0 ? Math.round((currentChunk / totalChunks) * 100) : 0;
          
          let description = 'Processing...';
          if (totalChunks > 0) {
            description = `Analyzing chunk ${currentChunk}/${totalChunks} (${percentage}%)`;
          }
          
          if (currentFiles && currentFiles.length > 0) {
            const filesText = currentFiles.length > 2 
              ? `${currentFiles[0]}, ${currentFiles[1]} +${currentFiles.length - 2} more`
              : currentFiles.join(', ');
            description += ` - ${filesText}`;
          } else if (completedFiles.length > 0) {
            description += ` - Reviewed ${completedFiles.length} files`;
          }
          
          return { ...s, status: 'active' as const, description };
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
  }, [isActive, currentStep, indexingProgress, chunkedReviewProgress, onComplete]);

  if (!isActive) {
    return null;
  }

  const currentStepIndex = stepMapping[currentStep];
  const totalSteps = steps.length;
  
  // Ensure the progress bar moves smoothly between steps
  // Base progress from steps + detailed progress within current step?
  // Actually, keep it simple for now, relying on step index for overall bar, 
  // but maybe interpolate for the active step if we have chunk info.
  // Ideally: base = currentStepIndex / totalSteps. 
  // + (detailedProgress * (1/totalSteps))
  const stepWeight = 1 / totalSteps;
  const interpolatedProgress = (currentStepIndex / totalSteps) + (chunkedReviewProgress && chunkedReviewProgress.totalChunks > 0 
    ? (chunkedReviewProgress.currentChunk / chunkedReviewProgress.totalChunks) * stepWeight 
    : 0);

  return (
    <div className="p-6 bg-light-surface dark:bg-dark-surface rounded-lg border border-light-border dark:border-dark-border">
      {/* Scanner Loading Animation */}
      <div className="mb-8 flex justify-center">
        <Scanner size="md" />
      </div>

      {!isModalOpen && (
      <div className="space-y-4">
        {steps.map((step) => (
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
                <div className="w-5 h-5 flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full border border-light-accent-primary/30 dark:border-dark-accent-primary/30 relative overflow-hidden">
                    <div className="absolute inset-x-0 h-[1px] bg-light-accent-primary dark:bg-dark-accent-primary animate-scanner" />
                  </div>
                </div>

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
      )}

      {/* Overall Progress Bar */}
      <div className="mt-6">
        <div className="h-1 bg-light-surface-elevated dark:bg-dark-surface-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-light-accent-primary dark:bg-dark-accent-primary transition-all duration-500 ease-out"
            style={{
              width: `${Math.min(interpolatedProgress * 100, 100)}%`,
            }}
          />
        </div>
        <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-2 text-center">
          {currentStep === 'thinking' || currentStep === 'analyzing' || currentStep === 'generating' ? (
             chunkedReviewProgress ? 
             `Processing ${chunkedReviewProgress.currentChunk}/${chunkedReviewProgress.totalChunks} chunks...` :
             'AI is processing... This may take 2-5 minutes'
          ) : currentStep === 'completed' ? (
            'Completed!'
          ) : (
            `Processing... (${currentStepIndex + 1}/${totalSteps})`
          )}
        </p>
      </div>

      {/* Conditionally hide details if modal is open */}
      {isModalOpen && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded text-xs text-center border border-blue-100 dark:border-blue-800">
          Detailed progress is being shown in the modal.
        </div>
      )}
    </div>
  );
}
