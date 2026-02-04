import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Note: Basic language features are already included in monaco-editor
// No need to explicitly import language contributions

// Configure Monaco Environment for workers (fixes toUrl error)
(window as any).MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === 'json') {
      return new jsonWorker();
    }
    if (label === 'css' || label === 'scss' || label === 'less' || label === 'sass') {
      return new cssWorker();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor' || label === 'vue') {
      return new htmlWorker();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

// Configure TypeScript compiler options for better IntelliSense
export function configureMonacoTypeScript() {
  // Register all supported languages explicitly
  // This is required for LSP to work with these languages
  const languagesToRegister = [
    { id: 'java', extensions: ['.java'], aliases: ['Java', 'java'] },
    { id: 'kotlin', extensions: ['.kt', '.kts'], aliases: ['Kotlin', 'kotlin'] },
    { id: 'ruby', extensions: ['.rb'], aliases: ['Ruby', 'ruby'] },
    { id: 'go', extensions: ['.go'], aliases: ['Go', 'go', 'golang'] },
    { id: 'rust', extensions: ['.rs'], aliases: ['Rust', 'rust'] },
    { id: 'python', extensions: ['.py', '.pyw'], aliases: ['Python', 'python', 'py'] },
    { id: 'php', extensions: ['.php'], aliases: ['PHP', 'php'] },
    { id: 'swift', extensions: ['.swift'], aliases: ['Swift', 'swift'] },
    { id: 'csharp', extensions: ['.cs'], aliases: ['C#', 'csharp'] },
    { id: 'cpp', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.h'], aliases: ['C++', 'cpp'] },
    { id: 'c', extensions: ['.c', '.h'], aliases: ['C', 'c'] },
    { id: 'scala', extensions: ['.scala'], aliases: ['Scala', 'scala'] },
    { id: 'dart', extensions: ['.dart'], aliases: ['Dart', 'dart'] },
    { id: 'lua', extensions: ['.lua'], aliases: ['Lua', 'lua'] },
    { id: 'perl', extensions: ['.pl', '.pm'], aliases: ['Perl', 'perl'] },
  ];

  // Register each language
  languagesToRegister.forEach(lang => {
    // Check if language is already registered
    const existingLanguages = monaco.languages.getLanguages();
    const isRegistered = existingLanguages.some(l => l.id === lang.id);

    if (!isRegistered) {
      monaco.languages.register(lang);
      console.log(`[MonacoSetup] Registered language: ${lang.id}`);
    }
  });

  // Register Vue language with custom tokenizer
  const existingLanguages = monaco.languages.getLanguages();
  const isVueRegistered = existingLanguages.some(l => l.id === 'vue');

  if (!isVueRegistered) {
    monaco.languages.register({ id: 'vue', extensions: ['.vue'], aliases: ['Vue', 'vue'] });
    console.log('[MonacoSetup] Registered language: vue');

    // Define Vue language tokenizer
    monaco.languages.setMonarchTokensProvider('vue', {
      defaultToken: '',
      tokenPostfix: '.vue',

      // Token types
      tokenizer: {
        root: [
          // Template section (HTML-like)
          [/<template\b/, { token: 'tag', next: '@template' }],
          // Script section (JavaScript/TypeScript)
          [/<script\b/, { token: 'tag', next: '@script' }],
          // Style section (CSS/SCSS)
          [/<style\b/, { token: 'tag', next: '@style' }],
          // Comments
          [/<!--/, 'comment', '@comment'],
        ],

        template: [
          [/<\/template>/, { token: 'tag', next: '@pop' }],
          [/<[a-zA-Z][\w-]*/, 'tag'],
          [/>/, 'tag'],
          [/[^<]+/, ''],
        ],

        script: [
          [/<\/script>/, { token: 'tag', next: '@pop' }],
          [/\bimport\b/, 'keyword'],
          [/\bexport\b/, 'keyword'],
          [/\bdefault\b/, 'keyword'],
          [/\bconst\b|\blet\b|\bvar\b/, 'keyword'],
          [/\bfunction\b/, 'keyword'],
          [/\breturn\b/, 'keyword'],
          [/\bif\b|\belse\b/, 'keyword'],
          [/[a-zA-Z_]\w*/, 'identifier'],
          [/[{}()\[\]]/, 'delimiter.bracket'],
          [/[;,.]/, 'delimiter'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/'([^'\\]|\\.)*'/, 'string'],
          [/`/, 'string', '@templateString'],
          [/\/\/.*$/, 'comment'],
          [/\/\*/, 'comment', '@scriptComment'],
        ],

        style: [
          [/<\/style>/, { token: 'tag', next: '@pop' }],
          [/[a-zA-Z][\w-]*(?=\s*:)/, 'attribute.name'],
          [/:/, 'delimiter'],
          [/[;{}]/, 'delimiter'],
          [/#[0-9a-fA-F]+/, 'number.hex'],
          [/[0-9]+px|em|rem|%/, 'number'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/'([^'\\]|\\.)*'/, 'string'],
          [/\/\*/, 'comment', '@styleComment'],
        ],

        comment: [
          [/-->/, 'comment', '@pop'],
          [/./, 'comment'],
        ],

        scriptComment: [
          [/\*\//, 'comment', '@pop'],
          [/./, 'comment'],
        ],

        styleComment: [
          [/\*\//, 'comment', '@pop'],
          [/./, 'comment'],
        ],

        templateString: [
          [/`/, 'string', '@pop'],
          [/\$\{/, 'delimiter.bracket', '@bracketCounting'],
          [/./, 'string'],
        ],

        bracketCounting: [
          [/\{/, 'delimiter.bracket', '@bracketCounting'],
          [/\}/, 'delimiter.bracket', '@pop'],
          { include: 'script' },
        ],
      },
    });

    // Set language configuration for Vue
    monaco.languages.setLanguageConfiguration('vue', {
      wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g,
      comments: {
        lineComment: '//',
        blockComment: ['/*', '*/'],
      },
      brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
      ],
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
        { open: '`', close: '`' },
        { open: '<', close: '>' },
      ],
      surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
        { open: '`', close: '`' },
        { open: '<', close: '>' },
      ],
      folding: {
        markers: {
          start: new RegExp('^\\s*<!--\\s*#region\\b.*-->'),
          end: new RegExp('^\\s*<!--\\s*#endregion\\b.*-->'),
        },
      },
    });
  }

  // Configure TypeScript (only if available - VSCode API may not include it)
  const ts = (monaco.languages as any).typescript;
  if (ts?.typescriptDefaults) {
    ts.typescriptDefaults.setCompilerOptions({
      target: ts.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      module: ts.ModuleKind.ESNext,
      noEmit: true,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      reactNamespace: 'React',
      allowJs: true,
      typeRoots: ['node_modules/@types'],
      skipLibCheck: true,
    });

    // Set diagnostics options
    ts.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
  }

  if (ts?.javascriptDefaults) {
    ts.javascriptDefaults.setCompilerOptions({
      target: ts.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      module: ts.ModuleKind.ESNext,
      noEmit: true,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      reactNamespace: 'React',
      allowJs: true,
      skipLibCheck: true,
    });

    ts.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
  }
}

