-- 042: Brand graph view performance + UMAP layout cache.
--
-- Background: /admin/brand-graph 가 100k products row 를 통째로 fetch 해서
-- 브랜드별 SKU 카운트를 클라이언트에서 집계 — 5초+ 로드. 또한 force-directed
-- simulation 을 클라이언트에서 매 페이지 진입마다 실행 — 시각적으로 hairball.
--
-- 해결:
--   1. brand_sku_counts 뷰: products GROUP BY brand 를 DB 에서 1회 — 단일 query.
--   2. brand_nodes 에 (x_umap, y_umap, umap_at) 캐시: portal/ai 의
--      scripts/umap_brand_layout.py 가 1024-d embedding → UMAP 2D 좌표
--      사전 계산. 클라이언트는 그리기만.

-- ─── A. SKU count view ────────────────────────────────────────
CREATE OR REPLACE VIEW brand_sku_counts AS
SELECT
  brand,
  COUNT(*)::int AS sku_count
FROM products
WHERE brand IS NOT NULL
GROUP BY brand;

COMMENT ON VIEW brand_sku_counts IS
  'Per-brand SKU count for graph node weighting. Replaces client-side aggregate.';

-- ─── B. UMAP layout cache ─────────────────────────────────────
ALTER TABLE brand_nodes
  ADD COLUMN IF NOT EXISTS x_umap real,
  ADD COLUMN IF NOT EXISTS y_umap real,
  ADD COLUMN IF NOT EXISTS umap_at timestamptz;

COMMENT ON COLUMN brand_nodes.x_umap IS
  'UMAP 2D projection X coordinate (computed from embedding). NULL = not yet projected.';
COMMENT ON COLUMN brand_nodes.y_umap IS
  'UMAP 2D projection Y coordinate. Pair with x_umap.';
COMMENT ON COLUMN brand_nodes.umap_at IS
  'When this UMAP layout was computed. Recompute when embedding_text_hash changes.';

-- 미투영 row 빠르게 찾기 (배치 스크립트 최적화)
CREATE INDEX IF NOT EXISTS idx_brand_nodes_umap_pending
  ON brand_nodes (id)
  WHERE x_umap IS NULL AND embedding IS NOT NULL;
