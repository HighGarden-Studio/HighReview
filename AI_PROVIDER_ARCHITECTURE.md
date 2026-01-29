# AI Provider Architecture

## 개요 (Overview)

HighReview는 확장 가능한 AI Provider 아키텍처를 사용하여 다양한 AI 모델과 서비스를 지원합니다.

**설계 목표:**
- ✅ API 키 불필요한 로컬 CLI 우선 지원
- ✅ 쉬운 확장성 (새 provider 추가)
- ✅ 자동 감지 및 fallback
- ✅ 통일된 인터페이스

## 현재 지원 Provider

### 1. Claude Code ✅ (구현 완료)
- **타입**: Local CLI
- **API 키**: 불필요
- **설치**: https://claude.ai/download
- **명령어**: `claude code --print`
- **상태**: 프로덕션 준비 완료

### 2. Ollama (구현 준비)
- **타입**: Local Model Server
- **API 키**: 불필요
- **설치**: `curl -fsSL https://ollama.ai/install.sh | sh`
- **모델**: CodeLlama, DeepSeek Coder, etc.
- **상태**: 스켈레톤 코드 작성됨

### 3. LM Studio (구현 준비)
- **타입**: Local Model Server (OpenAI-compatible API)
- **API 키**: 불필요
- **설치**: https://lmstudio.ai
- **포트**: http://localhost:1234
- **상태**: 스켈레톤 코드 작성됨

## 향후 지원 예정

### 4. Codex CLI (예정)
- GitHub Copilot 기반
- Local CLI
- API 키 필요 없음

### 5. Gemini CLI (예정)
- Google Gemini
- Local CLI
- Google 계정 연동

### 6. Anthropic API (예정)
- Cloud API
- API 키 필요
- 높은 품질, 비용 발생

### 7. OpenAI API (예정)
- Cloud API
- API 키 필요
- GPT-4 Turbo 지원

## 아키텍처

### 파일 구조

```
apps/cli/src/services/providers/
├── AIProvider.ts              # Base interface & factory
├── ClaudeCodeProvider.ts      # Claude Code CLI implementation ✅
├── OllamaProvider.ts          # Ollama implementation (TODO)
├── LMStudioProvider.ts        # LM Studio implementation (TODO)
└── index.ts                   # Provider registry
```

### Core Interface

```typescript
// AIProvider.ts
export interface AIProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getInstallationInstructions(): string;
  review(request: AIReviewRequest): Promise<AIReviewResponse>;
}

export interface AIReviewRequest {
  prompt: string;
  workingDirectory: string;
  model?: string;
  timeout?: number;
}

export interface AIReviewResponse {
  content: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  metadata?: {
    model?: string;
    provider?: string;
    duration?: number;
  };
}
```

### Provider Factory

```typescript
// Provider 등록
AIProviderFactory.register('claude-code', () => new ClaudeCodeProvider());
AIProviderFactory.register('ollama', () => new OllamaProvider());
AIProviderFactory.register('lmstudio', () => new LMStudioProvider());

// Provider 생성
const provider = AIProviderFactory.create('claude-code');

// 사용 가능한 provider 찾기
const available = await AIProviderFactory.getAvailableProviders();
// => ['claude-code', 'ollama']
```

## 사용 방법

### 1. 기본 사용 (자동 감지)

```typescript
import { AIReviewService } from './services/AIReviewService';

const service = new AIReviewService();

// Provider 자동 감지 및 사용
const result = await service.reviewPR(
  '/path/to/worktree',
  'main',
  'en',
  options
);
```

**자동 감지 우선순위:**
1. Claude Code (우선)
2. Ollama
3. LM Studio

### 2. 수동 Provider 선택 (향후 지원)

```typescript
// TODO: Provider 선택 기능 구현
const service = new AIReviewService({ provider: 'ollama' });
```

### 3. 새 Provider 추가

#### Step 1: Provider 클래스 생성

```typescript
// apps/cli/src/services/providers/MyProvider.ts
import type { AIProvider, AIReviewRequest, AIReviewResponse } from './AIProvider.js';

export class MyProvider implements AIProvider {
  name = 'My AI Provider';

  async isAvailable(): Promise<boolean> {
    // Check if provider is installed
    return true;
  }

  getInstallationInstructions(): string {
    return 'Install instructions here';
  }

  async review(request: AIReviewRequest): Promise<AIReviewResponse> {
    // Implement review logic
    return {
      content: 'Review result',
      metadata: { provider: 'my-provider' },
    };
  }
}
```

