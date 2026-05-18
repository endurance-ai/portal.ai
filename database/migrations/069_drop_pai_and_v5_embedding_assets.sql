-- 069_drop_pai_and_v5_embedding_assets.sql
-- SPEC-SEARCH-V6-001 P0 (1/3) — dead/PAI/blocker DROP.
--
-- 목적: DB 레이어에서 v4/v5 + PAI 부채를 청산하고, 070 마이그 실행 전
-- products.id uuid->bigint swap 표면을 비운다.
-- 이 마이그 이후 상태:
--   * product_ai_analysis 제거     -> 070 swap 표면 = product_reviews 단일
--   * stale v5 RPC (uuid 시그니처)  -> 제거, 070 후 깨진 객체 없음
--   * 027/031 임베딩 자산           -> drop, 071 에서 product_embeddings 기준 재생성
--
-- SCOPE GUARD (SPEC [HARD]):
--   * products.embedding / embedding_model / embedded_at 컬럼은 여기서
--     DROP 하지 않음 (SPEC §7b: cutover 후 별 마이그). 071 backfill 위해 잔존.
--   * v4/v5 애플리케이션 코드 제거는 P2 — 이 마이그는 DB 전용.
--   * get_product_filter_counts() 는 여기서 DROP 안 함 (SPEC §10e audit 항목) —
--     함수 본문이 product_ai_analysis 를 참조하므로 이 마이그 이후 런타임에
--     실패. P5 audit 로 flag, 의도적으로 미변경.
--
-- CASCADE 로 함께 제거되는 product_ai_analysis 마이그 footprint:
--   012 (테이블 + idx_pai_* 11) + 017 (season/pattern + 2 idx) +
--   045 (v6 axis 8 컬럼 + 8 idx). 046 COMMENT 는 테이블과 함께 소멸.
--   018 (data cleansing UPDATE/DELETE) 은 1회성, 잔존 객체 없음.
--   026 get_product_filter_counts() 본문은 PAI 참조 (late-bound, 추적되는
--   의존성 아님) — DROP 후에도 생존, 런타임에 깨짐 (audit, 위 참조).
--
-- 017 검증: 017_add_season_pattern.sql L4-5 = `ALTER TABLE
--   product_ai_analysis ADD COLUMN season/pattern` — PAI-scoped, products 아님.
--   확인됨: PAI CASCADE 로 drop, products 무변경.
--
-- v5 RPC 근거: search_products_v5 RETURNS TABLE(id uuid, ...) 이고
--   bulk_update_product_embeddings 가 (u->>'id')::uuid 캐스팅. products.id 가
--   bigint (070) 가 되면 둘 다 의미상 stale. v5 dead infra (SPEC §10b) 이고
--   bulk RPC 는 명시적으로 rework (SPEC §7b); 여기서 drop 해 070 swap 동안
--   스키마 정합성을 유지.
--
-- product_search_text(products) CASCADE 동반 제거 footprint:
--   027 이 product_search_text(products) 함수 + 그 함수에 의존하는
--   pgroonga 풀텍스트 인덱스 idx_products_pgroonga_search 를 생성.
--   bare DROP FUNCTION 은 의존 인덱스 때문에 실패 → CASCADE 필수.
--   CASCADE 로 idx_products_pgroonga_search (pgroonga 풀텍스트 인덱스,
--   027 출처) 가 함수와 함께 소멸.
--   안전성: product_search_text + idx_products_pgroonga_search 의 유일
--   소비자는 search_products_v5 (030:90 / 031:128) 뿐이고, 그것은 이
--   마이그가 위에서 같은 트랜잭션 내 이미 DROP. 앱코드·v4/v5 어댑터·타
--   마이그 사용처 0건 확인. v6 는 임베딩 cosine-first (풀텍스트 미사용)
--   이므로 pgroonga 인덱스 동반 제거는 의도된 dead infra 정리
--   (SPEC §10b dead infra / §10e audit).
--
-- Author: SPEC-SEARCH-V6-001 P0 (2026-05-18)

BEGIN;