// Create or update a model for a file
export function createOrUpdateModel(
  filePath: string,
  content: string,
  repoRoot: string
): monaco.editor.ITextModel {
  // Create proper file URI
  const uri = monaco.Uri.file(`${repoRoot}/${filePath}`);

  // Check if model already exists
  let model = monaco.editor.getModel(uri);

  if (model) {
    // Update existing model
    model.setValue(content);
  } else {
    // Create new model with proper language detection
    const language = getLanguageFromFilePath(filePath);
    model = monaco.editor.createModel(content, language, uri);
  }

  return model;
}

// Get language from file path
function getLanguageFromFilePath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    // TypeScript variants
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript', // TypeScript Module
    cts: 'typescript', // TypeScript CommonJS

    // JavaScript variants
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript', // ES Module JavaScript
    cjs: 'javascript', // CommonJS JavaScript
    vue: 'vue', // Vue Single File Components

    // Web technologies
    json: 'json',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',

    // Documentation
    md: 'markdown',
    markdown: 'markdown',

    // Backend languages
    py: 'python',
    pyw: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    c: 'c',
    h: 'c',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    rb: 'ruby',
    kt: 'kotlin',
    kts: 'kotlin',
    swift: 'swift',
    php: 'php',
    cs: 'csharp',

    // Data formats
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',

    // Config files
    dockerfile: 'dockerfile',
    makefile: 'makefile',
  };
  return languageMap[ext] || 'plaintext';
}

// Load all PR files into Monaco models for better code navigation
export async function loadPRFilesIntoMonaco(
  files: Array<{ path: string }>,
  repoRoot: string,
  worktreePath: string,
  baseBranch: string
): Promise<void> {

  const loadPromises = files.map(async (file) => {
    try {
        // Fetch diff which contains both original and modified content
        const response = await fetch(
          `/api/fs/diff?${new URLSearchParams({
            worktreePath,
            filePath: file.path,
            baseBranch,
            repoRoot,
          })}`
        );

        if (response.ok) {
          const diffData = await response.json();
          
          if (diffData.original) {
            // Create standard Monaco model for base version
            createOrUpdateModel(`${file.path}.base`, diffData.original, worktreePath);
          }

          if (diffData.modified) {
            // Create standard Monaco model for current version
            createOrUpdateModel(file.path, diffData.modified, worktreePath);
          }
        }
      } catch (error) {
        console.warn(`[MonacoSetup] Failed to load file ${file.path}:`, error);
      }
    });

  await Promise.allSettled(loadPromises);
}

// Flatten file tree into a list of file paths
function flattenFileTree(tree: any[], basePath = ''): string[] {
  const files: string[] = [];

  for (const node of tree) {
    const fullPath = basePath ? `${basePath}/${node.name}` : node.name;

    if (node.type === 'file') {
      files.push(fullPath);
    } else if (node.type === 'directory' && node.children) {
      files.push(...flattenFileTree(node.children, fullPath));
    }
  }

  return files;
}

