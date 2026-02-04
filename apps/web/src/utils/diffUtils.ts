import type { PRFile } from '../pages/ReviewPage';

/**
 * Extracts changed lines from PR files diff hunks.
 * Returns a map of file path to a Set of changed line numbers (1-based).
 */
export function extractChangedLines(files: PRFile[]): Record<string, Set<number>> {
  const changedLines: Record<string, Set<number>> = {};

  files.forEach((file) => {
    if (!file.patch) return;

    const lines = new Set<number>();
    const patch = file.patch;
    const patchLines = patch.split('\n');
    let currentLine = 0;

    patchLines.forEach((line) => {
      // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@
      const hunkHeader = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (hunkHeader) {
        currentLine = parseInt(hunkHeader[1], 10);
        return;
      }

      // Context line (unchanged)
      if (line.startsWith(' ')) {
        currentLine++;
        return;
      }

      // Added line
      if (line.startsWith('+')) {
        lines.add(currentLine);
        currentLine++;
        return;
      }

      // Removed line (starts with -) - we don't track these for issues mapping in the new file
      // No increment for currentLine because it refers to the new file
    });

    changedLines[file.path] = lines;
  });

  return changedLines;
}
