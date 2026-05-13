-- 048: drop eval_* 4 tables + related trigger function — eval 도메인 재설계.
--
-- 사유: 2026-05-13 sweep 결정 — eval_reviews (114 rows) 만 유지하고
-- 나머지 4 테이블은 운영 흐름 불분명 + v6 새 설계 시 재구성 예정.
--
-- 영구 소실 데이터:
--   eval_golden_queries  : 27 rows (테스트 케이스 정의)
--   eval_golden_set      :  1 row  (analysis snapshot)
--   eval_judgments       :  0 rows (per query × product 등급)
--   eval_runs            :  0 rows (NDCG/P@5 스냅샷)
--
-- 유지: eval_reviews (114 rows, admin 평가 대기열에서 직접 사용)
--
-- 코드 사전 정리 (선행):
--   - admin/eval/page.tsx 5-tab → queue-only 단순화
--   - api/admin/eval/{compute,freeze-baseline,golden-queries,golden-set,
--     judgments,run,runs}/ 디렉토리 7종 삭제
--   - components/admin/eval-{golden-queries,golden-set,labeling-form,
--     runs-dashboard}.tsx 4종 삭제
--   - lib/eval/ 디렉토리 전체 삭제 (judgment-store, run-snapshot, ndcg, precision)
--   - eval-review-detail.tsx 의 addToGoldenSet UI 제거
--
-- Related: Migration 033 (eval v6 tables 추가) — 33 이 만든 걸 48 이 되돌림.
-- SPEC 추적: SPEC-INFRA-MIGRATE-001 cleanup follow-up.

BEGIN;

-- 1) prevent_frozen_v4_baseline_overwrite 트리거는 eval_runs 에 박혀있어
--    DROP TABLE CASCADE 시 자동 폐기됨. 함수 본체만 별도 drop.
DROP FUNCTION IF EXISTS public.prevent_frozen_v4_baseline_overwrite() CASCADE;

-- 2) 4 테이블 drop (CASCADE — FK 참조 자동 해제 + 인덱스 동시 폐기)
DROP TABLE IF EXISTS public.eval_judgments      CASCADE;
DROP TABLE IF EXISTS public.eval_runs           CASCADE;
DROP TABLE IF EXISTS public.eval_golden_set     CASCADE;
DROP TABLE IF EXISTS public.eval_golden_queries CASCADE;

-- ── 검증 (commit 후 수동 실행 권장) ─────────────────────────────────────
-- SELECT to_regclass('public.eval_judgments');       -- NULL
-- SELECT to_regclass('public.eval_runs');            -- NULL
-- SELECT to_regclass('public.eval_golden_set');      -- NULL
-- SELECT to_regclass('public.eval_golden_queries');  -- NULL
-- SELECT to_regprocedure('public.prevent_frozen_v4_baseline_overwrite()'); -- NULL
-- SELECT COUNT(*) FROM eval_reviews;                 -- 114 (유지 확인)

COMMIT;
