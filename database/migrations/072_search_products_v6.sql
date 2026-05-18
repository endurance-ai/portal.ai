-- 072_search_products_v6.sql
-- SPEC-SEARCH-V6-001 P1 — v6 embedding-first retrieval RPC.
--
-- Replaces the dropped search_products_v5 (069) with the embedding-first
-- contract (SPEC §4 + ratified §13). One SQL-callable function does the full
-- v6 pipeline server-side because PostgREST cannot express the HNSW `<=>`
-- ordering and 069 removed the v5 RPC:
--
--   FILTER 1  brand_nodes WHERE primary_style_node_id = p_style_node_id
--             (EXACT, no adjacency — SPEC REQ-V6-010)
--   FILTER 2  products WHERE brand_node_id ∈ filtered brands
--             AND category = p_category AND in_stock = true
--             [AND subcategory = p_subcategory when provided]
--             AND a product_embeddings row exists (REQ-V6-011/021)
--   RANK      ORDER BY embedding <=> query_embedding ASC,
--             products.created_at DESC  LIMIT p_limit  (REQ-V6-012)
--   FALLBACK  ratified §13 결정 1 — when the node-filtered candidate set is
--             empty (or no node id was supplied at all), drop the node filter
--             and rank category+in_stock+embedding products; flag degraded.
--
-- The `degraded` boolean is returned on every row (uniform per call) so the
-- adapter can echo provenance WITHOUT a new RecommendResponse field
-- (SPEC §6 — response shape frozen): adapter maps degraded → engine tag
-- "v6-degraded" (mirrors the documented "v4-degraded" provenance precedent
-- in engine-port.ts), which the route already echoes verbatim.
--
-- Ranking is SOLELY cosine(query_emb, product_embeddings.embedding). No
-- weighted attribute sum, no PAI, no brand vectors (REQ-V6-002/030/031/032).
--
-- p_brand_names: optional. When non-NULL the candidate set is additionally
-- restricted to products whose brand_nodes.brand_name ∈ p_brand_names — this
-- is the "strong" (brandFilter) call; NULL = the always-run "general" call.
--
-- opclass: idx_product_embeddings_hnsw is halfvec_cosine_ops (071). `<=>` is
-- the cosine distance operator; smaller = closer. FashionSigLIP output is
-- L2-normalized so cosine is well-defined.
--
-- Author: SPEC-SEARCH-V6-001 P1 (2026-05-18)
-- Requires: 071 (product_embeddings + idx_product_embeddings_hnsw),
--           070 (products.id bigint), 057 (products.brand_node_id),
--           062 (brand_nodes.primary_style_node_id)

BEGIN;

-- @MX:ANCHOR: [AUTO] search_products_v6 is the sole v6 retrieval contract —
--   every /api/find/search request (when SEARCH_ENGINE_VERSION=v6) ranks
--   through this function's cosine `<=>` over idx_product_embeddings_hnsw
--   (REQ-V6-002, AC-001/004). Strong + general calls both invoke it.
-- @MX:REASON: SPEC-SEARCH-V6-001 §4/§13 fixes the embedding-first pipeline
--   (FILTER1 EXACT node → FILTER2 category/in_stock/embedding → cosine DESC,
--   created_at tie) and the ratified degrade fallback to THIS function.
--   069 dropped search_products_v5; PostgREST cannot express HNSW ordering,
--   so this RPC is the required DB seam (pattern: find_similar_brands 065).
-- @MX:SPEC: SPEC-SEARCH-V6-001
CREATE OR REPLACE FUNCTION search_products_v6(
  query_embedding   halfvec(768),
  p_style_node_id   bigint  DEFAULT NULL,
  p_category        text    DEFAULT NULL,
  p_subcategory     text    DEFAULT NULL,
  p_brand_names     text[]  DEFAULT NULL,
  p_limit           int     DEFAULT 30
)
RETURNS TABLE (
  id            bigint,
  brand         text,
  name          text,
  price         integer,
  image_url     text,
  product_url   text,
  platform      text,
  subcategory   text,
  distance      double precision,
  degraded      boolean
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_node_count integer := 0;
BEGIN
  -- ── node-filtered candidate count (FILTER 1 + FILTER 2) ─────────
  -- Only meaningful when a style node id was supplied. When NULL there is
  -- no node filter to apply at all → go straight to the degraded path.
  IF p_style_node_id IS NOT NULL THEN
    SELECT count(*) INTO v_node_count
    FROM products p
    JOIN brand_nodes bn ON bn.id = p.brand_node_id
    JOIN product_embeddings pe ON pe.product_id = p.id
    WHERE bn.primary_style_node_id = p_style_node_id
      AND p.in_stock = true
      AND (p_category IS NULL OR p.category = p_category)
      AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
      AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names));
  END IF;

  IF p_style_node_id IS NOT NULL AND v_node_count > 0 THEN
    -- ── EXACT path (not degraded) ──────────────────────────────────
    RETURN QUERY
      SELECT p.id, p.brand, p.name, p.price, p.image_url, p.product_url,
             p.platform, p.subcategory,
             (pe.embedding <=> query_embedding)::double precision AS distance,
             false AS degraded
      FROM products p
      JOIN brand_nodes bn ON bn.id = p.brand_node_id
      JOIN product_embeddings pe ON pe.product_id = p.id
      WHERE bn.primary_style_node_id = p_style_node_id
        AND p.in_stock = true
        AND (p_category IS NULL OR p.category = p_category)
        AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
        AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names))
      ORDER BY pe.embedding <=> query_embedding ASC, p.created_at DESC
      LIMIT p_limit;
  ELSE
    -- ── DEGRADED path (ratified §13 결정 1) ───────────────────────
    -- Node filter dropped (thin/0 pool) OR no node id supplied. Rank all
    -- category + in_stock + embedding products by cosine. brand_names (if
    -- present, the strong call) still narrows the pool.
    RETURN QUERY
      SELECT p.id, p.brand, p.name, p.price, p.image_url, p.product_url,
             p.platform, p.subcategory,
             (pe.embedding <=> query_embedding)::double precision AS distance,
             true AS degraded
      FROM products p
      JOIN product_embeddings pe ON pe.product_id = p.id
      LEFT JOIN brand_nodes bn ON bn.id = p.brand_node_id
      WHERE p.in_stock = true
        AND (p_category IS NULL OR p.category = p_category)
        AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
        AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names))
      ORDER BY pe.embedding <=> query_embedding ASC, p.created_at DESC
      LIMIT p_limit;
  END IF;
END;
$$;

COMMENT ON FUNCTION search_products_v6 IS
  'v6 embedding-first retrieval (SPEC-SEARCH-V6-001 §4/§13). FILTER1 EXACT '
  'primary_style_node → FILTER2 category/in_stock/embedding → cosine `<=>` '
  'DESC, created_at tie. Empty node pool (or NULL node) → degraded fallback '
  '(category-only, degraded=true). Sole ranking signal = cosine; no PAI, no '
  'attribute weight-sum, no brand vectors.';

COMMIT;

-- ── manual verification (post-commit) ───────────────────────────
--   -- must use idx_product_embeddings_hnsw:
--   EXPLAIN ANALYZE SELECT * FROM search_products_v6(
--     (SELECT embedding FROM product_embeddings LIMIT 1),
--     NULL, NULL, NULL, NULL, 10);
--   -- node-filtered path:
--   SELECT id, brand, distance, degraded FROM search_products_v6(
--     (SELECT embedding FROM product_embeddings LIMIT 1),
--     (SELECT id FROM style_nodes WHERE code = 'C'), 'Top', NULL, NULL, 10);
