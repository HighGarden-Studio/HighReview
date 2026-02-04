/**
 * Review Normalizer Utility
 * Post-processes AI review responses to fix malformed data structures
 * 
 * The AI often ignores schema constraints and outputs:
 * - changeIntents as a single object with all files merged in markdown
 * - impactAnalysis with all sections dumped into affectedAreas
 * 
 * This normalizer extracts and restructures the data correctly.
 */

export interface ChangeIntent {
  file: string;
  level: 'file' | 'block';
  intent: string;
  motivation: string;
  impact?: string;
}

export interface ImpactAnalysis {
  scope: string;
  affectedAreas: string[];
  breakingChanges?: string[];
  sideEffects?: string[];
}

export interface AIReviewResult {
  summary: string;
  criticalIssues: any[];
  warnings: any[];
  suggestions: any[];
  filesReviewed: number;
  totalIssues: number;
  changeIntents?: ChangeIntent[];
  impactAnalysis?: ImpactAnalysis;
  callStacks?: any[];
  movedCode?: any[];
  refactorings?: any[];
}

/**
 * Normalize an AI review result, fixing malformed changeIntents and impactAnalysis
 */
export function normalizeReviewResult(review: any): AIReviewResult {
  if (!review) return review;

  const result = { ...review };

  // Normalize changeIntents
  if (review.changeIntents) {
    result.changeIntents = normalizeChangeIntents(review.changeIntents);
  }

  // Normalize impactAnalysis
  if (review.impactAnalysis) {
    result.impactAnalysis = normalizeImpactAnalysis(review.impactAnalysis);
  }

  return result;
}

/**
 * Parse malformed changeIntents where AI merged all files into one markdown blob
 */
function normalizeChangeIntents(changeIntents: any): ChangeIntent[] | undefined {
  if (!Array.isArray(changeIntents) || changeIntents.length === 0) {
    return undefined;
  }

  // Check for malformed single-item array with merged markdown
  if (changeIntents.length === 1 && changeIntents[0]) {
    const item = changeIntents[0];
    const intentStr = String(item.intent || '');
    
    // Detect merged markdown pattern
    if (intentStr.includes('**File:') && intentStr.includes('Intent:')) {
      console.log('[ReviewNormalizer] Detected merged changeIntents, parsing...');
      const parsed = parseChangeIntentsFromMarkdown(intentStr);
      if (parsed.length > 0) {
        return parsed;
      }
    }
  }

  // Already properly structured - validate and return
  return changeIntents
    .filter((ci: any) => ci && ci.intent)
    .map((ci: any) => ({
      file: ci.file || 'Unknown',
      level: ci.level || 'file',
      intent: ci.intent,
      motivation: ci.motivation || '',
      impact: ci.impact,
    }));
}

/**
 * Parse merged markdown blob into individual ChangeIntent objects
 */
function parseChangeIntentsFromMarkdown(markdown: string): ChangeIntent[] {
  const results: ChangeIntent[] = [];
  
  // Normalize escaped newlines
  const normalized = markdown.replace(/\\n/g, '\n');
  
  console.log('[ReviewNormalizer] Parsing markdown blob, length:', normalized.length);
  
  // Split by file sections - each starts with "**File:"
  const sections = normalized.split(/\n\n(?=\*\*File:)/);
  
  console.log('[ReviewNormalizer] Found', sections.length, 'potential file sections');
  
  for (const section of sections) {
    if (!section.trim()) continue;
    
    // Extract file path: **File: path**
    const fileMatch = section.match(/\*\*File:\s*([^*\n]+)\*\*/);
    if (!fileMatch) continue;
    
    const filePath = fileMatch[1].trim();
    
    // Extract Intent, Motivation, Impact
    const intentMatch = section.match(/-?\s*Intent:\s*([^\n]+)/i);
    const motivationMatch = section.match(/-?\s*Motivation:\s*([^\n]+)/i);
    const impactMatch = section.match(/-?\s*Impact:\s*([^\n]+)/i);
    
    if (intentMatch) {
      results.push({
        file: filePath,
        level: 'file',
        intent: intentMatch[1].trim(),
        motivation: motivationMatch?.[1]?.trim() || '',
        impact: impactMatch?.[1]?.trim(),
      });
    }
  }

  // Fallback: global regex if section split didn't work
  if (results.length === 0) {
    console.log('[ReviewNormalizer] Section split failed, trying global regex...');
    
    const globalPattern = /\*\*File:\s*([^*]+)\*\*[^]*?-?\s*Intent:\s*([^\n]+)/gi;
    let match;
    while ((match = globalPattern.exec(normalized)) !== null) {
      results.push({
        file: match[1].trim(),
        level: 'file',
        intent: match[2].trim(),
        motivation: '',
      });
    }
  }

  console.log(`[ReviewNormalizer] Successfully parsed ${results.length} changeIntents`);
  return results;
}

