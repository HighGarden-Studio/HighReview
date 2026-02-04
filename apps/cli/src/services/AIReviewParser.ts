/**
 * Parse AI review text and extract structured information
 */

interface ChangeIntent {
  file?: string;
  level: 'file' | 'block';
  intent: string;
  motivation: string;
  impact?: string;
}

interface CallStackInfo {
  function: string;
  file: string;
  callers?: string[];
  flowchart?: string;
  sequence?: string;
}

interface ImpactAnalysis {
  scope: string;
  affectedAreas: string[];
  breakingChanges?: string[];
  sideEffects?: string[];
}

interface MovedCode {
  from: string;
  to: string;
  lines: number;
}

interface Refactoring {
  type: string;
  description: string;
  files: string[];
}

export class AIReviewParser {
  /**
   * Extract change intents from review text
   */
  static extractChangeIntents(text: string): ChangeIntent[] {
    const intents: ChangeIntent[] = [];
    const intentSection = this.extractSection(text, 'Change Intent');

    if (!intentSection) return intents;

    // Look for file-level or block-level patterns
    const filePattern = /\*\*File:\s*([^\*]+)\*\*\s*\n\s*-\s*Intent:\s*([^\n]+)\s*\n\s*-\s*Motivation:\s*([^\n]+)(?:\s*\n\s*-\s*Impact:\s*([^\n]+))?/gi;
    const blockPattern = /\*\*Block:\s*([^\*]+)\*\*\s*\n\s*-\s*Intent:\s*([^\n]+)\s*\n\s*-\s*Motivation:\s*([^\n]+)(?:\s*\n\s*-\s*Impact:\s*([^\n]+))?/gi;

    let match;
    while ((match = filePattern.exec(intentSection)) !== null) {
      intents.push({
        file: match[1].trim(),
        level: 'file',
        intent: match[2].trim(),
        motivation: match[3].trim(),
        impact: match[4]?.trim(),
      });
    }

    while ((match = blockPattern.exec(intentSection)) !== null) {
      intents.push({
        file: match[1].trim(),
        level: 'block',
        intent: match[2].trim(),
        motivation: match[3].trim(),
        impact: match[4]?.trim(),
      });
    }

    return intents;
  }

