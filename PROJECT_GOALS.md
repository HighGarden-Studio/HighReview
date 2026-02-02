# Project Name: HighReview

## 1. Project Overview
HighReview는 개발자의 로컬 작업 환경(Context)을 방해하지 않으면서, IDE 수준의 강력한 코드 분석과 AI 인사이트를 제공하는 "로컬 기반 PR 리뷰 도구"입니다.

## 2. Core Philosophy
1.  **Zero Distraction:** 사용자의 현재 작업 디렉토리(Current Working Directory)를 절대 건드리지 않는다. `git worktree`를 사용하여 격리된 리뷰 환경을 구축한다.
2.  **Read-Only First:** 코드를 실행/빌드하는 것보다 "읽고 이해하는 것"에 집중한다. 무거운 인덱싱보다 빠른 탐색을 우선한다.
3.  **Lightweight:** Electron이 아닌 "Local Server + System Browser" 아키텍처를 채택하여 가볍게 동작한다.

## 3. Architecture
- **CLI:** Node.js 기반. `git worktree` 관리 및 서버 실행 담당.
- **Server:** Fastify. 정적 파일 서빙, Tree-sitter 기반 코드 분석, AI API 중계.
- **Frontend:** React + Vite + Monaco Editor. 4-Pane Layout (FileTree, Base, Head, Context).
- **Data:** SQLite. PR 메타데이터 및 AI 대화 캐싱.
- **Code Analysis:** Tree-sitter (구문 분석) + ripgrep (텍스트 검색). LSP 대신 가벼운 정적 분석 사용.

## 4. Key Features (MVP)
- GitHub PR 목록 조회 및 선택.
- `~/.highreview/worktrees` 경로에 Shadow Repository 생성 및 PR 브랜치 Checkout.
- 4단 분할 화면에서 Diff 확인 및 코드 탐색.
- **Tree-sitter 기반 컨텍스트 분석:** 변경된 함수/클래스의 호출 지점을 자동 탐지.
- **Find in Project (Alt+Shift+F12):** ripgrep 기반 프로젝트 전체 검색.
- 코드 선택 시 AI에게 질문(Ask AI) 및 답변 표시.
- **풍부한 AI 컨텍스트:** 변경 사항과 관련된 호출 코드를 AI에게 자동 전달.

## 5. 기술적 결정 (Technical Decisions)

### LSP 포기 결정
**문제점:**
- 의존성 설치 강제 (Gradle, npm install 등) → "Zero Distraction" 철학 위반
- 인덱싱 시간 15-30초 → "Lightweight" 철학 위반
- Monaco Editor 통합 복잡도 높음
- Java, TypeScript 등에서 불안정

**대안 (Tree-sitter):**
- **의존성 불필요**: 소스 코드 텍스트만으로 AST 생성
- **초고속**: 파일 파싱 < 10ms
- **다국어 지원**: TypeScript, Java, Python, Go 등 동일 방식 처리
- **내구성**: 불완전한 코드도 파싱 가능 (PR 작성 중)
- **정확도**: ripgrep + Tree-sitter 검증으로 90%+ 정확도

### 컨텍스트 파이프라인
1. **심볼 추출**: Diff에서 변경된 함수/클래스 추출 (Tree-sitter)
2. **참조 검색**: 프로젝트 전체 텍스트 검색 (ripgrep)
3. **호출 검증**: 실제 함수 호출인지 확인 (Tree-sitter)
4. **스니펫 생성**: 호출 지점 전후 5라인 추출 → AI 프롬프트에 포함

**결과:**
- PR 로드 시간: 5초 이내 (기존 30초)
- AI 리뷰 품질: 호출 지점 컨텍스트 포함으로 향상
- 사용자 경험: 빌드 없이 즉시 시작 가능