# HighReview

> 🚀 **AI-Native Local review tool** with GitHub-Style Interface

HighReview는 로컬 환경을 방해하지 않으면서 GitHub Pull Request를 강력하게 리뷰할 수 있는 도구입니다. Git Worktree를 활용하여 현재 작업 디렉토리를 건드리지 않고, **Offline-First 코드 분석**과 **Local AI**를 통해 안전하고 강력한 리뷰 환경을 제공합니다.

> 🔒 **로그인 불필요**: HighReview는 사용자의 로컬 `gh` 클라이언트와 AI 에이전트를 직접 활용하므로, 별도의 회원가입이나 인증 절차 없이 즉시 사용할 수 있습니다.

HighReview is a powerful local PR review tool that doesn't disrupt your working environment. Using Git Worktree, it provides IDE-level code analysis and AI insights without touching your current working directory.

> 🔒 **No Login or Authentication Required**: HighReview operates entirely locally using your existing `gh` client and local AI agents. No separate account or sign-up is needed.

**[View on GitHub](https://github.com/HighGarden-Studio/HighReview)** | **[Report Bug](https://github.com/HighGarden-Studio/HighReview/issues)** | **[Request Feature](https://github.com/HighGarden-Studio/HighReview/issues/new)**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![GitHub Stars](https://img.shields.io/github/stars/HighGarden-Studio/HighReview?style=social)](https://github.com/HighGarden-Studio/HighReview)

![HighReview PullRequest Review Page](/assets/images/review_main.png)
![HighReview PullRequest List Page](/assets/images/prs.png)
![HighReview PullRequest List Page - Dark](/assets/images/prs_dark.png)

## ✨ Features

### 🚀 Zero Distraction Review

- **Git Worktree Integration**: Creates isolated review environments instantly.
- **Background Indexing**: Pre-indexes symbols for instant code navigation.
- **IDE-Like Experience**: Go to Definition, Find Usages, and Symbol Search (TypeScript, Ruby, Java).

### 🤖 Universal AI Provider

Plug-and-play AI support. No API keys required for local models.

- **Supported Providers**:
  - **Claude Code CLI** (Recommended, Anthropic)
  - **Ollama** (Local Llama 3, Mistral, etc.)
  - **LM Studio** (Local, OpenAI Compatible)
- **Automatic Detection**: Automatically detects installed providers.
- **Zero Configuration**: Select your provider in the UI Settings.

### 💬 AI Assistant (Context-Aware Chat)

Ask questions about your code with full context awareness.

- **Smart Context**: Automatically includes selected code, file contents, and PR details.
- **Deep Analysis**: "Explain this function", "Find bugs in this selection", "Generate tests".
- **Multi-Modal**: Supports file attachments and reference links.

### 📊 Comprehensive Code Analysis

- **Automatic Issue Detection**: Critical bugs, warnings, and optimization suggestions.
- **Change Intent Analysis**: Understand _why_ code was changed.
- **Impact Analysis**: See potential side effects and breaking changes.
- **Visual Call Stacks**: Interactive Mermaid flowcharts and sequence diagrams.

## 🏗️ Architecture

```
HighReview/
├── apps/
│   ├── cli/          # Node.js Backend (Fastify + SQLite + Tree-sitter)
│   └── web/          # React Frontend (Vite + Monaco + React Query)
└── .highreview/      # Global Config & Storage
```

### AI Review Pipeline

```mermaid
flowchart TD
    %% Nodes
    Start(["User Initiates Review"])

    subgraph Stage1 ["Stage 1: Context Optimization"]
        Diff["Get Git Diff"]
        TreeSitter["ContextAnalyzer<br/>(Tree-sitter)"]
        OptContext["Optimized Context<br/>(Signatures & Docstrings)"]

        Diff --> TreeSitter
        TreeSitter --> |Extract| OptContext
    end

    subgraph Stage2 ["Stage 2: Map Phase (Batch Processing)"]
        Chunking["ChunkingStrategy<br/>(Split Files)"]

        Batch1["Batch 1 Review<br/>(Code Reviewer Persona)"]
        Batch2["Batch 2 Review<br/>(Code Reviewer Persona)"]
        BatchN["Batch N Review<br/>(Code Reviewer Persona)"]

        OptContext --> Chunking
        Chunking --> Batch1
        Chunking --> Batch2
        Chunking --> BatchN
    end

    subgraph Stage3 ["Stage 3: Reduce Phase (Global Analysis)"]
        Collect["Collect & Merge Results"]
        Architect["PR Architect AI<br/>(RefineSummaryWithAI)"]

        Output1["Global Change Intent"]
        Output2["Impact Analysis"]
        Output3["Logic Flow Diagrams<br/>(Mermaid)"]
    end

    %% Edge Connections
    Start --> Diff

    Batch1 --> |Issues + 1-Line Summary| Collect
    Batch2 --> |Issues + 1-Line Summary| Collect
    BatchN --> |Issues + 1-Line Summary| Collect

    Collect --> |All Summaries| Architect

    Architect --> Output1
    Architect --> Output2
    Architect --> Output3

    Output1 --> Final(["Final Review Report"])
    Output2 --> Final
    Output3 --> Final

    %% Styling
    classDef stage fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef process fill:#fff9c4,stroke:#fbc02d,stroke-width:2px;
    classDef ai fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,rx:10,ry:10;

    class Stage1,Stage2,Stage3 stage;
    class TreeSitter,Chunking,Collect process;
    class Batch1,Batch2,BatchN,Architect ai;
```

## 🛠 Tech Stack

**Backend (CLI)**

- **Runtime**: Node.js 18+
- **Framework**: Fastify
- **Database**: SQLite (`better-sqlite3`) for robust local storage.
- **Analysis**: Tree-sitter (Java, TS, Ruby, Python, Kotlin) for precise code parsing.
- **AI Integration**: Custom Provider Architecture (Claude, Ollama, LM Studio).

**Frontend (Web)**

- **Framework**: React 18, Vite
- **Editor**: Monaco Editor (VS Code core)
- **State**: React Query, Zustand
- **UI**: Allotment (Splits), TailwindCSS, Radix UI
- **Visualization**: Mermaid.js for flows and charts.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: >= 18.0.0
- **Git**: >= 2.30.0
- **GitHub CLI**: `gh auth login` required for PR fetching.
- **AI Provider** (Optional but Recommended):
  - [Claude Code](https://claude.ai/download)
  - [Ollama](https://ollama.ai)

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

3. **Start Development Server**

   ```bash
   # Starts both CLI (port 8765) and Web (port 5273)
   npm run dev
   ```

4. **Open in Browser**
   - Go to `http://localhost:5273`
   - **Settings Setup**: Navigate to the Settings page to select your AI Provider.

![Settings Page](/assets/images/settings_ai_provider.png)

## 📖 Usage Guide

### 1. Select a Pull Request

Review-requested PRs are automatically loaded. Click any card to start a workspace-isolated review.

![Pull Request List](/assets/images/prs.png)
![Pull Request Detail](/assets/images/pr_detail.png)

#### 2. AI Review Options

When re-running a review, you can customize the analysis depth:

- **🧠 Context-Aware Review**: Uses Tree-sitter to find callers and implementations of modified code in the project.
- **🎯 Change Intent Analysis**: Determines _why_ code was changed (File-level or Block-level).
- **📊 Code Visualization**: Generates Mermaid Flowcharts or Sequence Diagrams or Class Diagrams for modified functions.
- **🔍 Impact Analysis**: Assesses broader impact (Module, Project, or Dependencies).
- **✨ Semantic Diff**: Detects moved code, refactoring patterns, and ignores whitespace/comments.
- **💬 Custom Prompt**: Add your own specific instructions for the AI reviewer.

![AI Code Review Options](/assets/images/pr_ai_code_review_options.png)

### 3. Review with AI

- **Auto-Review**: The AI analyzes the PR on load. Click "Re-run" to trigger a fresh analysis with custom options.
- **Ask Assistant**: Highlight any code in the specialized "Diff Editor" or "File Tree" and ask questions in the side panel.

![Code Visualization](/assets/images/review_main.png)
![Code Visualization](/assets/images/review_diagram.png)
![AI Assistant Panel](/assets/images/review_ai_assistant_1.png)
![AI Assistant Panel](/assets/images/review_ai_assistant_2.png)

### 4. Navigate Code

- **Go to Definition**: Right-click on symbols (even in Ruby/Java) to jump to their definition.
- **Find Usages**: See where functions or classes are used across the PR.

## 📄 License

This project is licensed under the **Apache License 2.0** - see the [LICENSE](LICENSE) file for details.

---

Made with ❤️ by [HighGarden Studio](https://github.com/HighGarden-Studio)
