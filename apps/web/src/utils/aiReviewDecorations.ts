import * as monaco from 'monaco-editor';

export interface AIReviewComment {
  file: string;
  line: number;
  severity: 'critical' | 'warning' | 'suggestion';
  category: string;
  message: string;
  suggestion?: string;
}

export interface CallStackInfo {
  function: string;
  file: string;
  flowchart?: string;
  sequence?: string;
}

export interface AIReviewDecoration {
  line: number;
  type: 'issue' | 'callstack';
  severity?: 'critical' | 'warning' | 'suggestion';
  data: AIReviewComment | CallStackInfo;
}

/**
 * Process AI review data for a specific file and create decorations
 * Note: Call stack decorations need line numbers to be set by the caller
 * (after detecting function definitions in the code)
 */
export function processAIReviewForFile(
  filePath: string,
  issues: AIReviewComment[] = [],
  callStacks: CallStackInfo[] = []
): AIReviewDecoration[] {
  const decorations: AIReviewDecoration[] = [];

  console.log('[processAIReviewForFile] Processing file:', filePath);
  console.log('[processAIReviewForFile] Issues:', issues.length);
  console.log('[processAIReviewForFile] Call stacks:', callStacks.length);

  // Add issue decorations
  for (const issue of issues) {
    if (issue.file === filePath) {
      decorations.push({
        line: issue.line,
        type: 'issue',
        severity: issue.severity,
        data: issue,
      });
    }
  }

  // Add call stack decorations
  // Note: Line number will be set to 1 as placeholder
  // The caller should update it after detecting function definitions
  for (const callStack of callStacks) {
    // Normalize file paths for comparison (handle both relative and absolute paths)
    const normalizedCallStackFile = callStack.file.replace(/^\.\//, '');
    const normalizedFilePath = filePath.replace(/^\.\//, '');

    if (normalizedCallStackFile === normalizedFilePath ||
        callStack.file.endsWith(normalizedFilePath) ||
        normalizedFilePath.endsWith(normalizedCallStackFile)) {
      console.log('[processAIReviewForFile] Adding call stack for function:', callStack.function);
      decorations.push({
        line: 1, // Placeholder - will be updated by parent
        type: 'callstack',
        data: callStack,
      });
    }
  }

  console.log('[processAIReviewForFile] Total decorations:', decorations.length);
  return decorations;
}

/**
 * Escape special characters in string for use in RegExp
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract function name from various formats
 * e.g., "functionName", "ClassName.methodName", "functionName()", etc.
 */
function extractFunctionName(fullName: string): string {
  // Remove parentheses if present
  let name = fullName.replace(/\(.*\)$/, '').trim();

  // If it's a method (Class.method), extract the method name
  if (name.includes('.')) {
    name = name.split('.').pop() || name;
  }

  return name;
}

/**
 * Detect function definitions in code and return their line numbers
 */
export function detectFunctionLines(
  code: string,
  functionName: string
): number[] {
  const lines = code.split('\n');
  const functionLines: number[] = [];

  // Extract clean function name
  const cleanName = extractFunctionName(functionName);
  const escapedName = escapeRegExp(cleanName);

  console.log('[detectFunctionLines] Looking for function:', cleanName, 'from:', functionName);

  // Patterns to match function definitions
  const patterns = [
    // TypeScript/JavaScript function declarations: function foo()
    new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+${escapedName}\\s*[<(]`),

    // Arrow functions as const/let/var: const foo = () =>
    new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+${escapedName}\\s*[:=]\\s*(?:async\\s+)?\\([^)]*\\)\\s*=>`),

    // Arrow functions without params: const foo = async () =>
    new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+${escapedName}\\s*[:=]\\s*(?:async\\s+)?\\(\\)\\s*=>`),

    // Class methods: public async foo()
    new RegExp(`^\\s*(?:public|private|protected)?\\s*(?:static)?\\s*(?:async)?\\s*${escapedName}\\s*[<(]`),

    // Object method shorthand: foo() { or foo: function()
    new RegExp(`^\\s*${escapedName}\\s*\\([^)]*\\)\\s*[:{]`),

    // Object method with function keyword: foo: function()
    new RegExp(`^\\s*${escapedName}\\s*:\\s*(?:async\\s+)?function\\s*\\(`),

    // Object method arrow function: foo: () =>
    new RegExp(`^\\s*${escapedName}\\s*:\\s*(?:async\\s+)?\\([^)]*\\)\\s*=>`),

    // TypeScript function with type: function foo<T>(): Type
    new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${escapedName}<[^>]+>\\s*\\(`),

    // React functional component: const Foo: React.FC
    new RegExp(`^\\s*(?:export\\s+)?const\\s+${escapedName}\\s*:\\s*(?:React\\.)?(?:FC|FunctionComponent)`),
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        functionLines.push(i + 1); // Monaco uses 1-based line numbers
        console.log('[detectFunctionLines] Found match at line', i + 1, ':', line.substring(0, 60));
        break;
      }
    }
  }

  if (functionLines.length === 0) {
    console.warn('[detectFunctionLines] No matches found for:', cleanName);
    console.log('[detectFunctionLines] Sample lines:', lines.slice(0, 10).map((l, i) => `${i + 1}: ${l.substring(0, 60)}`));
  }

  return functionLines;
}

