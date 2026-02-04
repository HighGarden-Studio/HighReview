/**
 * Unified reference parser for various reference types
 * Supports: @file, @issue, @change, @impact, @semantic
 */

export type ReferenceType = 'file' | 'issue' | 'change' | 'impact' | 'semantic' | 'refactor' | 'callstack';

export interface BaseReference {
  raw: string; // Original reference string
  type: ReferenceType;
}

export interface FileReference extends BaseReference {
  type: 'file';
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
}

export interface IssueReference extends BaseReference {
  type: 'issue';
  issueId: string; // Could be numeric index or unique identifier
}

export interface ChangeReference extends BaseReference {
  type: 'change';
  changeId: string;
}

export interface ImpactReference extends BaseReference {
  type: 'impact';
  impactId: string;
}

export interface SemanticReference extends BaseReference {
  type: 'semantic';
  semanticId: string;
}

export interface RefactorReference extends BaseReference {
  type: 'refactor';
  refactorId: string;
}

export interface CallStackReference extends BaseReference {
  type: 'callstack';
  stackId: string;
}

export type Reference =
  | FileReference
  | IssueReference
  | ChangeReference
  | ImpactReference
  | SemanticReference
  | RefactorReference
  | CallStackReference;

export interface ResolvedReference {
  reference: Reference;
  content: string;
  title: string;
  exists: boolean;
}

/**
 * Parse all types of references from a message
 */
