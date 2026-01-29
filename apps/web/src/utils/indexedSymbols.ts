/**
 * Indexed Symbols API Client
 * Uses the project indexing backend for fast symbol lookups
 */

export interface IndexedSymbol {
  name: string;
  kind: 'class' | 'function' | 'method' | 'variable' | 'interface' | 'type' | 'constant';
  filePath: string;
  line: number;
  column: number;
  containerName?: string;
  language: string;
}

export interface IndexStatus {
  projectPath: string;
  branch: string;
  commitHash: string;
  indexedAt: number;
  symbolCount: number;
  fileCount: number;
}

/**
 * Search for symbols by name
 */
export async function searchSymbols(
  projectPath: string,
  branch: string,
  query: string
): Promise<IndexedSymbol[]> {
  try {
    const params = new URLSearchParams({
      projectPath,
      branch,
      query
    });

    const response = await fetch(`http://localhost:8765/api/index/search?${params}`);

    if (!response.ok) {
      console.error('[IndexedSymbols] Search failed:', response.status);
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('[IndexedSymbols] Search error:', error);
    return [];
  }
}

/**
 * Get all symbols in a file
 */
export async function getFileSymbols(
  projectPath: string,
  branch: string,
  filePath: string
): Promise<IndexedSymbol[]> {
  try {
    const params = new URLSearchParams({
      projectPath,
      branch,
      filePath
    });

    const response = await fetch(`http://localhost:8765/api/index/file-symbols?${params}`);

    if (!response.ok) {
      console.error('[IndexedSymbols] Get file symbols failed:', response.status);
      return [];
    }

    const data = await response.json();
    return data.symbols || [];
  } catch (error) {
    console.error('[IndexedSymbols] Get file symbols error:', error);
    return [];
  }
}

/**
 * Get index status
 */
export async function getIndexStatus(
  projectPath: string,
  branch: string
): Promise<IndexStatus | null> {
  try {
    const params = new URLSearchParams({
      projectPath,
      branch
    });

    const response = await fetch(`http://localhost:8765/api/index/status?${params}`);

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[IndexedSymbols] Get index status error:', error);
    return null;
  }
}

/**
 * Check if indexing is needed
 */
export async function checkIndexingNeeded(
  projectPath: string,
  branch: string
): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      projectPath,
      branch
    });

    const response = await fetch(`http://localhost:8765/api/index/check?${params}`);

    if (!response.ok) {
      return true;
    }

    const data = await response.json();
    return data.needsIndexing || false;
  } catch (error) {
    console.error('[IndexedSymbols] Check indexing needed error:', error);
    return true;
  }
}

/**
 * Trigger project indexing
 */
export async function triggerIndexing(
  projectPath: string,
  branch: string
): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:8765/api/index/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        projectPath,
        branch
      })
    });

    if (!response.ok) {
      console.error('[IndexedSymbols] Trigger indexing failed:', response.status);
      return false;
    }

    console.log('[IndexedSymbols] Indexing started');
    return true;
  } catch (error) {
    console.error('[IndexedSymbols] Trigger indexing error:', error);
    return false;
  }
}

/**
 * Find symbol definition (exact match)
 */
export async function findDefinition(
  projectPath: string,
  branch: string,
  symbolName: string
): Promise<IndexedSymbol | null> {
  const symbols = await searchSymbols(projectPath, branch, symbolName);

  // Return exact match if found
  const exactMatch = symbols.find(s => s.name === symbolName);
  return exactMatch || (symbols.length > 0 ? symbols[0] : null);
}

/**
 * Find all usages of a symbol (returns symbols with the same name)
 */
export async function findUsages(
  projectPath: string,
  branch: string,
  symbolName: string
): Promise<IndexedSymbol[]> {
  const symbols = await searchSymbols(projectPath, branch, symbolName);

  // Filter to exact matches only
  return symbols.filter(s => s.name === symbolName);
}

/**
 * Find test file for a given source file
 */
export function findTestFile(filePath: string): string | null {
  const patterns = [
    // TypeScript/JavaScript patterns
    { from: /\.ts$/, to: '.test.ts' },
    { from: /\.ts$/, to: '.spec.ts' },
    { from: /\.tsx$/, to: '.test.tsx' },
    { from: /\.tsx$/, to: '.spec.tsx' },
    { from: /\.js$/, to: '.test.js' },
    { from: /\.js$/, to: '.spec.js' },
    { from: /\.jsx$/, to: '.test.jsx' },
    { from: /\.jsx$/, to: '.spec.jsx' },

    // Ruby patterns
    { from: /^(.+)\.rb$/, to: '$1_spec.rb' },
    { from: /^app\/(.+)\.rb$/, to: 'spec/$1_spec.rb' },
    { from: /^lib\/(.+)\.rb$/, to: 'spec/$1_spec.rb' },

    // Java patterns
    { from: /^src\/main\/java\/(.+)\.java$/, to: 'src/test/java/$1Test.java' },
    { from: /\.java$/, to: 'Test.java' },
  ];

  for (const pattern of patterns) {
    if (pattern.from.test(filePath)) {
      return filePath.replace(pattern.from, pattern.to as string);
    }
  }

  return null;
}

/**
 * Find source file for a given test file
 */
export function findSourceFile(filePath: string): string | null {
  const patterns = [
    // TypeScript/JavaScript patterns
    { from: /\.test\.ts$/, to: '.ts' },
    { from: /\.spec\.ts$/, to: '.ts' },
    { from: /\.test\.tsx$/, to: '.tsx' },
    { from: /\.spec\.tsx$/, to: '.tsx' },
    { from: /\.test\.js$/, to: '.js' },
    { from: /\.spec\.js$/, to: '.js' },
    { from: /\.test\.jsx$/, to: '.jsx' },
    { from: /\.spec\.jsx$/, to: '.jsx' },

    // Ruby patterns
    { from: /_spec\.rb$/, to: '.rb' },
    { from: /^spec\/(.+)_spec\.rb$/, to: 'app/$1.rb' },
    { from: /^spec\/(.+)_spec\.rb$/, to: 'lib/$1.rb' },

    // Java patterns
    { from: /^src\/test\/java\/(.+)Test\.java$/, to: 'src/main/java/$1.java' },
    { from: /Test\.java$/, to: '.java' },
  ];

  for (const pattern of patterns) {
    if (pattern.from.test(filePath)) {
      return filePath.replace(pattern.from, pattern.to as string);
    }
  }

  return null;
}