/**
 * Normalize impactAnalysis where AI dumped all sections into affectedAreas
 */
function normalizeImpactAnalysis(impactAnalysis: any): ImpactAnalysis | undefined {
  if (!impactAnalysis || typeof impactAnalysis !== 'object') {
    return undefined;
  }

  const result: ImpactAnalysis = {
    scope: 'Module',
    affectedAreas: [],
    breakingChanges: [],
    sideEffects: [],
  };

  // Check if all content is in affectedAreas as a single blob
  if (Array.isArray(impactAnalysis.affectedAreas) && impactAnalysis.affectedAreas.length === 1) {
    const blob = String(impactAnalysis.affectedAreas[0]);
    const normalized = blob.replace(/\\n/g, '\n');
    
    // Check for section markers indicating merged content
    if (normalized.includes('Affected Areas:') || normalized.includes('Breaking Changes:') || normalized.includes('Side Effects:')) {
      console.log('[ReviewNormalizer] Detected merged impactAnalysis, parsing sections...');
      
      // Extract scope
      const scopeMatch = normalized.match(/Scope:\s*\*?\*?([^*\n,]+)/i);
      if (scopeMatch) {
        result.scope = scopeMatch[1].trim().replace(/\*\*/g, '');
      }
      
      // Extract Affected Areas
      const areasMatch = normalized.match(/Affected Areas:\s*([\s\S]*?)(?=Breaking Changes:|Side Effects:|$)/i);
      if (areasMatch) {
        result.affectedAreas = extractListItems(areasMatch[1]);
      }
      
      // Extract Breaking Changes
      const breakingMatch = normalized.match(/Breaking Changes:\s*([\s\S]*?)(?=Side Effects:|$)/i);
      if (breakingMatch) {
        result.breakingChanges = extractListItems(breakingMatch[1]);
      }
      
      // Extract Side Effects
      const sideEffectsMatch = normalized.match(/Side Effects:\s*([\s\S]*?)$/i);
      if (sideEffectsMatch) {
        result.sideEffects = extractListItems(sideEffectsMatch[1]);
      }
      
      console.log(`[ReviewNormalizer] Parsed: ${result.affectedAreas.length} areas, ${result.breakingChanges?.length || 0} breaking, ${result.sideEffects?.length || 0} side effects`);
      return result;
    }
  }

  // Standard handling for properly structured data
  result.scope = impactAnalysis.scope || 'Module';
  result.affectedAreas = normalizeStringArray(impactAnalysis.affectedAreas);
  
  if (impactAnalysis.breakingChanges) {
    result.breakingChanges = normalizeStringArray(impactAnalysis.breakingChanges);
  }
  
  if (impactAnalysis.sideEffects) {
    result.sideEffects = normalizeStringArray(impactAnalysis.sideEffects);
  }

  return result;
}

/**
 * Extract list items from markdown text
 */
function extractListItems(text: string): string[] {
  if (!text) return [];
  
  const items = text
    .split(/\n[-•*]\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('Scope:'));
  
  // Fallback: split by newlines if no list markers found
  if (items.length <= 1 && text.includes('\n')) {
    return text
      .split('\n')
      .map(s => s.replace(/^[-•*]\s*/, '').trim())
      .filter(s => s.length > 0 && !s.startsWith('Scope:') && !s.startsWith('Affected'));
  }
  
  return items;
}

/**
 * Normalize a string array that might contain merged markdown
 */
function normalizeStringArray(arr: any): string[] {
  if (!arr) return [];
  if (!Array.isArray(arr)) return [String(arr)];
  
  if (arr.length === 1 && typeof arr[0] === 'string') {
    const str = arr[0].replace(/\\n/g, '\n');
    
    if (str.includes('\n-') || str.includes('\n•') || str.includes('\n*')) {
      return extractListItems(str);
    }
  }
  
  return arr.map((item: any) => String(item).trim()).filter((s: string) => s.length > 0);
}
