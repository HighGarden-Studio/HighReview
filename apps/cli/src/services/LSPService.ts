import { spawn, ChildProcess } from 'child_process';
import * as rpc from 'vscode-ws-jsonrpc';
import * as rpcServer from 'vscode-ws-jsonrpc/server';
import { WebSocket } from 'ws';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { existsSync, mkdirSync, createWriteStream, chmodSync } from 'fs';
import { execa } from 'execa';
import * as https from 'https';
import * as tar from 'tar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adapter to convert ws WebSocket to IWebSocket interface expected by vscode-ws-jsonrpc
class WebSocketAdapter {
  constructor(private socket: WebSocket) {}

  send(content: string): void {
    this.socket.send(content);
  }

  onMessage(cb: (data: any) => void): void {
    this.socket.on('message', (data: any) => cb(data));
  }

  onError(cb: (reason: any) => void): void {
    this.socket.on('error', (error: any) => cb(error));
  }

  onClose(cb: (code: number, reason: string) => void): void {
    this.socket.on('close', (code: number, reason: string) => cb(code, reason));
  }

  dispose(): void {
    this.socket.close();
  }
}

// LSP installation directory
const LSP_DIR = path.join(homedir(), '.highreview', 'lsp-servers');

// LSP download URLs
const JDTLS_URL = 'https://download.eclipse.org/jdtls/snapshots/jdt-language-server-latest.tar.gz';
const KOTLIN_LS_VERSION = '1.3.11';
const KOTLIN_LS_URL = `https://github.com/fwcd/kotlin-language-server/releases/download/${KOTLIN_LS_VERSION}/server.zip`;

type LanguageId =
  // Bundled LSPs (npm packages)
  | 'typescript' | 'javascript' | 'python' | 'css' | 'html' | 'json'
  // User-installable LSPs
  | 'ruby' | 'java' | 'go' | 'rust' | 'cpp' | 'c' | 'csharp'
  | 'php' | 'swift' | 'kotlin' | 'dart' | 'scala' | 'lua' | 'perl';

interface LanguageServerConfig {
  command: string;
  args: string[];
  name: string;
  bundled: boolean; // Whether this LSP is bundled with the app
  popularity: number; // 1-20, for sorting
  description: string; // Short description
}

export class LSPService {
  private processes: Map<string, any> = new Map();
  private downloadingLSPs: Set<string> = new Set(); // Track ongoing downloads

  constructor() {
    // Ensure LSP directory exists
    this.ensureLSPDir();
  }

  /**
   * Ensure the LSP installation directory exists
   */
  private ensureLSPDir(): void {
    if (!existsSync(LSP_DIR)) {
      mkdirSync(LSP_DIR, { recursive: true });
      console.log(`[LSP] Created LSP directory: ${LSP_DIR}`);
    }
  }

