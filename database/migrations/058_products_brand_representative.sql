-- 058_products_brand_representative.sql
-- products.is_brand_representative boolean — brand-VLM 의 5장 입력 source.
-- SPEC-BRAND-NODE-001 의 random.sample(5) 방식 폐기. 본 컬럼이 SOT.
--
-- 운영 흐름:
--   1) crawler 의 select-representatives CLI 가 brand 별 다양성 휴리스틱으로
--      5~10 product 에 is_brand_representative=true flag.
--   2) brand_nodes.representative_image_urls 는 cache 로 동시 sync (denorm).
--   3) admin UI 가 본 컬럼 toggle. brand_nodes.representative_image_urls 도 cache 갱신.
--   4) brand-VLM script (SPEC-BRAND-NODE-001 P3) 가
--      SELECT image_url FROM products WHERE brand_node_id=$1 AND is_brand_representative=true LIMIT 5
--      형태로 입력 source 로 사용.
--
-- partial index — 전체 ~33k row 중 brand 당 5~10 = 약 10k row 만 true.
-- WHERE is_brand_representative=true 로 좁히는 쿼리 가속.
--
-- Author: SPEC-BRAND-NODE-001 PR-Y (2026-05-14, crawler 세션)
-- Requires: 056 (brand_nodes bigint), 057 (products.brand_node_id)

BEGIN;

-- ── 1) 컬럼 추가 ────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN is_brand_representative boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN products.is_brand_representative IS
  'brand-VLM 5장 입력 SOT. crawler select-representatives CLI + admin UI 가 toggle. brand_nodes.representative_image_urls 는 본 컬럼의 cache.';

-- ── 2) Partial index ────────────────────────────────────────
-- brand-VLM 입력 쿼리 + admin 그리드 표시에 최적화.
CREATE INDEX idx_products_brand_representative
  ON products(brand_node_id, created_at DESC)
  WHERE is_brand_representative = true;

COMMIT;

-- 검증 쿼리 (수동, select-representatives CLI 실행 후):
--   SELECT bn.brand_name, COUNT(p.id) FILTER (WHERE p.is_brand_representative) AS rep_count
--     FROM brand_nodes bn
--     LEFT JOIN products p ON p.brand_node_id = bn.id
--    GROUP BY bn.brand_name
--    HAVING COUNT(p.id) FILTER (WHERE p.is_brand_representative) > 0
--    ORDER BY rep_count DESC
--    LIMIT 30;
