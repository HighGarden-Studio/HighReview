import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import App from './App';
import './index.css';
import { configureMonacoTypeScript } from './utils/monacoSetup';

// Initialize VSCode services for monaco-languageclient
import { initialize } from '@codingame/monaco-vscode-api/services';
import getThemeServiceOverride from '@codingame/monaco-vscode-theme-service-override';
import getTextmateServiceOverride from '@codingame/monaco-vscode-textmate-service-override';
import getLanguagesServiceOverride from '@codingame/monaco-vscode-languages-service-override';
import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override';
import getEditorServiceOverride from '@codingame/monaco-vscode-editor-service-override';
import getConfigurationServiceOverride from '@codingame/monaco-vscode-configuration-service-override';
import getFilesServiceOverride from '@codingame/monaco-vscode-files-service-override';
import getModelServiceOverride from '@codingame/monaco-vscode-model-service-override';
import getQuickAccessServiceOverride from '@codingame/monaco-vscode-quickaccess-service-override';

const queryClient = new QueryClient();

// Initialize Monaco with VSCode services
async function initializeApp() {
  try {
    // Initialize VSCode services required for LSP
    // Including all necessary services for LSP features like "Go to Definition"
    await initialize({
      ...getThemeServiceOverride(),
      ...getTextmateServiceOverride(),
      ...getLanguagesServiceOverride(),
      ...getKeybindingsServiceOverride(),
      ...getEditorServiceOverride(),
      ...getConfigurationServiceOverride(),
      ...getFilesServiceOverride(),
      ...getModelServiceOverride(),
      ...getQuickAccessServiceOverride(), // Enables command palette for LSP commands
    });

    // Configure Monaco TypeScript
    configureMonacoTypeScript();

    console.log('[App] Monaco and VSCode services initialized');
  } catch (error) {
    console.error('[App] Failed to initialize services:', error);
  }

  // Render app
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ThemeProvider>
        <LanguageProvider>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </LanguageProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
}

initializeApp();
