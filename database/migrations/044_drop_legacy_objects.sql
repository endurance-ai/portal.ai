-- 044: drop legacy objects identified by 2026-05-12 DB sweep.
--
-- 보수 정리 원칙 (INSERT/호출이 살아있으면 유지) 적용 후 진짜 dead 5종:
--   1. item_search_results 테이블 — SerpAPI Google Shopping 시절 legacy,
--      kikoai/app + ai + crawler 전수 grep 0 hits.
--   2. set_hnsw_ef_search(int) 함수 — A/B 실험용으로 만들었으나 호출 0 hits.
--   3. rls_auto_enable event trigger + 함수 — BYPASSRLS 환경에서 효과 0,
--      Supabase 컨벤션 잔재.
--   4. handle_new_admin_user() 함수 + Supabase auth.users 트리거 — P3 cutover
--      (Auth.js v5 + bcrypt + pg.query 직접) 후 source 부재로 dead.
--   5. brand_nodes.platform 컬럼 — read/write 0 hits, source_platforms text[]
--      가 대체.
--
-- SPEC 추적: SPEC-INFRA-MIGRATE-001 P7 cutover 후속 정리.
-- 검증 doc: ~/Desktop/aws-infra/docs/kikoai-dev/26-05-07-database-reference.md §9.3
-- 검토 보드: docs/_tmp/database-review.html (drop catalog 섹션)

BEGIN;

-- ============================================================================
-- 1) item_search_results 테이블 + 인덱스 5종 동시 폐기
-- ============================================================================
-- FK CASCADE: analyses, analysis_items 양쪽에서 자동 해제됨.
-- 인덱스 (자동 폐기): item_search_results_pkey, idx_item_search_results_analysis_id,
--                    idx_item_search_results_brand, idx_item_search_results_item_id,
--                    idx_item_search_results_selected (partial WHERE is_selected=true).

DROP TABLE IF EXISTS public.item_search_results CASCADE;


-- ============================================================================
-- 2) set_hnsw_ef_search(int) 함수
-- ============================================================================
-- 세션 단위 hnsw.ef_search 튜닝용으로 설계됐으나 호출 0 hits.

DROP FUNCTION IF EXISTS public.set_hnsw_ef_search(int);


-- ============================================================================
-- 3) rls_auto_enable event trigger + 함수
-- ============================================================================
-- public 스키마 신규 테이블 생성 시 RLS 자동 ENABLE — Supabase 컨벤션.
-- 자체 호스트는 app_user/admin_user/ai_user/backup_user 가 모두 BYPASSRLS 라
-- 효과 0. 신규 v6 테이블 생성 시 불필요한 RLS ENABLE 부담만 발생.

DROP EVENT TRIGGER IF EXISTS rls_auto_enable_trigger;
DROP FUNCTION IF EXISTS public.rls_auto_enable();


-- ============================================================================
-- 4) handle_new_admin_user() 함수 + auth.users 트리거
-- ============================================================================
-- P3 (SPEC-INFRA-MIGRATE-001) Auth.js v5 전환 후 source 인 auth.users 테이블
-- 자체가 부재 (auth schema 통째로 제거됨, 2026-05-12 검증). 트리거는 source
-- 테이블 삭제 시 자동 폐기됐으므로 함수만 drop 하면 충분.
--
-- 안전 가드: auth schema 가 다시 부활했을 가능성 대비 DO 블록으로 conditional.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name='auth')
     AND to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.handle_new_admin_user();


-- ============================================================================
-- 5) brand_nodes.platform 컬럼
-- ============================================================================
-- read/write 0 hits (전수 grep). source_platforms text[] 가 대체 운영 중.

ALTER TABLE public.brand_nodes DROP COLUMN IF EXISTS platform;


-- ============================================================================
-- 검증 쿼리 (commit 후 수동 실행 권장)
-- ============================================================================
-- SELECT to_regclass('public.item_search_results');  -- NULL 이면 성공
-- SELECT to_regprocedure('public.set_hnsw_ef_search(int)');  -- NULL 이면 성공
-- SELECT to_regprocedure('public.rls_auto_enable()');  -- NULL 이면 성공
-- SELECT to_regprocedure('public.handle_new_admin_user()');  -- NULL 이면 성공
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='brand_nodes' AND column_name='platform';  -- 0 rows

COMMIT;
