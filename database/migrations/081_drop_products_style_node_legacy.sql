-- 081_drop_products_style_node_legacy.sql
-- products.style_node 레거시 text enum 컬럼 폐기.
--
-- 배경:
--   migration 004 가 products.style_node text 컬럼 + idx_products_style_node 인덱스
--   추가. 008 이 15-code enum CHECK constraint (chk_products_style_node) 추가.
--   원래는 product-level AI 분류 라벨 캐시였으나, v4 시절부터 product_ai_analysis
--   가 truthy 소스였고 069 (PAI drop) 이후로는 의미 잃음. v6 (embedding-first) 는
--   product-level categorical 라벨을 사용하지 않는다 — 임베딩 cosine 검색이 대체.
--
--   현재 상태 (2026-05-20 측정):
--     * 118,504 products 중 style_node 채워진 row = 265 (~0.2%, 레거시 잔재)
--     * 어드민 /admin/products 는 이 컬럼 비참조 (074 청산 후 brand_nodes 경유)
--     * v6 검색 RPC (search_products_v6, 072/073) 도 비참조
--     * v4 search 코드 (domains/search-v4/scorer.ts) 가 row.style_node 참조하나
--       어차피 PAI 폐기로 깨진 dead path — 어드민 search-debugger 정리 시 같이 제거 예정
--
-- 이 마이그가 하는 일:
--   * idx_products_style_node     (004) DROP
--   * chk_products_style_node     (008) DROP
--   * products.style_node 컬럼     DROP
--   * COMMENT (046) 는 컬럼과 함께 소멸
--
-- SCOPE GUARD:
--   * brand_nodes.primary_style_node_id / secondary_style_node_id 는 v6 의 truthy
--     소스 — 절대 건드리지 않는다.
--   * style_nodes 테이블 전체 무변경.
--
-- Author: kiko.ai admin cleanup (2026-05-20)

BEGIN;

DROP INDEX IF EXISTS idx_products_style_node;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS chk_products_style_node;

ALTER TABLE products
  DROP COLUMN IF EXISTS style_node;

COMMIT;
