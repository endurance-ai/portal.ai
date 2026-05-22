-- 085_drop_unused_db_objects.sql
-- 안 쓰는 테이블/뷰/컬럼 정리 (외부 의존 0 — 즉시 적용 가능분).
-- app 코드 전수 grep + 라이브 dev-app Postgres 교차검증 (2026-05-22).
--
-- ⚠️ products.embedding 잔존 컬럼은 배치(aws-infra) 의존이 있어 086 으로 분리.
--    이 파일(085)은 외부 의존 0 — 안전하게 단독 적용 가능.
--
-- ─── DROP 대상 ───────────────────────────────────────────────
--   [1] analyses.sensitivity_tags        — v4 잔재. 코드 0참조. (style_node_primary/secondary
--                                           는 analytics·eval 가 읽으므로 유지.)
--   [2] brand_sku_counts (MATVIEW)        — app·RPC 0참조. 크롤모니터는 admin_crawl_platform_stats()
--                                           가 products/product_embeddings 직접 집계 (matview 미사용).
--   [3] product_embedding_coverage (VIEW) — 0참조. 모니터링 전용 dead view.
--   [4] node_centroids                    — app 0참조. 소비 RPC 없음 (find_similar_brands 는
--                                           brand_multimodal_embeddings 사용). 채우는 배치
--                                           (build_node_centroids) 는 dormant — 라이브 영향 없음.
--
-- ─── 의도적 KEEP ─────────────────────────────────────────────
--   - style_node_adjacency               — SPEC-BRAND-EMBED-001 인접그래프 대기 (user 결정).
--   - bulk_update_product_embeddings RPC — 임베딩 적재 쓰기 경로. app 0호출이나 배치가 의존.
--
-- Author: DB cleanup (2026-05-22)

BEGIN;

ALTER TABLE analyses DROP COLUMN IF EXISTS sensitivity_tags;

DROP MATERIALIZED VIEW IF EXISTS brand_sku_counts;

DROP VIEW IF EXISTS product_embedding_coverage;

-- CASCADE 미사용 — 예상 못한 의존 발견 시 적용 시점에 에러로 표면화.
DROP TABLE IF EXISTS node_centroids;

COMMIT;

-- ─── 적용 후 검증 (수동) ─────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='analyses' AND column_name='sensitivity_tags';   -- 0 rows
--   SELECT matviewname FROM pg_matviews WHERE matviewname='brand_sku_counts'; -- 0 rows
--   SELECT to_regclass('public.product_embedding_coverage');            -- NULL
--   SELECT to_regclass('public.node_centroids');                        -- NULL
