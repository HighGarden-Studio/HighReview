/**
 * Parser for Korean-style AI review responses
 * Handles format: ### N. Title \n **파일**: path \n **심각도**: CRITICAL
 */

interface ReviewComment {
  file: string;
  line: number;
  severity: 'critical' | 'warning' | 'suggestion';
  category: string;
  message: string;
  suggestion?: string;
}

export class AIReviewKoreanParser {
  /**
   * Parse Korean-style review format
   * Example:
   * ### 1. 인증 취약점 - API Key 유출 위험
   * **파일**: `app/api/internal/network_campaigns_api.rb:8-16`
   * **심각도**: CRITICAL
   * **카테고리**: Security
   * **문제점**: ...
   */
  static parseKoreanFormat(text: string): ReviewComment[] {
    const comments: ReviewComment[] = [];
    const lines = text.split('\n');

    let currentIssue: Partial<ReviewComment> & { title?: string } | null = null;
    let inCodeBlock = false;
    let collectingMessage = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track code blocks
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        // Save current issue before code block
        if (inCodeBlock && currentIssue) {
          this.finalizeIssue(currentIssue, comments);
          currentIssue = null;
        }
        collectingMessage = false;
        continue;
      }

      if (inCodeBlock) continue;

      // Check for issue header: ### N. Title
      const issueHeaderMatch = line.match(/^###\s+\d+\.\s+(.+)/);
      if (issueHeaderMatch) {
        // Save previous issue
        if (currentIssue) {
          this.finalizeIssue(currentIssue, comments);
        }

        currentIssue = {
          title: issueHeaderMatch[1].trim(),
          severity: 'suggestion',
          category: 'Code Review',
          message: '',
          line: 1,
        };
        collectingMessage = false;
        continue;
      }

      if (!currentIssue) continue;

      // Check for **파일**: or **File**: with backticks
      const fileMatch = line.match(/\*\*(?:파일|File)\*\*:\s*`([^`]+)`/);
      if (fileMatch) {
        const filePath = fileMatch[1].trim();
        // Extract file:line or file:line-line2
        const pathMatch = filePath.match(/^([^:]+?)(?::(\d+)(?:-\d+)?)?$/);
        if (pathMatch) {
          currentIssue.file = pathMatch[1];
          currentIssue.line = pathMatch[2] ? parseInt(pathMatch[2], 10) : 1;
        }
        continue;
      }

      // Check for **심각도**: or **Severity**:
      const severityMatch = line.match(/\*\*(?:심각도|Severity)\*\*:\s*(CRITICAL|WARNING|SUGGESTION|Info)/i);
      if (severityMatch) {
        const sev = severityMatch[1].toUpperCase();
        if (sev === 'CRITICAL') currentIssue.severity = 'critical';
        else if (sev === 'WARNING') currentIssue.severity = 'warning';
        else currentIssue.severity = 'suggestion';
        continue;
      }

      // Check for **카테고리**: or **Category**:
      const categoryMatch = line.match(/\*\*(?:카테고리|Category)\*\*:\s*(.+?)(?:\s*$)/);
      if (categoryMatch) {
        currentIssue.category = categoryMatch[1].trim().replace(/\s+$/, '');
        continue;
      }

      // Check for **문제점**: or **Problem**: - start collecting message
      if (line.match(/\*\*(?:문제점|Problem|Issue|Description)\*\*:/)) {
        collectingMessage = true;
        continue;
      }

      // Check for **수정 제안**: or **Suggestion**: - start collecting suggestion
      if (line.match(/\*\*(?:수정 제안|Suggestion|Fix|Solution)\*\*:/)) {
        collectingMessage = false; // Stop collecting main message
        continue;
      }

      // Collect message lines
      if (currentIssue.file) {
        const trimmed = line.trim();

        // Skip empty lines, markdown headers, horizontal rules
        if (!trimmed || trimmed.startsWith('##') || trimmed === '---') {
          // Empty line might signal end of this issue if we have enough message
          if (!trimmed && currentIssue.message && currentIssue.message.length > 50) {
            this.finalizeIssue(currentIssue, comments);
            currentIssue = null;
          }
          continue;
        }

        // Skip lines that are just markdown bold labels
        if (trimmed.match(/^\*\*[^*]+\*\*:?\s*$/)) {
          continue;
        }

        // Add to message if collecting
        if (collectingMessage || !currentIssue.message) {
          // Remove markdown list markers
          let content = trimmed;
          if (content.startsWith('-') || content.startsWith('*') || content.startsWith('•')) {
            content = content.substring(1).trim();
          }

          // Skip very short lines or code-like lines
          if (content.length > 5 && !content.match(/^(end|return|else|if|def|class|function|const|let|var)\s/)) {
            if (!currentIssue.message) {
              currentIssue.message = content;
              collectingMessage = true;
            } else {
              currentIssue.message += '\n' + content;
            }
          }
        }
      }
    }

    // Finalize last issue
    if (currentIssue) {
      this.finalizeIssue(currentIssue, comments);
    }

    console.log(`[Korean Parser] Extracted ${comments.length} issues`);
    return comments;
  }

  private static finalizeIssue(
    issue: Partial<ReviewComment> & { title?: string },
    comments: ReviewComment[]
  ): void {
    if (!issue.file || !issue.message) {
      return; // Skip incomplete issues
    }

    // Ensure message is substantial (at least 20 characters)
    if (issue.message.length < 20) {
      return;
    }

    // Add title to beginning of message if available
    let finalMessage = issue.message;
    if (issue.title && !finalMessage.includes(issue.title)) {
      finalMessage = `${issue.title}\n\n${finalMessage}`;
    }

    comments.push({
      file: issue.file,
      line: issue.line || 1,
      severity: issue.severity || 'suggestion',
      category: issue.category || 'Code Review',
      message: finalMessage,
    });
  }
}