#### Step 2: Provider 등록

```typescript
// apps/cli/src/services/providers/index.ts
import { MyProvider } from './MyProvider.js';

export function registerProviders(): void {
  // ... existing providers
  AIProviderFactory.register('my-provider', () => new MyProvider());
}
```

#### Step 3: Export

```typescript
// apps/cli/src/services/providers/index.ts
export * from './MyProvider.js';
```

끝! 이제 자동으로 감지되고 사용됩니다.

## Claude Code Provider 상세

### 명령어

```bash
echo "Your prompt here" | claude code --print --output-format text
```

### 옵션

- `--print`: Non-interactive 모드 (파이프 사용 가능)
- `--output-format text`: Plain text 출력 (JSON 대신)
- `--model sonnet`: 모델 지정 (선택사항)
- stdin으로 프롬프트 전달 (명령행 길이 제한 회피)

### 구현

```typescript
// ClaudeCodeProvider.ts
async review(request: AIReviewRequest): Promise<AIReviewResponse> {
  const args = ['code', '--print', '--output-format', 'text'];

  if (request.model) {
    args.push('--model', request.model);
  }

  const { stdout } = await execa('claude', args, {
    cwd: request.workingDirectory,
    input: request.prompt,  // stdin으로 전달
    timeout: request.timeout || 300000,
  });

  return {
    content: stdout,
    metadata: {
      provider: 'claude-code',
      model: request.model || 'default',
    },
  };
}
```

### 에러 처리

```typescript
try {
  const response = await provider.review(request);
} catch (error) {
  // Provider 실패 시 fallback 또는 에러 반환
  console.error('[AI Review] Provider failed:', error);
  throw error;
}
```

## Ollama Provider 상세 (향후 구현)

### 설치

```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Download from https://ollama.ai

# 모델 다운로드
ollama pull codellama
ollama pull deepseek-coder
```

### 명령어

```bash
echo "Your prompt" | ollama run codellama
```

### 구현 (TODO)

```typescript
async review(request: AIReviewRequest): Promise<AIReviewResponse> {
  const model = request.model || 'codellama';

  const { stdout } = await execa('ollama', ['run', model], {
    cwd: request.workingDirectory,
    input: request.prompt,
    timeout: request.timeout || 300000,
  });

  return {
    content: stdout,
    metadata: {
      provider: 'ollama',
      model,
    },
  };
}
```

### 권장 모델

- **CodeLlama**: 코드 리뷰에 최적화
- **DeepSeek Coder**: 최신 코드 모델
- **Llama 3**: 범용 모델
- **Mixtral**: 빠른 응답

## LM Studio Provider 상세 (향후 구현)

### 설치

1. https://lmstudio.ai 에서 다운로드
2. 앱 실행
3. 모델 다운로드 (예: CodeLlama 7B)
4. Local Server 시작 (포트 1234)

### API

LM Studio는 OpenAI-compatible API를 제공:

```bash
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local-model",
    "messages": [{"role": "user", "content": "Review this code"}],
    "temperature": 0.3,
    "max_tokens": 16000
  }'
```

### 구현 (TODO)

```typescript
async review(request: AIReviewRequest): Promise<AIReviewResponse> {
  const response = await fetch('http://localhost:1234/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: request.model || 'local-model',
      messages: [{ role: 'user', content: request.prompt }],
      temperature: 0.3,
      max_tokens: 16000,
    }),
  });

  const data = await response.json();

  return {
    content: data.choices[0].message.content,
    usage: {
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    },
    metadata: {
      provider: 'lmstudio',
      model: data.model,
    },
  };
}
```

## 설정 및 환경 변수

### 현재 (.env 불필요)

```bash
# Claude Code는 별도 설정 불필요
# 로그인: claude auth login (처음 한 번만)
```

### 향후 (선택적)

```bash
# .env (향후 확장 시)
AI_PROVIDER=claude-code  # 기본 provider 지정 (선택)
OLLAMA_HOST=http://localhost:11434  # Ollama 주소
LMSTUDIO_HOST=http://localhost:1234  # LM Studio 주소
```

