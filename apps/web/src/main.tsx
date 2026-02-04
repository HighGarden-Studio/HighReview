import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import App from './App';
import './index.css';
import { configureMonacoTypeScript } from './utils/monacoSetup';

// Initialize Monaco
const queryClient = new QueryClient();

async function initializeApp() {
  try {
    // Configure Monaco TypeScript
    configureMonacoTypeScript();

    console.log('[App] Monaco initialized');
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
