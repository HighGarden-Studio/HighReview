# HighReview

> 🚀 AI-Powered Local PR Review Tool with GitHub-Style Interface

HighReview는 로컬 환경을 방해하지 않으면서 GitHub Pull Request를 강력하게 리뷰할 수 있는 도구입니다. Git Worktree를 활용하여 현재 작업 디렉토리를 건드리지 않고, IDE 수준의 코드 분석과 AI 인사이트를 제공합니다.

HighReview is a powerful local PR review tool that doesn't disrupt your working environment. Using Git Worktree, it provides IDE-level code analysis and AI insights without touching your current working directory.

**[View on GitHub](https://github.com/HighGarden-Studio/HighReview)** | **[Report Bug](https://github.com/HighGarden-Studio/HighReview/issues)** | **[Request Feature](https://github.com/HighGarden-Studio/HighReview/issues/new)**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![GitHub Stars](https://img.shields.io/github/stars/HighGarden-Studio/HighReview?style=social)](https://github.com/HighGarden-Studio/HighReview)
[![GitHub Issues](https://img.shields.io/github/issues/HighGarden-Studio/HighReview)](https://github.com/HighGarden-Studio/HighReview/issues)

## ✨ Features

### 🎯 Core Features
- **Zero Distraction Review**: Uses Git Worktree to create isolated review environments
- **GitHub-Style Interface**: Familiar 4-panel layout (File Tree | Before | After | Info Panel)
- **AI-Powered Analysis**: Comprehensive code review with AI suggestions
- **Real-time Chat Assistant**: Ask questions about code with context awareness
- **Code Navigation**: Go to Definition, Find Usages, and more with LSP integration
- **Inline Comments**: GitHub-style comment system with Markdown support
- **Call Stack Visualization**: Mermaid flowcharts and sequence diagrams

### 🤖 AI Review Features
- **Automatic Issue Detection**: Critical issues, warnings, and suggestions
- **Change Intent Analysis**: Understand why changes were made
- **Impact Analysis**: Assess scope and breaking changes
- **Semantic Search**: Find code by meaning, not just keywords
- **Multi-Provider Support**: Claude Code, Ollama, LM Studio

### 💬 Interactive Features
- **File References**: `@file:path:line` syntax to reference code
- **Issue References**: `@issue:ID`, `@change:ID`, `@impact:ID`
- **Markdown WYSIWYG Editor**: Rich text editing for comments
- **Streaming Responses**: Real-time typing effect for AI replies
- **Dark/Light Theme**: Automatic theme switching

## 📸 Screenshots

> **Note**: Add screenshots here when available

## 🏗️ Architecture

```
HighReview/
├── apps/
│   ├── cli/          # Node.js backend server
│   │   ├── src/
│   │   │   ├── routes/       # API routes
│   │   │   ├── services/     # Business logic
│   │   │   │   ├── providers/  # AI providers (Claude, Ollama, LM Studio)
│   │   │   │   └── ...
│   │   │   └── index.ts      # Server entry point
│   │   └── package.json
│   └── web/          # React frontend
│       ├── src/
│       │   ├── components/   # UI components
│       │   ├── contexts/     # React contexts
│       │   ├── hooks/        # Custom hooks
│       │   ├── pages/        # Page components
│       │   └── utils/        # Utility functions
│       └── package.json
└── package.json      # Root workspace config
```

### Tech Stack

**Backend (CLI)**
- Node.js 18+
- Fastify (Web Server)
- TypeScript
- GitHub CLI (`gh`)
- SQLite (Data persistence)

**Frontend (Web)**
- React 18
- TypeScript
- Vite
- Monaco Editor (Code editor)
- Allotment (Resizable panels)
- React Query (Data fetching)
- Mermaid (Diagrams)
- Lucide React (Icons)

**AI Providers**
- Claude Code CLI
- Ollama
- LM Studio

## 🚀 Getting Started

### Prerequisites

- **Node.js**: >= 18.0.0
- **Git**: >= 2.30.0
- **GitHub CLI**: Install from https://cli.github.com
- **AI Provider** (Choose one):
  - Claude Code CLI: https://claude.ai/download
  - Ollama: https://ollama.ai
  - LM Studio: https://lmstudio.ai

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/HighGarden-Studio/HighReview.git
   cd HighReview
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Authenticate with GitHub**
   ```bash
   gh auth login
   ```

   HighReview uses GitHub CLI for authentication - no token configuration needed!

4. **Install AI Provider** (Choose one)
   - **Claude Code CLI** (Recommended): https://claude.ai/download
   - **Ollama**: https://ollama.ai
   - **LM Studio**: https://lmstudio.ai

   You can select your AI provider in the Settings page after starting the app.

### Usage

#### Development Mode

```bash
# Start both backend and frontend in dev mode
npm run dev

# Or start them separately
npm run dev:cli    # Backend only (port 8765)
npm run dev:web    # Frontend only (port 5173)
```

Then open http://localhost:5173 in your browser.

#### Production Build

```bash
# Build both apps
npm run build

# Start production server
npm start
```

The production server will serve the built frontend and API on port 8765.

## 📖 Usage Guide

### 1. Select a Pull Request

1. Navigate to the home page
2. View your review-requested PRs or browse involved PRs
3. Click on a PR to start reviewing

### 2. Review Interface

The review screen has 4 main panels:

- **File Tree**: Shows all changed files
- **Diff View**: Side-by-side comparison (Before | After)
- **AI Review Panel**: AI-generated insights and suggestions
- **Chat Panel**: Interactive Q&A with AI

### 3. Add Comments

#### Inline Comments
1. Click on any line in the code editor
2. Write your comment using Markdown
3. Choose "Add single comment" or "Add to review"

#### Review Summary
1. Click "Submit Review" button
2. Choose review type: Comment / Approve / Request Changes
3. Write optional summary
4. Submit

### 4. AI Features

#### Ask AI
- Select code and type your question
- Use file references: `@file:path.ts:42`
- Reference issues: `@issue:0`, `@change:1`

#### AI Review
- Automatically runs on PR load
- Click "Re-run" to refresh analysis
- View issues, change intents, and impact analysis

#### Call Stack Visualization
- Click on function names to see call stacks
- View flowcharts and sequence diagrams
- Navigate to referenced files

## 🎨 Customization

### AI Provider Configuration

AI providers are automatically detected and can be selected in the Settings page:

1. Navigate to Settings (gear icon)
2. Select your installed AI provider:
   - **Claude Code CLI** (recommended)
   - **Ollama** (local inference)
   - **LM Studio** (local inference)
3. The selection is automatically saved to `~/.highreview/config.json`

No environment variables needed - the app detects available providers automatically!

### Theme

Toggle theme in the top-right corner or press `Cmd/Ctrl + Shift + T`.

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Toggle AI Chat | `Cmd/Ctrl + /` |
| Next File | `j` |
| Previous File | `k` |
| Add Comment | `c` |
| Submit Review | `Cmd/Ctrl + Enter` |
| Focus Search | `f` |
| Show Shortcuts | `?` |

## 🔧 Configuration

### Environment Variables

All configuration is optional. The app works out of the box with GitHub CLI authentication.

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8765` |
| `HIGHREVIEW_DATA_DIR` | Data storage directory | `~/.highreview` |
| `NODE_ENV` | Environment mode | `development` |

**Note:**
- No `GITHUB_TOKEN` needed - uses GitHub CLI (`gh`) authentication
- No `AI_PROVIDER` needed - select in Settings UI

### Data Storage

HighReview stores data in `~/.highreview/`:

```
~/.highreview/
├── config.json           # User configuration
├── highreview.db         # SQLite database
├── worktrees/            # Git worktrees for PRs
│   ├── owner-repo-123/
│   └── ...
└── cache/                # AI response cache
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

1. Fork the repository at [HighGarden-Studio/HighReview](https://github.com/HighGarden-Studio/HighReview)
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request to [HighGarden-Studio/HighReview](https://github.com/HighGarden-Studio/HighReview/pulls)

### Code Style

- TypeScript with strict mode
- ESLint + Prettier
- Functional components with hooks
- React Query for data fetching

## 📝 Roadmap

### v0.2.0 (Upcoming)
- [ ] Batch comment resolution
- [ ] Comment templates
- [ ] Review analytics
- [ ] Collaborative review with real-time cursors
- [ ] Video annotations

### v0.3.0
- [ ] Auto-fix suggestions from AI
- [ ] Custom review checklists
- [ ] Integration with JIRA/Linear
- [ ] Slack notifications
- [ ] Export review reports (PDF/Markdown)

### Future
- [ ] VS Code extension
- [ ] JetBrains plugin
- [ ] GitLab support
- [ ] Bitbucket support
- [ ] Self-hosted GitHub Enterprise support

## 🐛 Known Issues

- Mermaid diagrams may not render on first load (refresh to fix)
- Large PRs (100+ files) may be slow to load
- LSP features require TypeScript/JavaScript projects

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [Mermaid](https://mermaid.js.org/) - Diagram rendering
- [Claude AI](https://claude.ai/) - AI assistance
- [GitHub CLI](https://cli.github.com/) - GitHub integration
- [React](https://react.dev/) - UI framework

## 📧 Contact

- GitHub Issues: [Report a bug](https://github.com/HighGarden-Studio/HighReview/issues)
- Discussions: [Join the conversation](https://github.com/HighGarden-Studio/HighReview/discussions)

## 📚 Additional Documentation

- [AI Integration Guide](AI_INTEGRATION_COMPLETE.md)
- [AI Provider Architecture](AI_PROVIDER_ARCHITECTURE.md)
- [Code Navigation Guide](CODE_NAVIGATION_GUIDE.md)
- [Implementation Status](IMPLEMENTATION_STATUS.md)

---

Made with ❤️ by [HighGarden Studio](https://github.com/HighGarden-Studio)
