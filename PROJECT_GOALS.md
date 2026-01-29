# Project Name: HighReview

## 1. Project Overview
HighReview는 개발자의 로컬 작업 환경(Context)을 방해하지 않으면서, IDE 수준의 강력한 코드 분석과 AI 인사이트를 제공하는 "로컬 기반 PR 리뷰 도구"입니다.

## 2. Core Philosophy
1.  **Zero Distraction:** 사용자의 현재 작업 디렉토리(Current Working Directory)를 절대 건드리지 않는다. `git worktree`를 사용하여 격리된 리뷰 환경을 구축한다.
2.  **Read-Only First:** 코드를 실행/빌드하는 것보다 "읽고 이해하는 것"에 집중한다. 무거운 인덱싱보다 빠른 탐색을 우선한다.
3.  **Lightweight:** Electron이 아닌 "Local Server + System Browser" 아키텍처를 채택하여 가볍게 동작한다.

## 3. Architecture
- **CLI:** Node.js 기반. `git worktree` 관리 및 서버 실행 담당.
- **Server:** Fastify (or Express). 정적 파일 서빙, LSP Proxy, AI API 중계.
- **Frontend:** React + Vite + Monaco Editor. 4-Pane Layout (FileTree, Base, Head, Context).
- **Data:** SQLite. PR 메타데이터 및 AI 대화 캐싱.

## 4. Key Features (MVP)
- GitHub PR 목록 조회 및 선택.
- `~/.highreview/worktrees` 경로에 Shadow Repository 생성 및 PR 브랜치 Checkout.
- 4단 분할 화면에서 Diff 확인 및 코드 네비게이션(Go to Definition).
- 코드 선택 시 AI에게 질문(Ask AI) 및 답변 표시.