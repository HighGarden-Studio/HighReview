import * as monaco from 'monaco-editor';

/**
 * Diagnostic utility to check LSP provider registration
 */
export function diagnoseLSPProviders(): void {
  console.log('\n=== LSP Provider Diagnostics ===');

  // Check registered languages
  const languages = monaco.languages.getLanguages();
  console.log('Registered languages:', languages.map(l => l.id));

  // Check for Java language
  const hasJava = languages.some(l => l.id === 'java');
  console.log('Java language registered:', hasJava);

  console.log('\nNote: MonacoLanguageClient registers providers with monaco-vscode-api layer');
  console.log('Standard Monaco API may not expose these providers directly');
  console.log('LSP features work through VSCode services, not standalone Monaco APIs');
  console.log('=================================\n');
}

/**
 * Test if LSP features work for a specific model using correct Monaco APIs
 */
export async function testLSPFeatures(model: monaco.editor.ITextModel): Promise<void> {
  console.log('\n=== Testing LSP Features ===');
  console.log('Model URI:', model.uri.toString());
  console.log('Language ID:', model.getLanguageId());

  const testPosition: monaco.Position = { lineNumber: 10, column: 10 };

  // Test hover (this API exists)
  try {
    const hovers = await monaco.languages.getHover(model, testPosition);
    if (hovers && hovers.contents && hovers.contents.length > 0) {
      console.log('✓ Hover provider: WORKING', hovers.contents);
    } else {
      console.log('○ Hover provider: No results (position may not have hover info)');
    }
  } catch (error) {
    console.log('✗ Hover provider: ERROR', error);
  }

  // Test completion (this API exists)
  try {
    const completions = await monaco.languages.getCompletionItems(model, testPosition, {
      triggerKind: monaco.languages.CompletionTriggerKind.Invoke,
      triggerCharacter: undefined
    });
    if (completions && completions.suggestions && completions.suggestions.length > 0) {
      console.log('✓ Completion provider: WORKING', completions.suggestions.length, 'suggestions');
    } else {
      console.log('○ Completion provider: No results (position may not have completions)');
    }
  } catch (error) {
    console.log('✗ Completion provider: ERROR', error);
  }

  // monaco-vscode-api should expose providers through editor actions, not direct API calls
  console.log('\nNote: For Go to Definition, Find References, etc.:');
  console.log('- These work through editor context menu and keyboard shortcuts');
  console.log('- Right-click on code to see "Go to Definition" etc.');
  console.log('- Use F12 for Go to Definition');
  console.log('- Use Shift+F12 for Find All References');
  console.log('- Use Cmd+Click (Mac) or Ctrl+Click (Windows) for Go to Definition');
  console.log('============================\n');
}