## 디버깅

### Provider 상태 확인

```bash
# 터미널에서
curl http://localhost:8765/api/ai/providers

# 예상 응답
{
  "providers": {
    "claude-code": { "available": true, "name": "Claude Code" },
    "ollama": { "available": false, "name": "Ollama" },
    "lmstudio": { "available": false, "name": "LM Studio" }
  },
  "default": "claude-code"
}
```

### 서버 로그

```
[AI Review] Registered providers: [ 'claude-code', 'ollama', 'lmstudio' ]
[AI Review] Using provider: Claude Code
[ClaudeCodeProvider] Starting review...
[ClaudeCodeProvider] Prompt size: 125843 characters
[ClaudeCodeProvider] Review completed: { responseLength: 5234, duration: '45230ms' }
```

## 성능 비교 (예상)

| Provider | 속도 | 품질 | 비용 | 설치 난이도 |
|----------|------|------|------|------------|
| Claude Code | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 무료* | 쉬움 |
| Ollama | ⭐⭐⭐ | ⭐⭐⭐⭐ | 무료 | 쉬움 |
| LM Studio | ⭐⭐⭐ | ⭐⭐⭐⭐ | 무료 | 중간 |
| Anthropic API | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 유료 | 쉬움 |

*Claude Code 무료 사용량 제한 있음

## 문제 해결

### Claude Code가 감지되지 않음

```bash
# 설치 확인
claude code --help

# 로그인 확인
claude auth status

# 재로그인
claude auth login
```

### Ollama 연결 실패 (향후)

```bash
# Ollama 실행 확인
ollama list

# 서버 시작
ollama serve

# 모델 다운로드
ollama pull codellama
```

### LM Studio 연결 실패 (향후)

1. LM Studio 앱이 실행 중인지 확인
2. Local Server가 시작되었는지 확인
3. 포트 1234가 열려있는지 확인
4. 모델이 로드되어 있는지 확인

## API 엔드포인트 (향후 추가 예정)

### GET /api/ai/providers

현재 사용 가능한 provider 목록

```json
{
  "providers": {
    "claude-code": { "available": true },
    "ollama": { "available": false }
  },
  "default": "claude-code"
}
```

### POST /api/ai/set-provider

Provider 변경 (향후 구현)

```json
{
  "provider": "ollama"
}
```

## 확장 가이드

### 새 CLI Provider 추가

1. `isAvailable()`: CLI 명령어 실행 테스트
2. `review()`: execa로 명령어 실행, stdin으로 프롬프트 전달
3. 타임아웃, 에러 처리 추가

### 새 API Provider 추가

1. `isAvailable()`: API 엔드포인트 health check
2. `review()`: fetch로 API 호출
3. 토큰 사용량, 메타데이터 반환

### 테스트

```typescript
// Provider 테스트
const provider = new MyProvider();

// 1. 설치 확인
const available = await provider.isAvailable();
console.log('Available:', available);

// 2. 리뷰 테스트
const response = await provider.review({
  prompt: 'Review this code: function add(a, b) { return a + b; }',
  workingDirectory: '/tmp',
  timeout: 30000,
});

console.log('Review:', response.content);
```

## 향후 개선 사항

### 단기 (1-2주)
- [ ] Ollama provider 완전 구현
- [ ] LM Studio provider 완전 구현
- [ ] Provider 상태 API 엔드포인트
- [ ] Provider 선택 UI

### 중기 (1개월)
- [ ] Codex CLI provider
- [ ] Gemini CLI provider
- [ ] Provider 성능 메트릭
- [ ] Provider fallback chain

### 장기 (3개월+)
- [ ] Anthropic API provider (cloud)
- [ ] OpenAI API provider (cloud)
- [ ] Custom provider plugin system
- [ ] Provider 벤치마크 도구

## 참고 자료

- [Claude Code 문서](https://claude.ai/download)
- [Ollama 문서](https://github.com/ollama/ollama)
- [LM Studio 문서](https://lmstudio.ai/docs)
- [Provider Pattern](https://refactoring.guru/design-patterns/abstract-factory)

---

**작성일**: 2026-01-28
**작성자**: Claude Sonnet 4.5
**버전**: 1.0.0
**상태**: ✅ Provider 아키텍처 구현 완료
