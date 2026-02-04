import * as monaco from 'monaco-editor';

// Registry of created models to prevent duplicates
// Registry of created models to prevent duplicates (currently unused)
// const _modelReferences = new Map<string, monaco.editor.ITextModel>();

/**
 * Create a Monaco model (Standard Version)
 * Replaces the VSCode-integrated version to use standard Monaco API
 * for better stability with themes and highlighting.
 *
 * @param content - File content
 * @param language - Programming language ID
 * @param filePath - Full file path
 * @returns Promise<monaco.editor.ITextModel>
 */
export async function createVSCodeModel(
  content: string,
  language: string,
  filePath: string
): Promise<monaco.editor.ITextModel> {
  const uri = monaco.Uri.file(filePath);
  const uriString = uri.toString();

  // Check if model already exists
  const existingModel = monaco.editor.getModel(uri);
  if (existingModel) {
    existingModel.setValue(content);
    // Ensure language is set
    monaco.editor.setModelLanguage(existingModel, language);
    return existingModel;
  }

  // Create new model
  const model = monaco.editor.createModel(content, language, uri);
  
  console.log('[MonacoModels] Created standard Monaco model:', {
    uri: uriString,
    language,
    contentLength: content.length
  });

  return model;
}

/**
 * Dispose a model (Standard Version)
 */
export function disposeVSCodeModel(filePath: string): void {
  const uri = monaco.Uri.file(filePath);
  const model = monaco.editor.getModel(uri);
  if (model) {
    model.dispose();
    console.log('[MonacoModels] Disposed model:', uri.toString());
  }
}

/**
 * Fallback to standard Monaco model creation
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

// Stub for compatibility if needed elsewhere
export const ensureFileSystemProvider = () => ({});
export const RegisteredMemoryFile = class { constructor(_uri: any, _content: any) {} };