/**
 * Create Monaco editor decorations for AI review items
 */
export function createAIReviewDecorations(
  decorations: AIReviewDecoration[]
): monaco.editor.IModelDeltaDecoration[] {
  console.log('[createAIReviewDecorations] Creating decorations for', decorations.length, 'items');

  return decorations.map((decoration, index) => {
    let glyphClassName: string;
    let hoverMessage: string;

    if (decoration.type === 'issue') {
      const issue = decoration.data as AIReviewComment;
      console.log(`[createAIReviewDecorations] Issue ${index}: severity=${decoration.severity}, line=${decoration.line}`);

      // Set glyph class based on severity
      switch (decoration.severity) {
        case 'critical':
          glyphClassName = 'ai-review-critical-glyph';
          break;
        case 'warning':
          glyphClassName = 'ai-review-warning-glyph';
          break;
        case 'suggestion':
          glyphClassName = 'ai-review-suggestion-glyph';
          break;
        default:
          console.warn('[createAIReviewDecorations] Unknown severity:', decoration.severity, '- defaulting to suggestion');
          glyphClassName = 'ai-review-suggestion-glyph';
      }
      hoverMessage = `${issue.severity.toUpperCase()}: ${issue.message}`;
    } else {
      // Call stack decoration
      const callStack = decoration.data as CallStackInfo;
      console.log(`[createAIReviewDecorations] CallStack ${index}: function=${callStack.function}, line=${decoration.line}`);
      glyphClassName = 'ai-review-callstack-glyph';
      hoverMessage = `Call Stack: ${callStack.function}`;
    }

    console.log(`[createAIReviewDecorations] Decoration ${index}: className=${glyphClassName}, line=${decoration.line}`);

    return {
      range: new monaco.Range(decoration.line, 1, decoration.line, 1),
      options: {
        glyphMarginClassName: glyphClassName,
        glyphMarginHoverMessage: { value: hoverMessage },
      },
    };
  });
}

/**
 * Get CSS styles for AI review glyph margin icons
 * Using brighter colors as default for visibility without hover
 * High specificity to override Monaco's default classes
 */
