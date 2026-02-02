import * as monaco from 'monaco-editor';
import {
  RegisteredMemoryFile,
  RegisteredFileSystemProvider,
  registerFileSystemOverlay
} from '@codingame/monaco-vscode-files-service-override';
import { createModelReference } from '@codingame/monaco-vscode-api/monaco';

// Global file system provider for all VSCode-integrated models
let globalFileSystemProvider: RegisteredFileSystemProvider | null = null;
let overlayDisposable: { dispose: () => void } | null = null;
const registeredFiles = new Set<string>();
const modelReferences = new Map<string, monaco.editor.IReference<monaco.editor.ITextModel>>();

/**
 * Initialize the global file system provider for VSCode services
 * Exported for use in DiffEditor
 */
export function ensureFileSystemProvider(): RegisteredFileSystemProvider {
  if (!globalFileSystemProvider) {
    globalFileSystemProvider = new RegisteredFileSystemProvider(false);
    overlayDisposable = registerFileSystemOverlay(1, globalFileSystemProvider);
    console.log('[MonacoModels] Initialized global file system provider');
  }
  return globalFileSystemProvider;
}

// Re-export RegisteredMemoryFile for DiffEditor
export { RegisteredMemoryFile } from '@codingame/monaco-vscode-files-service-override';

/**
 * Create a Monaco model that's integrated with VSCode services for LSP support.
 * Uses RegisteredMemoryFile and createModelReference for full VSCode integration.
 *
 * @param content - File content
 * @param language - Programming language ID
 * @param filePath - Full file path (e.g., /path/to/repo/src/file.java)
 * @returns Promise<monaco.editor.ITextModel>
 */
export async function createVSCodeModel(
  content: string,
  language: string,
  filePath: string
): Promise<monaco.editor.ITextModel> {
  const uri = monaco.Uri.file(filePath);
  const uriString = uri.toString();

  // Ensure file system provider is initialized
  const fileSystemProvider = ensureFileSystemProvider();

  // Register file with VSCode file system (only if not already registered)
  if (!registeredFiles.has(uriString)) {
    const file = new RegisteredMemoryFile(uri, content);
    fileSystemProvider.registerFile(file);
    registeredFiles.add(uriString);
    console.log('[MonacoModels] Registered file with VSCode filesystem:', uriString);
  } else {
    // File already registered - just log and continue
    console.log('[MonacoModels] File already registered, reusing existing:', uriString);
  }

  // Create model reference using VSCode-enhanced API
  // This enables LSP features like ctrl+click, context menu, etc.
  const modelRef = await createModelReference(uri);

  // Store reference to prevent disposal
  modelReferences.set(uriString, modelRef);

  const model = modelRef.object.textEditorModel!;

  // Set the language mode for the model
  // This is critical for LSP features to work
  monaco.editor.setModelLanguage(model, language);

  console.log('[MonacoModels] Created VSCode-integrated model with reference:', {
    uri: uriString,
    language: model.getLanguageId(),
    contentLength: model.getValueLength()
  });

  // Note: MonacoLanguageClient should automatically send textDocument/didOpen
  // notification when the model is created. The documentSelector in the LSP
  // client configuration should match this file's language and URI pattern.
  console.log('[MonacoModels] Model should be automatically synced with LSP server via MonacoLanguageClient');

  return model;
}

/**
 * Dispose a model reference to clean up resources
 */
export function disposeVSCodeModel(filePath: string): void {
  const uri = monaco.Uri.file(filePath);
  const uriString = uri.toString();

  const modelRef = modelReferences.get(uriString);
  if (modelRef) {
    modelRef.dispose();
    modelReferences.delete(uriString);
    console.log('[MonacoModels] Disposed model reference:', uriString);
  }
}

/**
 * Fallback to standard Monaco model creation for when VSCode services aren't needed
 */
export function createStandardModel(
  content: string,
  language: string,
  uri?: monaco.Uri
): monaco.editor.ITextModel {
  if (uri) {
    const existingModel = monaco.editor.getModel(uri);
    if (existingModel) {
      existingModel.setValue(content);
      return existingModel;
    }
    return monaco.editor.createModel(content, language, uri);
  }
  return monaco.editor.createModel(content, language);
}
