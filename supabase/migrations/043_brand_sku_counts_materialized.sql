-- 043: brand_sku_counts → materialized view.
--
-- 042의 일반 view 는 쿼리마다 products 33k row 위 GROUP BY 재실행.
-- PostgREST 가 1000 row max-rows cap 이라 페이지네이션 시 매 페이지 GROUP BY 가
-- 다시 돈다 → /admin/brand-graph 가 18s+ 타임아웃. 마테리얼라이즈로 instant lookup.

DROP VIEW IF EXISTS brand_sku_counts;

CREATE MATERIALIZED VIEW brand_sku_counts AS
SELECT
  brand,
  COUNT(*)::int AS sku_count
FROM products
WHERE brand IS NOT NULL
GROUP BY brand;

-- CONCURRENTLY refresh 가능하려면 UNIQUE 인덱스 필수
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_sku_counts_brand
  ON brand_sku_counts (brand);

COMMENT ON MATERIALIZED VIEW brand_sku_counts IS
  'Per-brand SKU count. Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY brand_sku_counts;';

-- 초기 1회 갱신 (DROP 시 데이터 비어있음)
REFRESH MATERIALIZED VIEW brand_sku_counts;
