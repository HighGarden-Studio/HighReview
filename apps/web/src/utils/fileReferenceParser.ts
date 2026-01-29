/**
 * File reference format: @filepath or @filepath:line or @filepath:startLine-endLine
 * Examples:
 * - @src/components/ChatPanel.tsx
 * - @src/components/ChatPanel.tsx:50
 * - @src/components/ChatPanel.tsx:50-100
 */

export interface FileReference {
  raw: string; // Original @filepath:line string
  filePath: string; // Extracted file path
  lineStart?: number; // Starting line number
  lineEnd?: number; // Ending line number (for ranges)
}

export interface ResolvedFileReference extends FileReference {
  content: string; // File content (full or excerpt)
  exists: boolean; // Whether file was found
}

/**
 * Parse file references from a message
 * @param message Message text containing @file:line references
 * @returns Array of FileReference objects
 */
export function parseFileReferences(message: string): FileReference[] {
  // Match @filepath or @filepath:line or @filepath:startLine-endLine
  // Filepath can contain: letters, numbers, /, -, _, .
  const regex = /@([\w\/\-_.]+(?:\.\w+)?(?::(\d+)(?:-(\d+))?)?)/g;
  const references: FileReference[] = [];
  let match;

  while ((match = regex.exec(message)) !== null) {
    const raw = match[0];
    const fullPath = match[1];
    const lineStart = match[2] ? parseInt(match[2], 10) : undefined;
    const lineEnd = match[3] ? parseInt(match[3], 10) : undefined;

    // Extract just the file path (before :line)
    const colonIndex = fullPath.indexOf(':');
    const filePath = colonIndex > 0 ? fullPath.substring(0, colonIndex) : fullPath;

    references.push({
      raw,
      filePath,
      lineStart,
      lineEnd,
    });
  }

  return references;
}

/**
 * Extract file content based on line range
 * @param content Full file content
 * @param lineStart Starting line (1-indexed)
 * @param lineEnd Ending line (1-indexed, optional)
 * @returns Extracted content
 */
export function extractLines(content: string, lineStart?: number, lineEnd?: number): string {
  if (!lineStart) {
    return content; // Return full content if no line specified
  }

  const lines = content.split('\n');
  const start = Math.max(0, lineStart - 1); // Convert to 0-indexed
  const end = lineEnd ? Math.min(lines.length, lineEnd) : lineStart;

  return lines.slice(start, end).join('\n');
}

/**
 * Resolve file references by reading file contents
 * @param references Array of FileReference objects
 * @param workingDirectory Working directory path
 * @returns Array of ResolvedFileReference objects
 */
export async function resolveFileReferences(
  references: FileReference[],
  workingDirectory: string
): Promise<ResolvedFileReference[]> {
  if (references.length === 0) {
    return [];
  }

  try {
    // Get unique file paths
    const uniqueFilePaths = [...new Set(references.map(ref => ref.filePath))];

    // Read all files at once
    const response = await fetch('/api/ai/read-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePaths: uniqueFilePaths,
        workingDirectory,
      }),
    });

    if (!response.ok) {
      console.error('Failed to read files:', await response.text());
      return references.map(ref => ({
        ...ref,
        content: '',
        exists: false,
      }));
    }

    const result = await response.json();
    const filesMap = new Map<string, { content: string; exists: boolean }>(
      result.files.map((f: any) => [f.path, { content: f.content, exists: f.exists }])
    );

    // Resolve each reference with appropriate content
    return references.map(ref => {
      const fileData = filesMap.get(ref.filePath);
      if (!fileData || !fileData.exists) {
        return {
          ...ref,
          content: '',
          exists: false,
        };
      }

      const content = extractLines(fileData.content, ref.lineStart, ref.lineEnd);
      return {
        ...ref,
        content,
        exists: true,
      };
    });
  } catch (error) {
    console.error('Error resolving file references:', error);
    return references.map(ref => ({
      ...ref,
      content: '',
      exists: false,
    }));
  }
}

/**
 * Remove file references from message text
 * @param message Original message with @file:line references
 * @returns Message with references removed
 */
export function stripFileReferences(message: string): string {
  return message.replace(/@[\w\/\-_.]+(?:\.\w+)?(?::\d+(?:-\d+)?)?/g, '').trim();
}

/**
 * Format resolved file references as context string for AI
 * @param references Array of ResolvedFileReference objects
 * @returns Formatted context string
 */
export function formatFileReferencesForContext(references: ResolvedFileReference[]): string {
  if (references.length === 0) {
    return '';
  }

  return references
    .filter(ref => ref.exists)
    .map(ref => {
      const header = ref.lineStart
        ? ref.lineEnd
          ? `${ref.filePath} (lines ${ref.lineStart}-${ref.lineEnd})`
          : `${ref.filePath} (line ${ref.lineStart})`
        : ref.filePath;

      return `File: ${header}\n\`\`\`\n${ref.content}\n\`\`\``;
    })
    .join('\n\n');
}
