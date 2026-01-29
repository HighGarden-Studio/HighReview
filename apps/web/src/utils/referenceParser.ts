/**
 * Unified reference parser for various reference types
 * Supports: @file, @issue, @change, @impact, @semantic
 */

export type ReferenceType = 'file' | 'issue' | 'change' | 'impact' | 'semantic';

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

export type Reference = FileReference | IssueReference | ChangeReference | ImpactReference | SemanticReference;

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
  // Examples:
  // - @file:src/utils/parser.ts:50-100
  // - @issue:5
  // - @change:2
  // - @impact:0
  // - @semantic:1
  const regex = /@(file|issue|change|impact|semantic):([^\s]+)/g;
  let match;

  while ((match = regex.exec(message)) !== null) {
    const raw = match[0];
    const type = match[1] as ReferenceType;
    const value = match[2];

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
          const [start, end] = lineSpec.split('-').map(s => parseInt(s, 10));
          lineStart = start;
          lineEnd = end;
        } else {
          lineStart = parseInt(lineSpec, 10);
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
  const semanticRefs = references.filter(r => r.type === 'semantic') as SemanticReference[];

  // Resolve file references
  if (fileRefs.length > 0) {
    const uniqueFilePaths = [...new Set(fileRefs.map(ref => ref.filePath))];

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
        const filesMap = new Map(
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
      const issueIndex = parseInt(ref.issueId, 10);
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
          title: `Issue #${issueIndex}: ${issue.category}`,
          exists: true,
        });
      } else {
        resolved.push({
          reference: ref,
          content: '',
          title: `Issue #${issueIndex}`,
          exists: false,
        });
      }
    }
  }

  // Resolve change intent references
  if (changeRefs.length > 0 && aiReviewData?.changeIntents) {
    for (const ref of changeRefs) {
      const changeIndex = parseInt(ref.changeId, 10);
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
          title: `Change #${changeIndex}: ${change.intent}`,
          exists: true,
        });
      } else {
        resolved.push({
          reference: ref,
          content: '',
          title: `Change #${changeIndex}`,
          exists: false,
        });
      }
    }
  }

  // Resolve impact references
  if (impactRefs.length > 0 && aiReviewData?.impactAnalysis) {
    for (const ref of impactRefs) {
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

  // Resolve semantic references
  if (semanticRefs.length > 0 && aiReviewData?.semanticInfo) {
    for (const ref of semanticRefs) {
      const semanticIndex = parseInt(ref.semanticId, 10);
      const semantic = aiReviewData.semanticInfo[semanticIndex];

      if (semantic) {
        const content = `**Type:** ${semantic.type}
**Description:** ${semantic.description}
${semantic.details ? `**Details:** ${semantic.details}` : ''}`;

        resolved.push({
          reference: ref,
          content,
          title: `Semantic #${semanticIndex}`,
          exists: true,
        });
      } else {
        resolved.push({
          reference: ref,
          content: '',
          title: `Semantic #${semanticIndex}`,
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
  return message.replace(/@(file|issue|change|impact|semantic):[^\s]+/g, '').trim();
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
