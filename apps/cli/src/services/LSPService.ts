import { spawn, ChildProcess } from 'child_process';
import * as rpc from 'vscode-ws-jsonrpc';
import * as rpcServer from 'vscode-ws-jsonrpc/server';
import { WebSocket } from 'ws';
import * as path from 'path';

type LanguageId = 'typescript' | 'javascript' | 'ruby' | 'java';

interface LanguageServerConfig {
  command: string;
  args: string[];
  name: string;
}

export class LSPService {
  private processes: Map<string, ChildProcess> = new Map();
  private languageServers: Map<LanguageId, LanguageServerConfig> = new Map([
    ['typescript', {
      command: 'typescript-language-server',
      args: ['--stdio'],
      name: 'TypeScript Language Server'
    }],
    ['javascript', {
      command: 'typescript-language-server',
      args: ['--stdio'],
      name: 'JavaScript Language Server'
    }],
    ['ruby', {
      command: 'solargraph',
      args: ['stdio'],
      name: 'Solargraph (Ruby Language Server)'
    }],
    ['java', {
      command: 'jdtls',
      args: [],
      name: 'Eclipse JDT Language Server'
    }]
  ]);

  /**
   * Start a language server process and connect it to a WebSocket
   */
  startLanguageServer(
    socket: WebSocket,
    workspaceRoot: string,
    language: LanguageId = 'typescript'
  ): void {
    console.log(`[LSP] Starting ${language} language server for workspace: ${workspaceRoot}`);

    try {
      const config = this.languageServers.get(language);
      if (!config) {
        console.error(`[LSP] Unsupported language: ${language}`);
        socket.close(1008, `Unsupported language: ${language}`);
        return;
      }

      // Launch the language server process
      const serverProcess = rpcServer.createServerProcess(
        config.name,
        config.command,
        config.args
      );

      if (!serverProcess) {
        console.error(`[LSP] Failed to create server process for ${language}`);
        socket.close(1011, 'Failed to create server process');
        return;
      }

      const processId = `${language}-${Date.now()}`;
      this.processes.set(processId, serverProcess);

      // Forward the connection from WebSocket to the language server
      if (rpcServer.forward) {
        rpcServer.forward(socket as any, serverProcess);
        console.log(`[LSP] ${config.name} connection established`);
      } else {
        console.error('[LSP] rpcServer.forward is not available');
        socket.close(1011, 'LSP forwarding not available');
        serverProcess.kill();
        this.processes.delete(processId);
        return;
      }

      // Handle socket close
      socket.on('close', () => {
        console.log(`[LSP] WebSocket closed, killing ${language} language server`);
        serverProcess.kill();
        this.processes.delete(processId);
      });

      serverProcess.on('exit', (code) => {
        console.log(`[LSP] ${config.name} exited with code ${code}`);
        this.processes.delete(processId);
      });

      serverProcess.on('error', (error) => {
        console.error(`[LSP] ${config.name} error:`, error);
      });

      // Log stderr for debugging
      if (serverProcess.stderr) {
        serverProcess.stderr.on('data', (data) => {
          console.error(`[LSP] ${config.name} stderr:`, data.toString());
        });
      }
    } catch (error) {
      console.error(`[LSP] Failed to start language server for ${language}:`, error);
      socket.close(1011, 'Failed to start language server');
    }
  }

  /**
   * Kill all running language server processes
   */
  killAll(): void {
    console.log(`[LSP] Killing ${this.processes.size} language server processes`);
    for (const [id, process] of this.processes.entries()) {
      try {
        process.kill();
      } catch (error) {
        console.error(`[LSP] Failed to kill process ${id}:`, error);
      }
      this.processes.delete(id);
    }
  }

  /**
   * Check if a language server is installed
   */
  async checkInstalled(language: LanguageId = 'typescript'): Promise<boolean> {
    const config = this.languageServers.get(language);
    if (!config) {
      return false;
    }

    return new Promise((resolve) => {
      const check = spawn('which', [config.command]);
      check.on('close', (code) => {
        resolve(code === 0);
      });
      check.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Get installation instructions for a language server
   */
  getInstallInstructions(language: LanguageId): string {
    const instructions: Record<LanguageId, string> = {
      typescript: 'npm install -g typescript-language-server typescript',
      javascript: 'npm install -g typescript-language-server typescript',
      ruby: 'gem install solargraph',
      java: 'Download from: https://download.eclipse.org/jdtls/milestones/?d'
    };
    return instructions[language] || 'Unknown language server';
  }

  /**
   * Check all language servers and return installation status
   */
  async checkAllServers(): Promise<Map<LanguageId, boolean>> {
    const status = new Map<LanguageId, boolean>();
    for (const language of this.languageServers.keys()) {
      status.set(language, await this.checkInstalled(language));
    }
    return status;
  }
}
