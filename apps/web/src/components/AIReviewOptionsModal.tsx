import { useState } from 'react';

export interface AIReviewOptions {
  // Context-aware review (Tree-sitter-based)
  includeContext: boolean;
  contextScope: 'callers' | 'implementations' | 'both';

  // Change intent analysis
  analyzeChangeIntent: boolean;
  changeIntentLevel: 'file' | 'block' | 'both';

  // Call stack visualization
  generateCallStack: boolean;
  callStackFormat: 'flowchart' | 'sequence' | 'both';

  // Impact analysis
  analyzeBroaderImpact: boolean;
  impactScope: 'module' | 'project' | 'dependencies';

  // SemanticDiff-inspired features
  useSemanticDiff: boolean;
  detectMovedCode: boolean;
  detectRefactoring: boolean;
  ignoreWhitespace: boolean;
  ignoreComments: boolean;

  // Custom prompt
  customPrompt: string;

  // Model configuration
  model?: string;
  candidateCount?: number;
  temperature?: number;

  // Feature flags
  changeIntents?: boolean;
  callStackAnalysis?: boolean;
  impactAnalysis?: boolean;
  semanticAnalysis?: boolean;
  securityAnalysis?: boolean;
}

interface AIReviewOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: AIReviewOptions) => void;
  initialOptions?: Partial<AIReviewOptions>;
}

const defaultOptions: AIReviewOptions = {
  includeContext: false,
  contextScope: 'both',
  analyzeChangeIntent: true,
  changeIntentLevel: 'both',
  generateCallStack: true,
  callStackFormat: 'both',
  analyzeBroaderImpact: true,
  impactScope: 'module',
  useSemanticDiff: true,
  detectMovedCode: true,
  detectRefactoring: true,
  ignoreWhitespace: true,
  ignoreComments: false,
  customPrompt: '',
};

