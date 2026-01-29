# HighReview Project Guidelines

HighReview is a local-first code review tool that uses `git worktree` to provide an isolated, context-aware review environment without disturbing the developer's current working directory.

## 1. Commands

- **Install Dependencies:** `npm install`
- **Development Mode:** `npm run dev` (Starts backend server & frontend watcher concurrently)
- **Build Production:** `npm run build` (Builds React frontend to `/dist/public` and compiles TS backend to `/dist`)
- **Run CLI (Dev):** `npm start -- review` (Executes the CLI logic directly)
- **Test:** `npm test` (Runs Vitest/Jest)
- **Lint/Format:** `npm run lint` / `npm run format`

## 2. Architecture Overview

The system consists of 3 distinct layers:

1.  **CLI (Controller):**
    - Entry point (`bin/highreview.js`).
    - Handles arguments and launches the local server.
    - **CRITICAL:** Manages `git worktree`. It creates shadow repositories in `~/.highreview/worktrees/`.
2.  **Local Server (Backend):**
    - Framework: **Fastify**.
    - Serves the compiled Frontend (Static).
    - Acts as an **LSP Proxy** (WebSocket) to communicate with Language Servers.
    - Handles GitHub API requests and AI (Claude) interactions.
3.  **Frontend (UI):**
    - Framework: **React + Vite**.
    - Key Component: **Monaco Editor** (for Diff View & Code Editing).
    - State: TanStack Query.

## 3. Core Development Principles (Must Follow)

### A. Zero Distraction (Filesystem Safety)
- **NEVER** modify files in the user's Current Working Directory (CWD) except for creating a configuration file (`.highreviewrc`) if requested.
- All review operations must happen in the **Shadow Directory** (`~/.highreview/worktrees/...`).
- When checking out a PR, always use the shadow directory, never the user's main repo.

### B. Lightweight First
- Avoid installing `node_modules` in the shadow directory unless explicitly required by the user.
- The LSP should be configured to work in "partial mode" or "syntax-only mode" if full dependencies are missing.

### C. Tech Stack & Style
- **Language:** TypeScript (Strict mode enabled).
- **Styling:** Tailwind CSS (for UI components).
- **State Management:** React Context or Zustand for simple UI state; TanStack Query for server data.
- **Async:** Always use `async/await` over `.then()`.
- **Error Handling:** CLI errors must be printed to `stderr` with clear, human-readable messages (avoid raw stack traces for user errors).

## 4. Directory Structure

```text
/
├── bin/            # CLI entry point
├── src/
│   ├── cli/        # CLI logic (git worktree, auth)
│   ├── server/     # Fastify backend & LSP proxy
│   ├── web/        # React Frontend (Vite project)
│   └── shared/     # Shared types/utils
├── scripts/        # Build/Dev scripts
└── ...
```

## 5. Key Libraries
- commander: CLI argument parsing.
- execa: Executing git commands and LSP binaries.
- fastify: Backend server.
- better-sqlite3: Local caching database.
- monaco-editor & monaco-languageclient: Code editing and intelligence.
- octokit: GitHub API interaction.

## 6. AI Agent Integration (Claude Code specific)
When asked to analyze code, use the src/server/ai module.
AI features should be "On-Demand" (triggered by user), not "Always-On" (to save tokens/performance).
Store chat history in SQLite linked to the File Path and Commit Hash.