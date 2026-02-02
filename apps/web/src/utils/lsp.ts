import * as monaco from 'monaco-editor';
import {
  MonacoLanguageClient,
} from 'monaco-languageclient';
import { CloseAction, ErrorAction } from 'vscode-languageclient';
import {
  toSocket,
  WebSocketMessageReader,
  WebSocketMessageWriter,
} from 'vscode-ws-jsonrpc';

type LanguageId = 'typescript' | 'javascript' | 'ruby' | 'java';

interface LanguageClientConfig {
  documentSelector: Array<{ language: string }>;
  name: string;
}

const languageConfigs: Record<LanguageId, LanguageClientConfig> = {
  typescript: {
    name: 'TypeScript Language Client',
    documentSelector: [
      { language: 'typescript' },
      { language: 'javascript' },
      { language: 'typescriptreact' },
      { language: 'javascriptreact' },
    ]
  },
  javascript: {
    name: 'JavaScript Language Client',
    documentSelector: [
      { language: 'javascript' },
      { language: 'javascriptreact' },
    ]
  },
  ruby: {
    name: 'Ruby Language Client',
    documentSelector: [
      { language: 'ruby' }
    ]
  },
  java: {
    name: 'Java Language Client',
    documentSelector: [
      { language: 'java' }
    ]
  }
};

let languageClients: Map<LanguageId, MonacoLanguageClient> = new Map();
let activeConnections: Map<LanguageId, WebSocket> = new Map();

/**
 * Initialize Monaco services (must be called once)
 */
export function initializeMonacoServices() {
  // Monaco services initialization is now handled internally by monaco-languageclient v10+
  // Language registration is done in monacoSetup.ts (called from main.tsx)
  console.log('[LSP] Monaco services ready');
}

/**
 * Get language ID from file extension
 */
function getLanguageIdFromPath(filePath: string): LanguageId | null {
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (['ts', 'tsx', 'js', 'jsx'].includes(ext || '')) {
    return 'typescript';
  } else if (ext === 'rb') {
    return 'ruby';
  } else if (ext === 'java') {
    return 'java';
  }

  return null;
}

/**
 * Start a language client for a specific language
 */
async function startLanguageClientForLanguage(
  workspaceRoot: string,
  language: LanguageId
): Promise<void> {
  if (languageClients.has(language)) {
    console.log(`[LSP Client] ${language} already connected`);
    return;
  }

  const config = languageConfigs[language];
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.hostname}:8765/lsp?workspaceRoot=${encodeURIComponent(
    workspaceRoot
  )}&language=${language}`;

  console.log(`[LSP Client] Connecting ${language} to:`, wsUrl);

  const webSocket = new WebSocket(wsUrl);

  webSocket.onopen = () => {
    console.log(`[LSP Client] ${language} WebSocket connected`);

    try {
      const socket = toSocket(webSocket);
      const reader = new WebSocketMessageReader(socket);
      const writer = new WebSocketMessageWriter(socket);

      const client = new MonacoLanguageClient({
        name: config.name,
        clientOptions: {
          documentSelector: config.documentSelector,
          errorHandler: {
            error: () => {
              console.warn(`[LSP Client] ${language} error handled, continuing...`);
              return { action: ErrorAction.Continue };
            },
            closed: () => {
              console.warn(`[LSP Client] ${language} connection closed`);
              return { action: CloseAction.DoNotRestart };
            },
          },
          workspaceFolder: {
            uri: `file://${workspaceRoot}`,
            name: 'workspace',
            index: 0,
          },
          initializationOptions: {
            preferences: {
              quotePreference: 'single',
            },
          },
          // Enable synchronization logging
          synchronize: {
            fileEvents: undefined
          },
        },
        // New API for v10: provide MessageTransports directly
        messageTransports: {
          reader,
          writer,
        },
      });

      console.log(`[LSP Client] ${language} client created with documentSelector:`, config.documentSelector);

      // Setup reader close handler
      reader.onClose(() => {
        console.log(`[LSP Client] ${language} connection closed`);
        languageClients.delete(language);
        activeConnections.delete(language);
      });

      // Start the client and wait for initialization
      client.start().then(() => {
        console.log(`[LSP Client] ${language} initialization completed successfully`);
        console.log(`[LSP Client] ${language} LSP features (Go to Definition, Find References, etc.) should now be available`);

        // Diagnostic: Check if providers are registered
        import('../utils/lspDiagnostics').then(({ diagnoseLSPProviders }) => {
          setTimeout(() => {
            diagnoseLSPProviders();
          }, 1000); // Wait 1 second for providers to register
        });
      }).catch((error) => {
        console.error(`[LSP Client] ${language} initialization failed:`, error);
      });

      languageClients.set(language, client);
      activeConnections.set(language, webSocket);
      console.log(`[LSP Client] ${language} language client started, waiting for initialization...`);
    } catch (error) {
      console.warn(`[LSP Client] Failed to initialize ${language} language client:`, error);
      console.warn(`[LSP Client] ${language} editor will work without LSP features`);
      // LSP is optional, continue without it
    }
  };

  webSocket.onerror = (error) => {
    console.warn(`[LSP Client] ${language} WebSocket error:`, error);
  };

  webSocket.onclose = () => {
    console.log(`[LSP Client] ${language} WebSocket closed`);
    languageClients.delete(language);
    activeConnections.delete(language);
  };
}