// Filter files by extension
function filterFilesByExtension(files: string[], extensions: string[]): string[] {
  return files.filter(file => {
    const ext = file.split('.').pop()?.toLowerCase();
    return ext && extensions.includes(`.${ext}`);
  });
}

// OBSOLETE: This function was used for LSP indexing, now disabled
// Tree-sitter approach doesn't require full project indexing
export async function loadFullProjectIntoMonaco(
  worktreePath: string,
  _repoRoot: string,
  onProgress?: (current: number, total: number, currentFile: string) => void,
  extensions = [
    '.java', '.kt', '.kts',
    '.ts', '.tsx', '.mts', '.cts',
    '.js', '.jsx', '.mjs', '.cjs',
    '.vue',
    '.py', '.pyw',
    '.go', '.rs', '.rb', '.php', '.swift', '.cs',
    '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp'
  ]
): Promise<{ loadedFiles: number; totalFiles: number; skippedFiles: number }> {
  console.log('[MonacoSetup] Starting full project indexing for LSP...');

  try {
    // Step 1: Get file tree from backend
    const treeResponse = await fetch(
      `/api/fs/tree?${new URLSearchParams({
        path: worktreePath,
        maxDepth: '10'
      })}`
    );

    if (!treeResponse.ok) {
      throw new Error('Failed to fetch file tree');
    }

    const treeData = await treeResponse.json();

    // Step 2: Flatten tree and filter by extensions
    const allFiles = flattenFileTree(treeData.tree);
    const sourceFiles = filterFilesByExtension(allFiles, extensions);

    console.log('[MonacoSetup] File tree analysis:', {
      total: allFiles.length,
      sourceFiles: sourceFiles.length,
      extensions
    });

    if (sourceFiles.length === 0) {
      return { loadedFiles: 0, totalFiles: 0, skippedFiles: 0 };
    }

    // Step 3: Load files in batches to avoid overwhelming the browser
    const batchSize = 20; // Load 20 files at a time
    let loadedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < sourceFiles.length; i += batchSize) {
      const batch = sourceFiles.slice(i, i + batchSize);

      const batchPromises = batch.map(async (filePath) => {
        try {
          // Check if model already exists
          const uri = monaco.Uri.file(`${worktreePath}/${filePath}`);
          const existingModel = monaco.editor.getModel(uri);

          if (existingModel) {
            // Model already loaded (probably a PR file)
            skippedCount++;
            return;
          }

          // Fetch file content using absolute path
          const absolutePath = `${worktreePath}/${filePath}`;
          const response = await fetch(
            `/api/fs/content?${new URLSearchParams({
              path: absolutePath
            })}`
          );

          if (!response.ok) {
            console.warn(`[MonacoSetup] Failed to fetch ${filePath}: ${response.status}`);
            skippedCount++;
            return;
          }

          const fileData = await response.json();

          if (fileData.content) {
            // Use createVSCodeModel to properly register with LSP server
            const fullPath = `${worktreePath}/${filePath}`;
            const language = getLanguageFromFilePath(filePath);

            try {
              // Import createVSCodeModel dynamically to avoid circular dependency
              const { createVSCodeModel } = await import('./monacoModels.js');
              await createVSCodeModel(fileData.content, language, fullPath);
            } catch (error) {
              console.warn(`[MonacoSetup] Failed to create VSCode model for ${filePath}, falling back to regular model:`, error);
              createOrUpdateModel(filePath, fileData.content, worktreePath);
            }

            loadedCount++;

            // Report progress
            if (onProgress) {
              onProgress(loadedCount + skippedCount, sourceFiles.length, filePath);
            }
          }
        } catch (error) {
          console.warn(`[MonacoSetup] Error loading file ${filePath}:`, error);
          skippedCount++;
        }
      });

      // Wait for batch to complete before starting next batch
      await Promise.allSettled(batchPromises);

      // Small delay between batches to prevent browser freeze
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log('[MonacoSetup] Full project indexing completed:', {
      loaded: loadedCount,
      skipped: skippedCount,
      total: sourceFiles.length
    });

    return {
      loadedFiles: loadedCount,
      totalFiles: sourceFiles.length,
      skippedFiles: skippedCount
    };
  } catch (error) {
    console.error('[MonacoSetup] Failed to load full project:', error);
    throw error;
  }
}

// Dispose all Monaco models (cleanup)
export function disposeAllModels() {
  monaco.editor.getModels().forEach((model) => {
    model.dispose();
  });
}

// Define custom themes to match app styling
export function defineMonacoThemes() {
  monaco.editor.defineTheme('highreview-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editor.lineHighlightBackground': '#2f3136',
      'editorLineNumber.foreground': '#858585',
      'editorGutter.background': '#1e1e1e',
      'diffEditor.insertedTextBackground': '#28a74533',
      'diffEditor.removedTextBackground': '#dc354533',
    }
  });

  monaco.editor.defineTheme('highreview-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#333333',
      'editor.lineHighlightBackground': '#f3f3f3',
      'editorLineNumber.foreground': '#237893',
      'editorGutter.background': '#ffffff',
      'diffEditor.insertedTextBackground': '#28a74533',
      'diffEditor.removedTextBackground': '#dc354533',
    }
  });
}