  /**
   * Extract call stack information with mermaid diagrams
   */
  static extractCallStacks(text: string): CallStackInfo[] {
    const callStacks: CallStackInfo[] = [];
    const callStackSection = this.extractSection(text, 'Call Stack');

    if (!callStackSection) return callStacks;

    // Look for function headers followed by mermaid diagrams
    const functionPattern = /\*\*Function:\s*`([^`]+)`\s*in\s*`([^`]+)`\*\*\s*\n([\s\S]*?)(?=\*\*Function:|$)/gi;

    let match;
    while ((match = functionPattern.exec(callStackSection)) !== null) {
      const functionName = match[1].trim();
      const fileName = match[2].trim();
      const content = match[3];

      // Extract mermaid flowchart
      const flowchartMatch = /```mermaid\s*\n(graph[^\n]*[\s\S]*?)```/i.exec(content);
      let flowchart = flowchartMatch ? flowchartMatch[1].trim() : undefined;

      // Extract mermaid sequence diagram
      const sequenceMatch = /```mermaid\s*\n(sequenceDiagram[\s\S]*?)```/i.exec(content);
      let sequence = sequenceMatch ? sequenceMatch[1].trim() : undefined;

      // Fallback: If not matched by markdown blocks, try to find raw mermaid syntax
      if (!flowchart) {
        const rawFlowchartMatch = /(graph (?:TD|LR|BT|RL)[\s\S]*?)(?=\n\n|\n\*\*Function|$)/i.exec(content);
        if (rawFlowchartMatch) flowchart = rawFlowchartMatch[1].trim();
      }
      if (!sequence) {
        const rawSequenceMatch = /(sequenceDiagram[\s\S]*?)(?=\n\n|\n\*\*Function|$)/i.exec(content);
        if (rawSequenceMatch) sequence = rawSequenceMatch[1].trim();
      }

      // Extract callers if listed
      const callersMatch = /Callers?:\s*\[([^\]]+)\]/i.exec(content);
      const callers = callersMatch 
        ? callersMatch[1].split(',').map(s => s.trim().replace(/['"`]/g, '')) 
        : undefined;

      if (flowchart || sequence) {
        callStacks.push({
          function: functionName,
          file: fileName,
          callers,
          flowchart: this.normalizeMermaid(flowchart),
          sequence: this.normalizeMermaid(sequence),
        });
      }
    }

    return callStacks;
  }

  /**
   * Normalize mermaid code by removing markdown blocks if present
   */
  static normalizeMermaid(code?: string): string | undefined {
    if (!code) return undefined;

    let normalized = code.trim();

    // Remove opening ```mermaid
    normalized = normalized.replace(/^```mermaid\s*\n/i, '');
    normalized = normalized.replace(/^```\w*\n/, ''); // Generic code block

    // Remove closing ```
    normalized = normalized.replace(/\n?```$/m, '');

    return normalized.trim();
  }

  /**
   * Extract impact analysis
   */
  static extractImpactAnalysis(text: string): ImpactAnalysis | undefined {
    const impactSection = this.extractSection(text, 'Impact Analysis');

    if (!impactSection) return undefined;

    // Extract scope
    const scopeMatch = /Scope:\s*\*\*([^\*]+)\*\*/i.exec(impactSection);
    const scope = scopeMatch ? scopeMatch[1].trim() : 'Unknown';

    // Extract affected areas
    const affectedAreas: string[] = [];
    const affectedPattern = /(?:Affected Areas?|Areas? Affected):\s*\n((?:\s*[-*]\s*[^\n]+\n?)+)/i;
    const affectedMatch = affectedPattern.exec(impactSection);
    if (affectedMatch) {
      const lines = affectedMatch[1].trim().split('\n');
      lines.forEach(line => {
        const cleaned = line.replace(/^\s*[-*]\s*/, '').trim();
        if (cleaned) affectedAreas.push(cleaned);
      });
    }

    // Extract breaking changes
    const breakingChanges: string[] = [];
    const breakingPattern = /(?:Breaking Changes?):\s*\n((?:\s*[-*]\s*[^\n]+\n?)+)/i;
    const breakingMatch = breakingPattern.exec(impactSection);
    if (breakingMatch) {
      const lines = breakingMatch[1].trim().split('\n');
      lines.forEach(line => {
        const cleaned = line.replace(/^\s*[-*]\s*/, '').trim();
        if (cleaned) breakingChanges.push(cleaned);
      });
    }

    // Extract side effects
    const sideEffects: string[] = [];
    const sidePattern = /(?:Side Effects?):\s*\n((?:\s*[-*]\s*[^\n]+\n?)+)/i;
    const sideMatch = sidePattern.exec(impactSection);
    if (sideMatch) {
      const lines = sideMatch[1].trim().split('\n');
      lines.forEach(line => {
        const cleaned = line.replace(/^\s*[-*]\s*/, '').trim();
        if (cleaned) sideEffects.push(cleaned);
      });
    }

    return {
      scope,
      affectedAreas,
      breakingChanges: breakingChanges.length > 0 ? breakingChanges : undefined,
      sideEffects: sideEffects.length > 0 ? sideEffects : undefined,
    };
  }

  /**
   * Extract moved code information
   */
  static extractMovedCode(text: string): MovedCode[] {
    const movedCode: MovedCode[] = [];
    const semanticSection = this.extractSection(text, 'Semantic Analysis');

    if (!semanticSection) return movedCode;

    // Look for moved code patterns
    const movedPattern = /Moved:\s*`([^`]+)`\s*→\s*`([^`]+)`\s*\((\d+)\s*lines?\)/gi;

    let match;
    while ((match = movedPattern.exec(semanticSection)) !== null) {
      movedCode.push({
        from: match[1].trim(),
        to: match[2].trim(),
        lines: parseInt(match[3], 10),
      });
    }

    return movedCode;
  }

  /**
   * Extract refactoring information
   */
  static extractRefactorings(text: string): Refactoring[] {
    const refactorings: Refactoring[] = [];
    const semanticSection = this.extractSection(text, 'Semantic Analysis');

    if (!semanticSection) return refactorings;

    // Look for refactoring patterns
    const refactorPattern = /Refactoring:\s*\*\*([^\*]+)\*\*\s*\n\s*-\s*Description:\s*([^\n]+)\s*\n\s*-\s*Files?:\s*([^\n]+)/gi;

    let match;
    while ((match = refactorPattern.exec(semanticSection)) !== null) {
      const files = match[3]
        .split(',')
        .map(f => f.trim().replace(/`/g, ''))
        .filter(Boolean);

      refactorings.push({
        type: match[1].trim(),
        description: match[2].trim(),
        files,
      });
    }

    return refactorings;
  }

  /**
   * Extract a section from the review text
   */
  private static extractSection(text: string, sectionName: string): string | null {
    // Try to find section with ## heading
    const pattern = new RegExp(`##\\s*${sectionName}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const match = pattern.exec(text);
    return match ? match[1].trim() : null;
  }
}