  /**
   * Download a file from URL
   */
  private async downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(dest);
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          if (response.headers.location) {
            https.get(response.headers.location, (redirectResponse) => {
              redirectResponse.pipe(file);
              file.on('finish', () => {
                file.close();
                resolve();
              });
            }).on('error', reject);
          } else {
            reject(new Error('Redirect without location header'));
          }
        } else {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }
      }).on('error', (err) => {
        file.close();
        reject(err);
      });
    });
  }

  /**
   * Download and set up Eclipse JDT Language Server for Java
   */
  private async downloadJavaLSP(): Promise<void> {
    const jdtlsDir = path.join(LSP_DIR, 'jdtls');
    const jdtlsScript = path.join(jdtlsDir, 'bin', 'jdtls');

    if (existsSync(jdtlsScript)) {
      console.log('[LSP] Java LSP already downloaded');
      return;
    }

    if (this.downloadingLSPs.has('java')) {
      console.log('[LSP] Java LSP download already in progress');
      // Wait for existing download
      while (this.downloadingLSPs.has('java')) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      return;
    }

    this.downloadingLSPs.add('java');

    try {
      console.log('[LSP] Downloading Java LSP (jdtls)...');

      // Download tar.gz
      const tarPath = path.join(LSP_DIR, 'jdtls.tar.gz');
      await this.downloadFile(JDTLS_URL, tarPath);

      console.log('[LSP] Extracting Java LSP...');

      // Create directory
      if (!existsSync(jdtlsDir)) {
        mkdirSync(jdtlsDir, { recursive: true });
      }

      // Extract tar.gz
      await tar.extract({
        file: tarPath,
        cwd: jdtlsDir,
      });

      // Make the launch script executable
      if (existsSync(jdtlsScript)) {
        chmodSync(jdtlsScript, '755');
      }

      console.log('[LSP] Java LSP installed successfully');
    } catch (error) {
      console.error('[LSP] Failed to download Java LSP:', error);
      throw error;
    } finally {
      this.downloadingLSPs.delete('java');
    }
  }

  /**
   * Download and set up Kotlin Language Server
   */
  private async downloadKotlinLSP(): Promise<void> {
    const kotlinDir = path.join(LSP_DIR, 'kotlin-language-server');
    const kotlinScript = path.join(kotlinDir, 'bin', 'kotlin-language-server');

    if (existsSync(kotlinScript)) {
      console.log('[LSP] Kotlin LSP already downloaded');
      return;
    }

    if (this.downloadingLSPs.has('kotlin')) {
      console.log('[LSP] Kotlin LSP download already in progress');
      // Wait for existing download
      while (this.downloadingLSPs.has('kotlin')) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      return;
    }

    this.downloadingLSPs.add('kotlin');

    try {
      console.log('[LSP] Downloading Kotlin LSP...');

      // Download zip
      const zipPath = path.join(LSP_DIR, 'kotlin-ls.zip');
      await this.downloadFile(KOTLIN_LS_URL, zipPath);

      console.log('[LSP] Extracting Kotlin LSP...');

      // Create directory
      if (!existsSync(kotlinDir)) {
        mkdirSync(kotlinDir, { recursive: true });
      }

      // Extract zip using unzip command
      await execa('unzip', ['-q', zipPath, '-d', kotlinDir]);

      // Make the launch script executable
      if (existsSync(kotlinScript)) {
        chmodSync(kotlinScript, '755');
      }

      console.log('[LSP] Kotlin LSP installed successfully');
    } catch (error) {
      console.error('[LSP] Failed to download Kotlin LSP:', error);
      throw error;
    } finally {
      this.downloadingLSPs.delete('kotlin');
    }
  }

  private languageServers: Map<LanguageId, LanguageServerConfig> = new Map([
    // === BUNDLED LSPs (Included with HighReview) ===
    ['typescript', {
      command: 'npx',
      args: ['typescript-language-server', '--stdio'],
      name: 'TypeScript Language Server',
      bundled: true,
      popularity: 2,
      description: 'IntelliSense, code navigation, and refactoring for TypeScript'
    }],
    ['javascript', {
      command: 'npx',
      args: ['typescript-language-server', '--stdio'],
      name: 'JavaScript Language Server',
      bundled: true,
      popularity: 1,
      description: 'IntelliSense, code navigation, and refactoring for JavaScript'
    }],
    ['python', {
      command: 'npx',
      args: ['pyright-langserver', '--stdio'],
      name: 'Pyright',
      bundled: true,
      popularity: 3,
      description: 'Fast type checker and language server for Python'
    }],
    ['css', {
      command: 'npx',
      args: ['vscode-css-languageserver-bin', '--stdio'],
      name: 'CSS Language Server',
      bundled: true,
      popularity: 15,
      description: 'IntelliSense and validation for CSS, SCSS, and Less'
    }],
    ['html', {
      command: 'npx',
      args: ['vscode-html-languageserver-bin', '--stdio'],
      name: 'HTML Language Server',
      bundled: true,
      popularity: 14,
      description: 'IntelliSense and validation for HTML'
    }],
    ['json', {
      command: 'npx',
      args: ['vscode-json-languageserver', '--stdio'],
      name: 'JSON Language Server',
      bundled: true,
      popularity: 16,
      description: 'IntelliSense and validation for JSON'
    }],

    // === AUTO-DOWNLOADABLE LSPs ===
    ['java', {
      command: path.join(LSP_DIR, 'jdtls', 'bin', 'jdtls'),
      args: [],
      name: 'Eclipse JDT Language Server',
      bundled: true, // Auto-downloaded on first use
      popularity: 4,
      description: 'Full IDE features for Java development'
    }],
    ['csharp', {
      command: 'omnisharp',
      args: ['--languageserver', '--stdio'],
      name: 'OmniSharp',
      bundled: false,
      popularity: 5,
      description: 'Language server for C# and .NET'
    }],
    ['cpp', {
      command: 'clangd',
      args: [],
      name: 'clangd',
      bundled: false,
      popularity: 6,
      description: 'Language server for C++ based on Clang'
    }],
    ['c', {
      command: 'clangd',
      args: [],
      name: 'clangd',
      bundled: false,
      popularity: 7,
      description: 'Language server for C based on Clang'
    }],
    ['php', {
      command: 'intelephense',
      args: ['--stdio'],
      name: 'Intelephense',
      bundled: false,
      popularity: 8,
      description: 'Fast and feature-rich PHP language server'
    }],
    ['swift', {
      command: 'sourcekit-lsp',
      args: [],
      name: 'SourceKit-LSP',
      bundled: false,
      popularity: 9,
      description: 'Official Swift language server'
    }],
    ['kotlin', {
      command: path.join(LSP_DIR, 'kotlin-language-server', 'server', 'bin', 'kotlin-language-server'),
      args: [],
      name: 'Kotlin Language Server',
      bundled: true, // Auto-downloaded on first use
      popularity: 10,
      description: 'Language server for Kotlin'
    }],
    ['go', {
      command: 'gopls',
      args: [],
      name: 'gopls',
      bundled: false,
      popularity: 11,
      description: 'Official Go language server'
    }],
    ['rust', {
      command: 'rust-analyzer',
      args: [],
      name: 'rust-analyzer',
      bundled: false,
      popularity: 12,
      description: 'Fast and feature-rich Rust language server'
    }],
    ['ruby', {
      command: 'solargraph',
      args: ['stdio'],
      name: 'Solargraph',
      bundled: false,
      popularity: 13,
      description: 'IntelliSense and code navigation for Ruby'
    }],
    ['dart', {
      command: 'dart',
      args: ['language-server'],
      name: 'Dart Analysis Server',
      bundled: false,
      popularity: 17,
      description: 'Official Dart language server for Flutter development'
    }],
    ['scala', {
      command: 'metals',
      args: [],
      name: 'Metals',
      bundled: false,
      popularity: 18,
      description: 'Language server for Scala'
    }],
    ['lua', {
      command: 'lua-language-server',
      args: [],
      name: 'Lua Language Server',
      bundled: false,
      popularity: 19,
      description: 'Feature-rich language server for Lua'
    }],
    ['perl', {
      command: 'perl-language-server',
      args: [],
      name: 'Perl Navigator',
      bundled: false,
      popularity: 20,
      description: 'Language server for Perl'
    }]
  ]);

  /**
   * Find Java 21+ installation dynamically (cross-platform)
   */
  private async findJava21(): Promise<string | null> {
    try {
      // Try using /usr/libexec/java_home (macOS)
      if (process.platform === 'darwin') {
        try {
          const { stdout } = await execa('/usr/libexec/java_home', ['-v', '21+']);
          const javaHome = stdout.trim();
          if (javaHome && existsSync(javaHome)) {
            return javaHome;
          }
        } catch {
          // Fall through to other methods
        }
      }

      // Try common installation paths
      const possiblePaths = [
        // Homebrew (macOS Intel)
        '/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
        '/usr/local/opt/openjdk@22/libexec/openjdk.jdk/Contents/Home',
        '/usr/local/opt/openjdk@23/libexec/openjdk.jdk/Contents/Home',
        // Homebrew (macOS Apple Silicon)
        '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
        '/opt/homebrew/opt/openjdk@22/libexec/openjdk.jdk/Contents/Home',
        '/opt/homebrew/opt/openjdk@23/libexec/openjdk.jdk/Contents/Home',
        // System installations (macOS)
        '/Library/Java/JavaVirtualMachines/openjdk-21.jdk/Contents/Home',
        '/Library/Java/JavaVirtualMachines/openjdk-22.jdk/Contents/Home',
        '/Library/Java/JavaVirtualMachines/openjdk-23.jdk/Contents/Home',
        // Linux common paths
        '/usr/lib/jvm/java-21-openjdk',
        '/usr/lib/jvm/java-22-openjdk',
        '/usr/lib/jvm/java-23-openjdk',
        '/usr/lib/jvm/jdk-21',
        '/usr/lib/jvm/jdk-22',
        '/usr/lib/jvm/jdk-23'
      ];

      for (const javaPath of possiblePaths) {
        if (existsSync(javaPath)) {
          return javaPath;
        }
      }

      // Check JAVA_HOME environment variable
      if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) {
        // Verify it's version 21+
        try {
          const { stdout } = await execa(`${process.env.JAVA_HOME}/bin/java`, ['-version']);
          if (stdout.includes('21.') || stdout.includes('22.') || stdout.includes('23.')) {
            return process.env.JAVA_HOME;
          }
        } catch {
          // Fall through
        }
      }

      return null;
    } catch (error) {
      console.error('[LSP] Error finding Java 21+:', error);
      return null;
    }
  }

  /**
   * Start a language server process and connect it to a WebSocket
   */
  async startLanguageServer(
    socket: WebSocket,
    workspaceRoot: string,
    language: LanguageId = 'typescript'
  ): Promise<void> {
    console.log(`[LSP] Starting ${language} language server for workspace: ${workspaceRoot}`);

    try {
      const config = this.languageServers.get(language);
      if (!config) {
        console.error(`[LSP] Unsupported language: ${language}`);
        socket.close(1008, `Unsupported language: ${language}`);
        return;
      }

      // Convert WebSocket to IConnection using adapter
      const wsAdapter = new WebSocketAdapter(socket);
      const clientConnection = rpcServer.createWebSocketConnection(wsAdapter as any);

      // Prepare spawn options with Java 21+ for jdtls
      const spawnOptions: any = {};
      if (language === 'java') {
        // Eclipse JDT LS requires Java 21+, find it dynamically
        const java21Path = await this.findJava21();
        if (!java21Path) {
          console.error('[LSP] Java 21+ not found. jdtls requires Java 21 or higher.');
          console.error('[LSP] Please install Java 21+:');
          console.error('[LSP]   macOS: brew install openjdk@21');
          console.error('[LSP]   Linux: sudo apt install openjdk-21-jdk');
          socket.close(1011, 'Java 21+ required for Java Language Server');
          return;
        }
        spawnOptions.env = {
          ...process.env,
          JAVA_HOME: java21Path,
          PATH: `${java21Path}/bin:${process.env.PATH}`
        };
        console.log(`[LSP] Using Java 21+ for jdtls: ${java21Path}`);
      }

      // Launch the language server process
      const serverConnection = rpcServer.createServerProcess(
        config.name,
        config.command,
        config.args,
        spawnOptions
      );

      if (!serverConnection) {
        console.error(`[LSP] Failed to create server process for ${language}`);
        socket.close(1011, 'Failed to create server process');
        return;
      }

      const processId = `${language}-${Date.now()}`;
      this.processes.set(processId, serverConnection as any);

      // Forward the connection from WebSocket to the language server
      rpcServer.forward(clientConnection, serverConnection);
      console.log(`[LSP] ${config.name} connection established`);

      // Handle socket close
      socket.on('close', () => {
        console.log(`[LSP] WebSocket closed, disposing ${language} language server connections`);
        if (serverConnection) {
          serverConnection.dispose();
        }
        if (clientConnection) {
          clientConnection.dispose();
        }
        this.processes.delete(processId);
      });
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
        if ('kill' in process) {
          (process as any).kill();
        } else if ('dispose' in process) {
          (process as any).dispose();
        }
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

    // Bundled npm package LSPs are always available (TypeScript, Python, etc.)
    if (config.bundled && config.command === 'npx') {
      return true;
    }

    // Auto-downloadable LSPs (Java, Kotlin)
    if (config.bundled && (language === 'java' || language === 'kotlin')) {
      // Check if already downloaded
      if (existsSync(config.command)) {
        return true;
      }

      // Auto-download on first check
      try {
        if (language === 'java') {
          await this.downloadJavaLSP();
        } else if (language === 'kotlin') {
          await this.downloadKotlinLSP();
        }
        return existsSync(config.command);
      } catch (error) {
        console.error(`[LSP] Failed to auto-download ${language} LSP:`, error);
        return false;
      }
    }

    // For external LSPs, check if command exists in PATH
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
    const config = this.languageServers.get(language);

    // Bundled LSPs don't need installation
    if (config?.bundled) {
      if (language === 'java' || language === 'kotlin') {
        return 'Auto-downloads on first use (included with HighReview)';
      }
      return 'Included with HighReview';
    }

    const instructions: Record<string, string> = {
      // User-installable LSPs
      csharp: 'brew install omnisharp (Mac) or download from https://github.com/OmniSharp/omnisharp-roslyn/releases',
      cpp: 'brew install llvm (includes clangd) or apt-get install clangd',
      c: 'brew install llvm (includes clangd) or apt-get install clangd',
      php: 'npm install -g intelephense',
      swift: 'Included with Xcode or download from https://swift.org/download/',
      go: 'go install golang.org/x/tools/gopls@latest (requires Go installed)',
      rust: 'rustup component add rust-analyzer (requires Rust installed)',
      ruby: 'gem install solargraph (requires Ruby installed)',
      dart: 'Included with Flutter SDK or Dart SDK',
      scala: 'cs install metals (requires Coursier) or brew install scalameta/metals/metals',
      lua: 'brew install lua-language-server or download from https://luals.github.io/#install',
      perl: 'cpan Perl::LanguageServer'
    };
    return instructions[language] || 'See language documentation for installation instructions';
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