export function AIReviewOptionsModal({
  isOpen,
  onClose,
  onConfirm,
  initialOptions,
}: AIReviewOptionsModalProps) {
  const [options, setOptions] = useState<AIReviewOptions>({
    ...defaultOptions,
    ...initialOptions,
  });

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(options);
    onClose();
  };

  const updateOption = <K extends keyof AIReviewOptions>(
    key: K,
    value: AIReviewOptions[K]
  ) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-light-surface dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-light-border dark:border-dark-border bg-gradient-to-r from-light-accent-primary to-light-accent-secondary dark:from-dark-accent-primary dark:to-dark-accent-secondary">
          <h2 className="text-xl font-bold text-white">AI Code Review Options</h2>
          <p className="text-white/80 text-sm mt-1">
            Customize AI review settings before starting the review
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Context-Aware Review */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                🧠
              </span>
              Context-Aware Review (Tree-sitter-based)
            </h3>
            <div className="ml-10 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.includeContext}
                  onChange={(e) => updateOption('includeContext', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                  Include context files for broader impact analysis
                </span>
              </label>
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted ml-6">
                Uses Tree-sitter static analysis to find callers and implementations of modified code. Context files are analyzed for impact only, not reviewed for code quality.
              </p>
              {options.includeContext && (
                <div className="ml-6 space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={options.contextScope === 'callers'}
                      onChange={() => updateOption('contextScope', 'callers')}
                      className="w-4 h-4"
                    />
                    <span className="text-light-text-muted dark:text-dark-text-muted text-sm">
                      Callers only (files that call modified methods)
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={options.contextScope === 'implementations'}
                      onChange={() => updateOption('contextScope', 'implementations')}
                      className="w-4 h-4"
                    />
                    <span className="text-light-text-muted dark:text-dark-text-muted text-sm">
                      Implementations only (implementations of modified interfaces/abstracts)
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={options.contextScope === 'both'}
                      onChange={() => updateOption('contextScope', 'both')}
                      className="w-4 h-4"
                    />
                    <span className="text-light-text-muted dark:text-dark-text-muted text-sm">
                      Both callers and implementations
                    </span>
                  </label>
                </div>
              )}
            </div>
          </section>

          {/* Change Intent Analysis */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-light-accent-primary/10 dark:bg-dark-accent-primary/10 flex items-center justify-center text-light-accent-primary dark:text-dark-accent-primary">
                🎯
              </span>
              Change Intent Analysis
            </h3>
            <div className="ml-10 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.analyzeChangeIntent}
                  onChange={(e) => updateOption('analyzeChangeIntent', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                  Analyze change intent and display on diff view
                </span>
              </label>
              {options.analyzeChangeIntent && (
                <div className="ml-6 space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={options.changeIntentLevel === 'file'}
                      onChange={() => updateOption('changeIntentLevel', 'file')}
                      className="w-4 h-4"
                    />
                    <span className="text-light-text-muted dark:text-dark-text-muted text-sm">
                      File level only
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={options.changeIntentLevel === 'block'}
                      onChange={() => updateOption('changeIntentLevel', 'block')}
                      className="w-4 h-4"
                    />
                    <span className="text-light-text-muted dark:text-dark-text-muted text-sm">
                      Code block level only
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={options.changeIntentLevel === 'both'}
                      onChange={() => updateOption('changeIntentLevel', 'both')}
                      className="w-4 h-4"
                    />
                    <span className="text-light-text-muted dark:text-dark-text-muted text-sm">
                      Both file and code block level
                    </span>
                  </label>
                </div>
              )}
            </div>
          </section>

          {/* Call Stack Visualization */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-light-accent-secondary/10 dark:bg-dark-accent-secondary/10 flex items-center justify-center text-light-accent-secondary dark:text-dark-accent-secondary">
                📊
              </span>
              Call Stack Visualization
            </h3>
            <div className="ml-10 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.generateCallStack}
                  onChange={(e) => updateOption('generateCallStack', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                  Generate call stack visualization on function/method click
                </span>
              </label>
              {options.generateCallStack && (
                <div className="ml-6 space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={options.callStackFormat === 'flowchart'}
                      onChange={() => updateOption('callStackFormat', 'flowchart')}
                      className="w-4 h-4"
                    />
                    <span className="text-light-text-muted dark:text-dark-text-muted text-sm">
                      Flowchart only
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={options.callStackFormat === 'sequence'}
                      onChange={() => updateOption('callStackFormat', 'sequence')}
                      className="w-4 h-4"
                    />
                    <span className="text-light-text-muted dark:text-dark-text-muted text-sm">
                      Sequence diagram only
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={options.callStackFormat === 'both'}
                      onChange={() => updateOption('callStackFormat', 'both')}
                      className="w-4 h-4"
                    />
                    <span className="text-light-text-muted dark:text-dark-text-muted text-sm">
                      Both flowchart and sequence diagram
                    </span>
                  </label>
                </div>
              )}
            </div>
          </section>

          {/* Impact Analysis */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-light-accent-success/10 dark:bg-dark-accent-success/10 flex items-center justify-center text-light-accent-success dark:text-dark-accent-success">
                🔍
              </span>
              Broader Impact Analysis
            </h3>
            <div className="ml-10 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.analyzeBroaderImpact}
                  onChange={(e) => updateOption('analyzeBroaderImpact', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                  Analyze impact beyond modified code
                </span>
              </label>
              {options.analyzeBroaderImpact && (
                <div className="ml-6 space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={options.impactScope === 'module'}
                      onChange={() => updateOption('impactScope', 'module')}
                      className="w-4 h-4"
                    />
                    <span className="text-light-text-muted dark:text-dark-text-muted text-sm">
                      Current module/package only
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={options.impactScope === 'project'}
                      onChange={() => updateOption('impactScope', 'project')}
                      className="w-4 h-4"
                    />
                    <span className="text-light-text-muted dark:text-dark-text-muted text-sm">
                      Entire project
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={options.impactScope === 'dependencies'}
                      onChange={() => updateOption('impactScope', 'dependencies')}
                      className="w-4 h-4"
                    />
                    <span className="text-light-text-muted dark:text-dark-text-muted text-sm">
                      Project + dependencies
                    </span>
                  </label>
                </div>
              )}
            </div>
          </section>

          {/* SemanticDiff Features */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-light-accent-warning/10 dark:bg-dark-accent-warning/10 flex items-center justify-center text-light-accent-warning dark:text-dark-accent-warning">
                ✨
              </span>
              Semantic Diff Features
            </h3>
            <div className="ml-10 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.useSemanticDiff}
                  onChange={(e) => updateOption('useSemanticDiff', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                  Use language-aware semantic diff
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.detectMovedCode}
                  onChange={(e) => updateOption('detectMovedCode', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                  Detect moved code blocks
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.detectRefactoring}
                  onChange={(e) => updateOption('detectRefactoring', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                  Detect refactoring patterns
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.ignoreWhitespace}
                  onChange={(e) => updateOption('ignoreWhitespace', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                  Ignore whitespace changes
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.ignoreComments}
                  onChange={(e) => updateOption('ignoreComments', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-light-text-secondary dark:text-dark-text-secondary">
                  Ignore comment-only changes
                </span>
              </label>
            </div>
          </section>

          {/* Custom Prompt */}
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-light-accent-error/10 dark:bg-dark-accent-error/10 flex items-center justify-center text-light-accent-error dark:text-dark-accent-error">
                💬
              </span>
              Custom Prompt
            </h3>
            <div className="ml-10">
              <textarea
                value={options.customPrompt}
                onChange={(e) => updateOption('customPrompt', e.target.value)}
                placeholder="Enter additional instructions for AI review (optional)..."
                className="w-full h-24 px-3 py-2 bg-light-surface-elevated dark:bg-dark-surface-elevated border border-light-border dark:border-dark-border rounded-lg text-light-text-primary dark:text-dark-text-primary placeholder-light-text-muted dark:placeholder-dark-text-muted focus:outline-none focus:ring-2 focus:ring-light-accent-primary dark:focus:ring-dark-accent-primary resize-none"
              />
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
                Add custom instructions to guide the AI review process
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-light-border dark:border-dark-border bg-light-surface-elevated dark:bg-dark-surface-elevated flex items-center justify-between">
          <button
            onClick={() => setOptions(defaultOptions)}
            className="px-4 py-2 text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary transition-colors"
          >
            Reset to Defaults
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-surface-elevated dark:hover:bg-dark-surface-elevated rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-6 py-2 bg-gradient-to-r from-light-accent-primary to-light-accent-secondary dark:from-dark-accent-primary dark:to-dark-accent-secondary text-white rounded-lg font-medium hover:shadow-lg transition-all"
            >
              Start Review
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