export function getAIReviewStyles(): string {
  return `
    /* AI Review - Critical Issue (Red) */
    .monaco-editor .cgmr.codicon.ai-review-critical-glyph,
    .cgmr.codicon.ai-review-critical-glyph,
    .ai-review-critical-glyph {
      background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="rgb(220, 38, 38)"><circle cx="8" cy="8" r="7" fill="rgb(220, 38, 38)"/><text x="8" y="12" text-anchor="middle" font-size="12" font-weight="bold" fill="white">!</text></svg>') center center no-repeat !important;
      background-size: 16px 16px !important;
      cursor: pointer !important;
    }
    .monaco-editor .cgmr.codicon.ai-review-critical-glyph::before,
    .cgmr.codicon.ai-review-critical-glyph::before,
    .ai-review-critical-glyph::before {
      content: none !important;
      display: none !important;
    }
    .monaco-editor .cgmr.codicon.ai-review-critical-glyph:hover,
    .cgmr.codicon.ai-review-critical-glyph:hover,
    .ai-review-critical-glyph:hover {
      background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="rgb(185, 28, 28)"><circle cx="8" cy="8" r="7" fill="rgb(185, 28, 28)"/><text x="8" y="12" text-anchor="middle" font-size="12" font-weight="bold" fill="white">!</text></svg>') center center no-repeat !important;
      background-size: 16px 16px !important;
    }
    .monaco-editor .cgmr.codicon.ai-review-critical-glyph:hover::before,
    .cgmr.codicon.ai-review-critical-glyph:hover::before,
    .ai-review-critical-glyph:hover::before {
      content: none !important;
      display: none !important;
    }

    /* AI Review - Warning (Yellow) */
    .monaco-editor .cgmr.codicon.ai-review-warning-glyph,
    .cgmr.codicon.ai-review-warning-glyph,
    .ai-review-warning-glyph {
      background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="rgb(245, 158, 11)"><path d="M8 1 L15 14 L1 14 Z" fill="rgb(245, 158, 11)"/><text x="8" y="12" text-anchor="middle" font-size="10" font-weight="bold" fill="rgb(31, 41, 55)">!</text></svg>') center center no-repeat !important;
      background-size: 16px 16px !important;
      cursor: pointer !important;
    }
    .monaco-editor .cgmr.codicon.ai-review-warning-glyph::before,
    .cgmr.codicon.ai-review-warning-glyph::before,
    .ai-review-warning-glyph::before {
      content: none !important;
      display: none !important;
    }
    .monaco-editor .cgmr.codicon.ai-review-warning-glyph:hover,
    .cgmr.codicon.ai-review-warning-glyph:hover,
    .ai-review-warning-glyph:hover {
      background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="rgb(217, 119, 6)"><path d="M8 1 L15 14 L1 14 Z" fill="rgb(217, 119, 6)"/><text x="8" y="12" text-anchor="middle" font-size="10" font-weight="bold" fill="rgb(31, 41, 55)">!</text></svg>') center center no-repeat !important;
      background-size: 16px 16px !important;
    }
    .monaco-editor .cgmr.codicon.ai-review-warning-glyph:hover::before,
    .cgmr.codicon.ai-review-warning-glyph:hover::before,
    .ai-review-warning-glyph:hover::before {
      content: none !important;
      display: none !important;
    }

    /* AI Review - Suggestion (Blue) */
    .monaco-editor .cgmr.codicon.ai-review-suggestion-glyph,
    .cgmr.codicon.ai-review-suggestion-glyph,
    .ai-review-suggestion-glyph {
      background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="rgb(37, 99, 235)"><circle cx="8" cy="8" r="7" fill="rgb(37, 99, 235)"/><text x="8" y="12" text-anchor="middle" font-size="12" font-weight="bold" fill="white">i</text></svg>') center center no-repeat !important;
      background-size: 16px 16px !important;
      cursor: pointer !important;
    }
    .monaco-editor .cgmr.codicon.ai-review-suggestion-glyph::before,
    .cgmr.codicon.ai-review-suggestion-glyph::before,
    .ai-review-suggestion-glyph::before {
      content: none !important;
      display: none !important;
    }
    .monaco-editor .cgmr.codicon.ai-review-suggestion-glyph:hover,
    .cgmr.codicon.ai-review-suggestion-glyph:hover,
    .ai-review-suggestion-glyph:hover {
      background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="rgb(29, 78, 216)"><circle cx="8" cy="8" r="7" fill="rgb(29, 78, 216)"/><text x="8" y="12" text-anchor="middle" font-size="12" font-weight="bold" fill="white">i</text></svg>') center center no-repeat !important;
      background-size: 16px 16px !important;
    }
    .monaco-editor .cgmr.codicon.ai-review-suggestion-glyph:hover::before,
    .cgmr.codicon.ai-review-suggestion-glyph:hover::before,
    .ai-review-suggestion-glyph:hover::before {
      content: none !important;
      display: none !important;
    }

    /* AI Review - Call Stack (Purple) */
    .monaco-editor .cgmr.codicon.ai-review-callstack-glyph,
    .cgmr.codicon.ai-review-callstack-glyph,
    .ai-review-callstack-glyph {
      background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="rgb(124, 58, 237)"><rect x="2" y="2" width="12" height="3" rx="1" fill="rgb(124, 58, 237)"/><rect x="2" y="6" width="12" height="3" rx="1" fill="rgb(124, 58, 237)"/><rect x="2" y="10" width="12" height="3" rx="1" fill="rgb(124, 58, 237)"/></svg>') center center no-repeat !important;
      background-size: 16px 16px !important;
      cursor: pointer !important;
    }
    .monaco-editor .cgmr.codicon.ai-review-callstack-glyph::before,
    .cgmr.codicon.ai-review-callstack-glyph::before,
    .ai-review-callstack-glyph::before {
      content: none !important;
      display: none !important;
    }
    .monaco-editor .cgmr.codicon.ai-review-callstack-glyph:hover,
    .cgmr.codicon.ai-review-callstack-glyph:hover,
    .ai-review-callstack-glyph:hover {
      background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="rgb(109, 40, 217)"><rect x="2" y="2" width="12" height="3" rx="1" fill="rgb(109, 40, 217)"/><rect x="2" y="6" width="12" height="3" rx="1" fill="rgb(109, 40, 217)"/><rect x="2" y="10" width="12" height="3" rx="1" fill="rgb(109, 40, 217)"/></svg>') center center no-repeat !important;
      background-size: 16px 16px !important;
    }
    .monaco-editor .cgmr.codicon.ai-review-callstack-glyph:hover::before,
    .cgmr.codicon.ai-review-callstack-glyph:hover::before,
    .ai-review-callstack-glyph:hover::before {
      content: none !important;
      display: none !important;
    }

    /* Add comment button on line hover */
    .monaco-editor .line-numbers {
      position: relative;
    }
    .add-comment-button {
      position: absolute;
      left: -20px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgb(37, 99, 235);
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
      line-height: 1;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 10;
    }
    .add-comment-button:hover {
      background: rgb(29, 78, 216);
      opacity: 1 !important;
    }
    .monaco-editor .view-line:hover ~ .add-comment-button,
    .monaco-editor .margin-view-overlays .line-numbers:hover .add-comment-button {
      opacity: 0.7;
    }
  `;
}

/**
 * Find the decoration at a specific line
 */
export function findDecorationAtLine(
  decorations: AIReviewDecoration[],
  lineNumber: number
): AIReviewDecoration | undefined {
  return decorations.find((d) => d.line === lineNumber);
}
