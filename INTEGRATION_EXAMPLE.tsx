// ============================================================================
// ReviewPage 통합 예제
// ============================================================================
// 이 파일은 ReviewPage.tsx에 통합하는 방법을 보여주는 예제입니다.

import { useAIReviewLogger } from '../hooks/useAIReviewLogger';
import { ContextCollector } from '../utils/contextCollector';
import { AIReviewLogModal } from '../components/AIReviewLogModal';
import type { AIReviewLog } from '../components/AIReviewLogModal';

// ============================================================================
// 1. ReviewPage 컴포넌트 상단에 추가
// ============================================================================

export function ReviewPage({ /* ... props ... */ }) {
  // 로거 훅 추가
  const logger = useAIReviewLogger();

  // 로그 모달 상태
  const [currentReviewLog, setCurrentReviewLog] = useState<AIReviewLog | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);

  // ... 기존 코드 ...

  // ============================================================================
  // 2. AI 리뷰 시작 시 로거 사용
  // ============================================================================

  const performAIReview = async () => {
    try {
      // 로그 초기화
      logger.clearLogs();
      logger.info('general', 'Starting AI review process');

      // 로그 객체 초기화
      const startTime = Date.now();
      const reviewLog: AIReviewLog = {
        timestamp: startTime,
        prInfo: {
          owner: prInfo?.owner || '',
          repo: prInfo?.repo || '',
          number: prInfo?.prNumber || 0,
        },
        options: aiReviewOptions || {},
        changedFiles: prData?.files.map(f => f.path) || [],
        logs: [],
      };
      setCurrentReviewLog(reviewLog);

      // LSP 대기 (이미 구현되어 있는 경우)
      logger.info('lsp', 'Waiting for LSP server to be ready...');
      await waitForLSPReady();
      logger.success('lsp', 'LSP server is ready');

      // 컨텍스트 수집 (옵션이 활성화된 경우)
      let contextFiles = null;
      if (aiReviewOptions?.includeContext && repoRoot && prData?.files) {
        logger.info('context', 'Collecting context files via LSP', {
          scope: aiReviewOptions.contextScope,
          changedFiles: prData.files.length,
        });

        // 로거를 ContextCollector에 전달
        const collector = new ContextCollector(logger);
        contextFiles = await collector.collectContext(
          prData.files.map(f => f.path),
          repoRoot,
          aiReviewOptions.contextScope || 'both'
        );

        logger.success('context', 'Context collection completed', contextFiles.summary);

        // 로그에 컨텍스트 파일 추가
        setCurrentReviewLog(prev => ({
          ...prev!,
          contextFiles: contextFiles.files.map(f => ({
            path: f.path,
            reason: f.reason,
            relatedSymbol: f.relatedSymbol,
          })),
        }));
      }

      // API 호출
      logger.info('api', 'Calling AI review API', {
        changedFiles: prData?.files.length || 0,
        contextFiles: contextFiles?.files.length || 0,
        options: Object.keys(aiReviewOptions || {}),
      });

      const response = await fetch(
        `/api/prs/${prInfo?.owner}/${prInfo?.repo}/${prInfo?.prNumber}/ai-review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worktreePath,
            baseBranch,
            language,
            options: {
              ...aiReviewOptions,
              // 컨텍스트 파일 포함
              contextFiles: contextFiles?.files,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        logger.error('api', 'AI review API failed', errorData);
        throw new Error(errorData.message || 'AI review failed');
      }

      logger.success('api', 'AI review API call successful');

      // 응답 파싱
      logger.info('parsing', 'Parsing AI review response...');
      const data = await response.json();
      logger.success('parsing', 'Successfully parsed AI review response', {
        filesReviewed: data.review.filesReviewed,
        totalIssues: data.review.totalIssues,
      });

      // 결과 저장
      const duration = Date.now() - startTime;
      setCurrentReviewLog(prev => ({
        ...prev!,
        logs: logger.logs, // 로그 추가
        result: {
          filesReviewed: data.review.filesReviewed,
          totalIssues: data.review.totalIssues,
          duration,
        },
      }));

      logger.success('general', `AI review completed in ${Math.round(duration / 1000)}s`);

      // AI 리뷰 결과 설정
      setAIReviewResult(data.review);

    } catch (error: any) {
      logger.error('general', 'AI review failed', { error: error.message });

      setCurrentReviewLog(prev => ({
        ...prev!,
        logs: logger.logs, // 에러 발생 시에도 로그 추가
        error: error.message,
      }));

      // 에러 토스트 표시
      setToast({ message: error.message, type: 'error' });
    }
  };

  // ============================================================================
  // 3. 로그가 변경될 때마다 reviewLog 업데이트
  // ============================================================================

  useEffect(() => {
    if (currentReviewLog && logger.logs.length > 0) {
      setCurrentReviewLog(prev => ({
        ...prev!,
        logs: logger.logs,
      }));
    }
  }, [logger.logs]);

  // ============================================================================
  // 4. UI에 로그 버튼 추가
  // ============================================================================

  return (
    <div className="...">
      {/* ... 기존 UI ... */}

      {/* AI 리뷰 로그 버튼 - AI 리뷰 결과 패널 근처에 배치 */}
      <button
        onClick={() => setShowLogModal(true)}
        disabled={!currentReviewLog}
        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        View AI Review Log
        {currentReviewLog?.logs && currentReviewLog.logs.length > 0 && (
          <span className="ml-1 px-2 py-0.5 bg-purple-800 rounded-full text-xs">
            {currentReviewLog.logs.length}
          </span>
        )}
      </button>

      {/* 로그 모달 */}
      <AIReviewLogModal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        log={currentReviewLog}
      />
    </div>
  );
}

// ============================================================================
// 예상 로그 출력 예시
// ============================================================================

/*
[INFO] [general] Starting AI review process
[INFO] [lsp] Waiting for LSP server to be ready...
[SUCCESS] [lsp] LSP server is ready
[INFO] [context] Collecting context files via LSP { scope: 'both', changedFiles: 3 }
[INFO] [context] Processing file: src/main/java/ExternalApiKeyRegistry.java
[INFO] [context] Found 5 symbols in src/main/java/ExternalApiKeyRegistry.java
[INFO] [context] Finding references for: getCompanyCode
[SUCCESS] [context] Found 3 references for getCompanyCode
[INFO] [context] Finding implementations for: AbstractService
[SUCCESS] [context] Found 2 implementations for AbstractService
[SUCCESS] [context] Context collection completed { totalFiles: 5, callers: 3, implementations: 2 }
[INFO] [api] Calling AI review API { changedFiles: 3, contextFiles: 5, options: ['includeContext', 'analyzeChangeIntent'] }
[SUCCESS] [api] AI review API call successful
[INFO] [parsing] Parsing AI review response...
[SUCCESS] [parsing] Successfully parsed AI review response { filesReviewed: 3, totalIssues: 12 }
[SUCCESS] [general] AI review completed in 45s
*/