export function parseReferences(message: string): Reference[] {
  const references: Reference[] = [];

  // Pattern: @type:value or @type:value:extra
  // Supports quotes for values with spaces: @file:"path with space.ts"
  const regex = /@(file|issue|change|impact|semantic|refactor|callstack):((?:"[^"]+")|[^\s]+)/gi;
  let match;

  while ((match = regex.exec(message)) !== null) {
    const raw = match[0];
    const type = match[1].toLowerCase() as ReferenceType;
    let value = match[2];

    // Strip quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }

    if (type === 'file') {
      // Parse file reference: path:line or path:startLine-endLine
      const colonIndex = value.lastIndexOf(':');
      let filePath = value;
      let lineStart: number | undefined;
      let lineEnd: number | undefined;

      if (colonIndex > 0) {
        filePath = value.substring(0, colonIndex);
        const lineSpec = value.substring(colonIndex + 1);

        if (lineSpec.includes('-')) {
          const [start, end] = lineSpec.split('-').map((s) => parseInt(s, 10));
          lineStart = start;
          lineEnd = end;
        } else {
          const line = parseInt(lineSpec, 10);
          if (!isNaN(line)) {
            lineStart = line;
          }
        }
      }

      references.push({
        raw,
        type: 'file',
        filePath,
        lineStart,
        lineEnd,
      } as FileReference);
    } else if (type === 'issue') {
      references.push({
        raw,
        type: 'issue',
        issueId: value,
      } as IssueReference);
    } else if (type === 'change') {
      references.push({
        raw,
        type: 'change',
        changeId: value,
      } as ChangeReference);
    } else if (type === 'impact') {
      references.push({
        raw,
        type: 'impact',
        impactId: value,
      } as ImpactReference);
    } else if (type === 'semantic') {
      references.push({
        raw,
        type: 'semantic',
        semanticId: value,
      } as SemanticReference);
    } else if (type === 'refactor') {
      references.push({
        raw,
        type: 'refactor',
        refactorId: value,
      } as RefactorReference);
    } else if (type === 'callstack') {
      references.push({
        raw,
        type: 'callstack',
        stackId: value,
      } as CallStackReference);
    }
  }

  return references;
}

/**
 * Extract file content based on line range
 */
function extractLines(content: string, lineStart?: number, lineEnd?: number): string {
  if (!lineStart) {
    return content;
  }

  const lines = content.split('\n');
  const start = Math.max(0, lineStart - 1);
  const end = lineEnd ? Math.min(lines.length, lineEnd) : lineStart;

  return lines.slice(start, end).join('\n');
}

/**
 * Resolve references by fetching their content
 */
export async function resolveReferences(
  references: Reference[],
  workingDirectory: string,
  aiReviewData?: any
): Promise<ResolvedReference[]> {
  const resolved: ResolvedReference[] = [];

  // Group by type for efficient resolution
  const fileRefs = references.filter(r => r.type === 'file') as FileReference[];
  const issueRefs = references.filter(r => r.type === 'issue') as IssueReference[];
  const changeRefs = references.filter(r => r.type === 'change') as ChangeReference[];
  const impactRefs = references.filter(r => r.type === 'impact') as ImpactReference[];
  const semanticRefs = references.filter((r) => r.type === 'semantic') as SemanticReference[];
  const refactorRefs = references.filter((r) => r.type === 'refactor') as RefactorReference[];
  const callstackRefs = references.filter((r) => r.type === 'callstack') as CallStackReference[];

  // Resolve file references
  if (fileRefs.length > 0) {
    const uniqueFilePaths = Array.from(new Set(fileRefs.map(ref => ref.filePath)));

    try {
      const response = await fetch('/api/ai/read-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePaths: uniqueFilePaths,
          workingDirectory,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const filesMap = new Map<string, { content: string; exists: boolean }>(
          result.files.map((f: any) => [f.path, { content: f.content, exists: f.exists }])
        );

        for (const ref of fileRefs) {
          const fileData = filesMap.get(ref.filePath);
          if (fileData?.exists) {
            const content = extractLines(fileData.content, ref.lineStart, ref.lineEnd);
            const title = ref.lineStart
              ? ref.lineEnd
                ? `${ref.filePath} (lines ${ref.lineStart}-${ref.lineEnd})`
                : `${ref.filePath} (line ${ref.lineStart})`
              : ref.filePath;

            resolved.push({
              reference: ref,
              content,
              title,
              exists: true,
            });
          } else {
            resolved.push({
              reference: ref,
              content: '',
              title: ref.filePath,
              exists: false,
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to resolve file references:', error);
    }
  }

  // Resolve issue references
  if (issueRefs.length > 0 && aiReviewData?.issues) {
    for (const ref of issueRefs) {
      const issueIndex = parseInt(ref.issueId, 10) - 1; // 1-based to 0-based
      const issue = aiReviewData.issues[issueIndex];

      if (issue) {
        const content = `**File:** ${issue.file}:${issue.line}
**Severity:** ${issue.severity}
**Category:** ${issue.category}
**Message:** ${issue.message}
${issue.suggestion ? `**Suggestion:** ${issue.suggestion}` : ''}`;

        resolved.push({
          reference: ref,
          content,
          title: `Issue #${issueIndex + 1}: ${issue.category}`,
          exists: true,
        });
      } else {
        resolved.push({
          reference: ref,
          content: '',
          title: `Issue #${ref.issueId}`,
          exists: false,
        });
      }
    }
  }

  // Resolve change intent references
  if (changeRefs.length > 0 && aiReviewData?.changeIntents) {
    for (const ref of changeRefs) {
      const changeIndex = parseInt(ref.changeId, 10) - 1; // 1-based to 0-based
      const change = aiReviewData.changeIntents[changeIndex];

      if (change) {
        const content = `**File:** ${change.file}
**Level:** ${change.level}
**Intent:** ${change.intent}
**Motivation:** ${change.motivation}
${change.impact ? `**Impact:** ${change.impact}` : ''}`;

        resolved.push({
          reference: ref,
          content,
          title: `Change #${changeIndex + 1}: ${change.intent}`,
          exists: true,
        });
      } else {
        resolved.push({
          reference: ref,
          content: '',
          title: `Change #${ref.changeId}`,
          exists: false,
        });
      }
    }
  }

  // Resolve impact references
  if (impactRefs.length > 0 && aiReviewData?.impactAnalysis) {
    for (const ref of impactRefs) {
      // Simply resolve impact analysis regardless of ID (as there is only one global impact analysis)
      // expecting user to use @impact:1 but just robustly handling existence
      const impact = aiReviewData.impactAnalysis;
      const content = `**Scope:** ${impact.scope || 'N/A'}
**Affected Areas:** ${impact.affectedAreas?.join(', ') || 'None'}
**Breaking Changes:** ${impact.breakingChanges?.length > 0 ? '\n' + impact.breakingChanges.map((bc: string) => `- ${bc}`).join('\n') : 'None'}
**Side Effects:** ${impact.sideEffects?.length > 0 ? '\n' + impact.sideEffects.map((se: string) => `- ${se}`).join('\n') : 'None'}`;

      resolved.push({
        reference: ref,
        content,
        title: 'Impact Analysis',
        exists: true,
      });
    }
  }

  // Resolve callstack references
  if (callstackRefs.length > 0 && aiReviewData?.callStacks) {
    for (const ref of callstackRefs) {
      const stackIndex = parseInt(ref.stackId, 10) - 1; // 1-based to 0-based
      const stack = aiReviewData.callStacks[stackIndex];

      if (stack) {
        const content = `**Function:** ${stack.function}
**File:** ${stack.file}
**Stack Trace:**
${stack.stack?.map((s: string) => `- ${s}`).join('\n') || 'N/A'}`;

        resolved.push({
          reference: ref,
          content,
          title: `Call Stack #${stackIndex + 1}: ${stack.function}`,
          exists: true,
        });
      } else {
        resolved.push({
          reference: ref,
          content: '',
          title: `Call Stack #${ref.stackId}`,
          exists: false,
        });
      }
    }
  }

  // Resolve semantic references (Moved Code)
  if (semanticRefs.length > 0 && aiReviewData?.movedCode) {
    for (const ref of semanticRefs) {
      const semanticIndex = parseInt(ref.semanticId, 10) - 1; // 1-based to 0-based
      const moved = aiReviewData.movedCode[semanticIndex];

      if (moved) {
        const content = `**Type:** Moved Code
**From:** ${moved.from}
**To:** ${moved.to}
**Lines:** ${moved.lines}`;

        resolved.push({
          reference: ref,
          content,
          title: `Moved Code #${semanticIndex + 1}`,
          exists: true,
        });
      } else {
        resolved.push({
          reference: ref,
          content: '',
          title: `Semantic #${ref.semanticId}`,
          exists: false,
        });
      }
    }
  }

  // Resolve refactor references
  if (refactorRefs.length > 0 && aiReviewData?.refactorings) {
    for (const ref of refactorRefs) {
      const refactorIndex = parseInt(ref.refactorId, 10) - 1; // 1-based to 0-based
      const refactor = aiReviewData.refactorings[refactorIndex];

      if (refactor) {
        const content = `**Type:** ${refactor.type}
**Description:** ${refactor.description}
**Files:** ${refactor.files.join(', ')}`;

        resolved.push({
          reference: ref,
          content,
          title: `Refactoring #${refactorIndex + 1}: ${refactor.type}`,
          exists: true,
        });
      } else {
        resolved.push({
          reference: ref,
          content: '',
          title: `Refactor #${ref.refactorId}`,
          exists: false,
        });
      }
    }
  }

  return resolved;
}

/**
 * Remove references from message text
 */
export function stripReferences(message: string): string {
  return message.replace(/@(file|issue|change|impact|semantic|callstack):(?:(?:"[^"]+")|[^\s]+)/gi, '').trim();
}

/**
 * Format resolved references as context string for AI
 */
export function formatReferencesForContext(references: ResolvedReference[]): string {
  if (references.length === 0) {
    return '';
  }

  return references
    .filter(ref => ref.exists)
    .map(ref => {
      return `### ${ref.title}\n\`\`\`\n${ref.content}\n\`\`\``;
    })
    .join('\n\n');
}
