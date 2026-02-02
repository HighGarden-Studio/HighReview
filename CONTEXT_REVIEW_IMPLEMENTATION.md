# Context-Aware AI Review Implementation Summary

## 구현된 기능

### 1. UI 옵션 추가 ✅
**파일:** `apps/web/src/components/AIReviewOptionsModal.tsx`

새로운 옵션 추가됨:
- `includeContext: boolean` - 컨텍스트 파일 포함 여부
- `contextScope: 'callers' | 'implementations' | 'both'` - 수집 범위

UI에 "Context-Aware Review (LSP-based)" 섹션 추가:
- 체크박스: "Include context files for broader impact analysis"
- 라디오 버튼: Callers only / Implementations only / Both

### 2. LSP 기반 컨텍스트 수집 유틸리티 ✅
**파일:** `apps/web/src/utils/contextCollector.ts`

`ContextCollector` 클래스 생성:
- `collectContext()`: PR의 수정된 파일에서 LSP를 통해 컨텍스트 파일 수집
- 수집 대상:
  - **Callers**: 수정된 메서드를 호출하는 다른 파일들
  - **Implementations**: 수정된 인터페이스/추상 클래스의 구현체들
- VSCode LSP 명령어 사용:
  - `vscode.executeDocumentSymbolProvider` - 심볼 추출
  - `vscode.executeReferenceProvider` - 참조(호출부) 찾기
  - `vscode.executeImplementationProvider` - 구현체 찾기

### 3. 백엔드 AI 리뷰 서비스 수정 ✅
**파일:** `apps/cli/src/services/AIReviewService.ts`

변경사항:
- `ContextFile` 인터페이스 추가
- `getContextFileContents()` 메서드 추가: 컨텍스트 파일 읽기 (최대 15개, 30KB 제한)
- `createReviewPrompt()` 수정: 컨텍스트 파일 섹션 추가
- 프롬프트에 명확한 지침 추가:
  ```
  **IMPORTANT**: These files are NOT part of the PR changes.
  **DO NOT review these files for code quality issues.** Only analyze:
  - How changes in PR files might affect these files
  - Potential breaking changes
  - Impact on call sites
  - Semantic compatibility
  ```

### 4. AI 리뷰 로그 뷰어 UI ✅
**파일:** `apps/web/src/components/AIReviewLogModal.tsx`

`AIReviewLogModal` 컴포넌트 생성:
- 4개 탭:
  1. **Options**: 선택된 AI 리뷰 옵션 표시
  2. **Changed Files**: PR에 포함된 수정 파일 목록
  3. **Context Files**: LSP로 수집된 컨텍스트 파일 목록 (reason, relatedSymbol 표시)
  4. **Result**: 리뷰 결과 (filesReviewed, totalIssues, duration)

## 통합 방법

### ReviewPage에서 컨텍스트 수집 및 로그 저장

`apps/web/src/pages/ReviewPage.tsx`에 다음을 추가해야 합니다:

```typescript
import { ContextCollector, CollectedContext } from '../utils/contextCollector';
import { AIReviewLogModal, AIReviewLog } from '../components/AIReviewLogModal';
import { useAIReviewLogger } from '../hooks/useAIReviewLogger';

// Hooks 추가
const logger = useAIReviewLogger();

// State 추가
const [currentReviewLog, setCurrentReviewLog] = useState<AIReviewLog | null>(null);
const [showLogModal, setShowLogModal] = useState(false);

// AI 리뷰 시작 전 (performAIReview 함수 내부)
const performAIReview = async () => {
  try {
    // 로그 초기화
    logger.clearLogs();
    logger.info('general', 'Starting AI review process');

    // 1. 컨텍스트 수집 (options.includeContext가 true인 경우)
    let contextFiles: CollectedContext | null = null;
    if (aiReviewOptions?.includeContext && repoRoot) {
      logger.info('context', 'Collecting context files via LSP...');

      // 로거를 ContextCollector에 전달
      const collector = new ContextCollector(logger);
      contextFiles = await collector.collectContext(
        prData.files.map(f => f.path),
        repoRoot,
        aiReviewOptions.contextScope || 'both'
      );

      logger.success('context', 'Context collection completed', contextFiles.summary);
    }

    // 2. 로그 객체 초기화
    const reviewLog: AIReviewLog = {
      timestamp: Date.now(),
      prInfo: {
        owner: prInfo.owner,
        repo: prInfo.repo,
        number: prInfo.prNumber,
      },
      options: aiReviewOptions,
      changedFiles: prData.files.map(f => f.path),
      contextFiles: contextFiles?.files.map(f => ({
        path: f.path,
        reason: f.reason,
        relatedSymbol: f.relatedSymbol,
      })),
      logs: [], // 초기에는 빈 배열
    };
    setCurrentReviewLog(reviewLog);

    // 3. API 호출 (컨텍스트 파일 포함)
    logger.info('api', 'Calling AI review API', {
      changedFiles: prData.files.length,
      contextFiles: contextFiles?.files.length || 0,
    });

    const response = await fetch(..., {
      body: JSON.stringify({
        worktreePath,
        baseBranch,
        language,
        options: {
          ...aiReviewOptions,
          contextFiles: contextFiles?.files, // ← 이 부분 추가
        },
      }),
    });

    // 4. 결과 저장
    if (response.ok) {
      const data = await response.json();
      logger.success('api', 'AI review completed successfully', {
        filesReviewed: data.review.filesReviewed,
        totalIssues: data.review.totalIssues,
      });

      setCurrentReviewLog(prev => ({
        ...prev!,
        logs: logger.logs, // 로그 추가
        result: {
          filesReviewed: data.review.filesReviewed,
          totalIssues: data.review.totalIssues,
          duration: Date.now() - reviewLog.timestamp,
        },
      }));
    } else {
      const errorData = await response.json();
      logger.error('api', 'AI review failed', errorData);
    }
  } catch (error) {
    // 5. 에러 저장
    logger.error('general', 'AI review error', { error: error.message });

    setCurrentReviewLog(prev => ({
      ...prev!,
      logs: logger.logs, // 로그 추가
      error: error.message,
    }));
  }
};

// 로그가 변경될 때마다 reviewLog 업데이트
useEffect(() => {
  if (currentReviewLog) {
    setCurrentReviewLog(prev => ({
      ...prev!,
      logs: logger.logs,
    }));
  }
}, [logger.logs]);

// UI에 로그 버튼 추가
<button
  onClick={() => setShowLogModal(true)}
  disabled={!currentReviewLog}
  className="..."
>
  View AI Review Log
</button>

// 로그 모달 렌더링
<AIReviewLogModal
  isOpen={showLogModal}
  onClose={() => setShowLogModal(false)}
  log={currentReviewLog}
/>
```

## 테스트 시나리오

### 1. Context-Aware Review 활성화 테스트

1. PR 상세 페이지에서 "Review with AI" 클릭
2. AI Review Options 모달에서:
   - ☑️ "Include context files for broader impact analysis" 체크
   - Scope 선택: "Both callers and implementations"
3. "Start Review" 클릭
4. 콘솔 로그 확인:
   ```
   [ContextCollector] Starting context collection...
   [ContextCollector] Found symbols: X
   [ContextCollector] Finding references for: methodName
   [ContextCollector] Finding implementations for: InterfaceName
   [ContextCollector] Context collection completed: { totalFiles: X, callers: Y, implementations: Z }
   [AI Review] Including X context files for broader analysis
   ```

### 2. AI 리뷰 로그 확인 테스트

1. AI 리뷰 진행 중/완료 후 "View AI Review Log" 버튼 클릭
2. 로그 모달에서 각 탭 확인:
   - **Logs 탭** (첫 번째 탭):
     - 실시간 로그 스트림 표시
     - 타임스탬프, 레벨 (INFO/SUCCESS/WARNING/ERROR), 카테고리 표시
     - Auto-scroll 옵션 (자동 스크롤)
     - 카테고리 필터 (All / Indexing / LSP / Context Collection / API Calls / Parsing / General)
     - 로그 상세 정보 (details) 확장/축소
   - **Options 탭**: 선택한 옵션들이 정확히 표시되는지
   - **Files 탭**: PR 수정 파일 목록
   - **Context Files 탭**: LSP로 수집된 파일들 (reason, relatedSymbol 표시)
   - **Result 탭**: 리뷰 결과 (filesReviewed, totalIssues, duration)

3. 로그 기능 확인:
   - 컨텍스트 수집 중 실시간으로 로그 업데이트 확인
   - "Found 5 symbols in ExternalApiKeyRegistry.java" 같은 메시지 확인
   - "Found 3 references for getCompanyCode" 같은 메시지 확인
   - API 호출 시작/완료 로그 확인
   - 에러 발생 시 ERROR 레벨 로그 확인

### 3. AI 응답 품질 테스트

PR에 다음과 같은 변경이 있는 경우:
- 인터페이스 메서드 시그니처 변경
- 공용 메서드 파라미터 추가