-- @MX:WARN: [AUTO] Two CASCADE DROPs here. (1) product_ai_analysis removes
--   012/017/045 columns + 21 indexes + all FKs in one statement. (2)
--   product_search_text(products) CASCADE also drops idx_products_pgroonga_search
--   (the 027 pgroonga full-text index that depends on the function).
--   Irreversible without restore. v6 embedding-first is PAI-independent and
--   pgroonga-independent (REQ-V6-031); dev-only, no users (SPEC §10/§15).
-- @MX:REASON: SPEC-SEARCH-V6-001 §10a mandates full PAI liquidation. CASCADE
--   on product_ai_analysis is required because product_ai_analysis.product_id
--   (012) is an FK to products(id) and must be gone before the 070 id swap to
--   keep the swap surface = product_reviews only (SPEC §7c). CASCADE on
--   product_search_text is required because idx_products_pgroonga_search (027)
--   depends on it; the only consumer of both was search_products_v5
--   (030:90 / 031:128), already dropped above in this same transaction —
--   pgroonga full-text is dead infra under v6 cosine-first ranking
--   (SPEC §10b / §10e).
-- @MX:SPEC: SPEC-SEARCH-V6-001

-- ── 1) product_ai_analysis — 테이블 전체 + cascade ──────────────
DROP TABLE IF EXISTS product_ai_analysis CASCADE;

-- ── 2) stale v5 RPC (uuid 시그니처 / products.embedding 의존) ────
-- search_products_v5 는 corpus 에 오버로드 2개:
--   030 vector(768) 시그니처, 031 halfvec(768) 시그니처.
-- 031 이 030 vector 오버로드를 명시적으로 DROP IF EXISTS 함; 방어적으로
-- 둘 다 drop (idempotent).
DROP FUNCTION IF EXISTS search_products_v5(
  vector, text, text[], text[], text, integer, integer, text[], integer, integer
);
DROP FUNCTION IF EXISTS search_products_v5(
  halfvec, text, text[], text[], text, integer, integer, text[], integer, integer
);
-- CASCADE 필수: 027 pgroonga 풀텍스트 인덱스 idx_products_pgroonga_search 가
-- 이 함수에 의존 → bare DROP 은 실패. 유일 소비자 search_products_v5
-- (030:90/031:128) 는 위에서 이미 DROP, 앱·어댑터·타 마이그 사용 0건.
-- pgroonga 인덱스 동반 소멸은 의도된 dead infra 정리 (SPEC §10b/§10e).
DROP FUNCTION IF EXISTS product_search_text(products) CASCADE;

-- ── 3) products.embedding 에 묶인 027/031 임베딩 자산 ───────────
-- 071 에서 product_embeddings 기준 재생성. 곧 legacy 가 될
-- products.embedding 컬럼을 가리킨 채 잔존하지 않도록, 그리고 071 이
-- 깔끔히 재생성하도록 여기서 drop. products.embedding 컬럼은 잔존 (SPEC §7b).
DROP INDEX IF EXISTS idx_products_embedding_hnsw;
DROP INDEX IF EXISTS idx_products_embedding_pending;
DROP VIEW  IF EXISTS product_embedding_coverage;

-- bulk_update_product_embeddings: 옛 products 대상 / uuid 캐스팅 버전.
-- 071 에서 bigint product_id 키 product_embeddings UPSERT 로 재생성.
DROP FUNCTION IF EXISTS bulk_update_product_embeddings(jsonb);

COMMIT;

-- ── 권장 검증 (수동, commit 후) ─────────────────────────────────
--   SELECT to_regclass('public.product_ai_analysis');                 -- NULL
--   SELECT to_regprocedure('public.search_products_v5(halfvec,text,text[],text[],text,integer,integer,text[],integer,integer)'); -- NULL
--   SELECT to_regprocedure('public.product_search_text(products)');   -- NULL
--   SELECT to_regprocedure('public.bulk_update_product_embeddings(jsonb)'); -- NULL
--   SELECT to_regclass('public.product_embedding_coverage');          -- NULL
--   -- products.embedding 컬럼은 반드시 잔존해야 함 (SPEC §7b):
--   SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name='products' AND column_name='embedding';        -- halfvec
