import * as monaco from 'monaco-editor';

// Configure TypeScript compiler options for better IntelliSense
export function configureMonacoTypeScript() {
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    reactNamespace: 'React',
    allowJs: true,
    typeRoots: ['node_modules/@types'],
    skipLibCheck: true,
  });

  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    reactNamespace: 'React',
    allowJs: true,
    skipLibCheck: true,
  });

  // Set diagnostics options
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
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
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    md: 'markdown',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    sh: 'shell',
    bash: 'shell',
    rb: 'ruby',
    kt: 'kotlin',
    swift: 'swift',
    php: 'php',
    cs: 'csharp',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    sql: 'sql',
    graphql: 'graphql',
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
  console.log('[MonacoSetup] Loading PR files into Monaco models:', files.length);

  const loadPromises = files.map(async (file) => {
    try {
      // Fetch both versions of the file
      const [originalResponse, modifiedResponse] = await Promise.all([
        fetch(
          `/api/fs/diff?${new URLSearchParams({
            worktreePath,
            filePath: file.path,
            baseBranch,
            repoRoot,
          })}`
        ),
        fetch(
          `/api/fs/read?${new URLSearchParams({
            worktreePath,
            filePath: file.path,
          })}`
        ),
      ]);

      if (originalResponse.ok) {
        const diffData = await originalResponse.json();
        if (diffData.original) {
          createOrUpdateModel(
            `${file.path}.base`,
            diffData.original,
            repoRoot
          );
        }
      }

      if (modifiedResponse.ok) {
        const fileData = await modifiedResponse.json();
        if (fileData.content) {
          createOrUpdateModel(file.path, fileData.content, repoRoot);
        }
      }
    } catch (error) {
      console.warn(`[MonacoSetup] Failed to load file ${file.path}:`, error);
    }
  });

  await Promise.allSettled(loadPromises);
  console.log('[MonacoSetup] Finished loading PR files');
}

// Dispose all Monaco models (cleanup)
export function disposeAllModels() {
  monaco.editor.getModels().forEach((model) => {
    model.dispose();
  });
}