/**
 * Map GitHub language names to LanguageId
 */
function mapGitHubLanguageToLanguageId(githubLang: string): LanguageId | null {
  const mapping: Record<string, LanguageId> = {
    'TypeScript': 'typescript',
    'JavaScript': 'javascript',
    'Python': 'python',
    'Java': 'java',
    'C#': 'csharp',
    'C++': 'cpp',
    'C': 'c',
    'PHP': 'php',
    'Swift': 'swift',
    'Kotlin': 'kotlin',
    'Go': 'go',
    'Rust': 'rust',
    'Ruby': 'ruby',
    'Dart': 'dart',
    'Scala': 'scala',
    'Lua': 'lua',
    'Perl': 'perl',
    'CSS': 'css',
    'HTML': 'html',
    'JSON': 'json',
  };
  return mapping[githubLang] || null;
}

/**
 * Create and start Language Clients for detected languages in the repository
 * @param workspaceRoot - The workspace root directory
 * @param repoLanguages - Optional map of repository languages from GitHub API (language name -> bytes)
 */
export async function startLanguageClient(
  workspaceRoot: string,
  repoLanguages?: Record<string, number>
): Promise<void> {
  console.log('[LSP Client] Starting language clients for workspace:', workspaceRoot);

  // Map GitHub languages to LanguageIds if provided
  const targetLanguages: Set<LanguageId> | null = repoLanguages
    ? new Set(
        Object.keys(repoLanguages)
          .map(mapGitHubLanguageToLanguageId)
          .filter((lang): lang is LanguageId => lang !== null)
      )
    : null;

  if (targetLanguages && targetLanguages.size > 0) {
    console.log('[LSP Client] Target languages from repository:', Array.from(targetLanguages).join(', '));
  }

  // Check which language servers are installed
  try {
    const response = await fetch('/api/lsp/check-all');
    const data = await response.json();

    console.log('[LSP Client] Language server status:', data);

    // Start clients for installed servers
    const promises: Promise<void>[] = [];

    for (const [lang, info] of Object.entries(data.servers as Record<LanguageId, { installed: boolean }>)) {
      // Skip if we have target languages and this language is not in the list
      if (targetLanguages && !targetLanguages.has(lang as LanguageId)) {
        continue;
      }

      if (info.installed) {
        promises.push(
          startLanguageClientForLanguage(workspaceRoot, lang as LanguageId)
            .catch(error => {
              console.warn(`[LSP Client] Failed to start ${lang}:`, error);
            })
        );
      } else {
        console.log(`[LSP Client] ${lang} language server not installed, skipping`);
      }
    }

    await Promise.all(promises);
  } catch (error) {
    console.warn('[LSP Client] Failed to check language server status:', error);
    // Fallback: try to start TypeScript only
    await startLanguageClientForLanguage(workspaceRoot, 'typescript').catch(error => {
      console.warn('[LSP Client] Failed to start TypeScript client:', error);
    });
  }
}

/**
 * Stop all language clients
 */
export async function stopLanguageClient(): Promise<void> {
  console.log(`[LSP Client] Stopping ${languageClients.size} language clients`);

  const stopPromises: Promise<void>[] = [];

  for (const [lang, client] of languageClients.entries()) {
    console.log(`[LSP Client] Stopping ${lang} client`);
    stopPromises.push(client.stop());
  }

  await Promise.all(stopPromises);

  // Close WebSocket connections
  for (const [lang, ws] of activeConnections.entries()) {
    console.log(`[LSP Client] Closing ${lang} WebSocket`);
    ws.close();
  }

  languageClients.clear();
  activeConnections.clear();
}

/**
 * Check if any language client is running
 */
export function isLanguageClientRunning(): boolean {
  return languageClients.size > 0;
}

/**
 * Get active language clients
 */
export function getActiveLanguages(): LanguageId[] {
  return Array.from(languageClients.keys());
}

/**
 * Check if a specific language client is running
 */
export function isLanguageActive(language: LanguageId): boolean {
  return languageClients.has(language);
}