AI가 컨텍스트 파일을 기반으로 다음을 분석하는지 확인:
- "Breaking Changes: Method signature changed in InterfaceName affects N implementations"
- "Impact: This change requires updates to M call sites"
- "Side Effects: Caller files may need parameter adjustment"

## 향후 개선 사항

1. **성능 최적화**
   - 큰 PR (100+ 파일)에서 컨텍스트 수집 시간이 길 수 있음
   - 병렬 처리 또는 캐싱 고려

2. **UI/UX 개선**
   - 컨텍스트 수집 진행 상황 표시 (프로그레스 바)
   - 로그 모달에서 파일 클릭 시 해당 파일로 이동

3. **로그 저장**
   - localStorage에 최근 N개 로그 저장
   - 과거 AI 리뷰 로그 히스토리 조회

4. **컨텍스트 필터링**
   - 사용자가 특정 컨텍스트 파일을 제외할 수 있는 옵션
   - 컨텍스트 파일 크기/개수 제한 설정

## 문제 해결

### LSP가 참조를 찾지 못하는 경우
- LSP 서버가 초기화되고 모든 파일이 인덱싱될 때까지 대기
- ReviewPage의 `waitForLSPReady()` 로직이 완료된 후 컨텍스트 수집 시작

### 컨텍스트 파일이 너무 많은 경우
- 백엔드에서 최대 15개로 제한됨 (MAX_CONTEXT_FILES)
- 우선순위: 수정된 심볼과 가장 관련성 높은 파일부터

### AI가 컨텍스트 파일을 리뷰하는 경우
- 프롬프트에 명확한 지침 포함됨: "DO NOT review these files for code quality"
- AI가 무시하는 경우, 프롬프트 개선 필요

## 파일 목록

### 새로 생성된 파일
- `apps/web/src/utils/contextCollector.ts` - LSP 기반 컨텍스트 수집 (로거 지원)
- `apps/web/src/components/AIReviewLogModal.tsx` - 로그 뷰어 UI (실시간 로그 탭 포함)
- `apps/web/src/hooks/useAIReviewLogger.ts` - AI 리뷰 로거 훅

### 수정된 파일
- `apps/web/src/components/AIReviewOptionsModal.tsx` - 컨텍스트 옵션 추가
- `apps/cli/src/services/AIReviewService.ts` - 컨텍스트 파일 처리 로직

### 수정 필요한 파일 (통합)
- `apps/web/src/pages/ReviewPage.tsx` - 컨텍스트 수집 및 로그 기능 통합

---

## 요약

✅ 구현 완료:
1. UI 옵션 추가 (Context-Aware Review)
2. LSP 기반 컨텍스트 파일 수집 유틸리티 (로거 통합)
3. 백엔드 AI 프롬프트 수정 (컨텍스트 파일 처리)
4. AI 리뷰 로그 뷰어 UI (실시간 로그 스트림 포함)
5. AI 리뷰 로거 훅 (`useAIReviewLogger`)

🔄 통합 대기:
- ReviewPage에서 컨텍스트 수집 및 로그 기능 연결

사용자 요구사항 달성:
✅ AI 리뷰 진행 시 옵션으로 컨텍스트를 포함한 폭넓은 리뷰 가능
✅ LSP를 통해 호출부, 구현체 자동 수집
✅ 컨텍스트 파일은 영향도/call stack/change intent/impact/semantic 분석만 수행
✅ 코드리뷰는 PR 파일의 수정된 라인만 진행
✅ **AI 리뷰 로그 확인 UI 추가 (실시간 로그 스트림)**
✅ **로그에서 전달된 옵션/파일 리스트/실행 과정 확인 가능**
✅ **브라우저 콘솔이 아닌 UI에서 로그 확인 가능**

## 로그 기능 상세

### 로그 레벨
- **INFO**: 일반 정보 (파일 처리, 심볼 발견 등)
- **SUCCESS**: 성공적인 작업 완료
- **WARNING**: 경고 (심볼 없음, LSP 오류 등)
- **ERROR**: 오류 발생

### 로그 카테고리
- **indexing**: 파일 인덱싱 관련
- **lsp**: LSP 서버 작업
- **context**: 컨텍스트 파일 수집
- **api**: API 호출
- **parsing**: 응답 파싱
- **general**: 일반 작업

### 로그 UI 기능
- 실시간 로그 스트림 (자동 업데이트)
- Auto-scroll 옵션 (새 로그 자동 스크롤)
- 카테고리 필터
- 타임스탬프 표시
- 상세 정보 확장/축소 (details 객체)
- 레벨별 색상 구분
