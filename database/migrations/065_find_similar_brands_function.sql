-- 065_find_similar_brands_function.sql
-- SPEC-BRAND-EMBED-001 P5: brand cosine top-K helper.
--
-- 같은 FashionSigLIP 공간 (brand_multimodal_embeddings.vector) 에서
-- 주어진 brand 와 가장 가까운 brand top-K 반환.
-- HNSW (halfvec_ip_ops) 인덱스 활용 — L2-normalized 라 inner product ≡ cosine.
--
-- 사용처:
--   - admin UI 의 brand-clusters / similar-brand panel
--   - 미래 사용자향 "비슷한 브랜드" 추천 (SPEC-SEARCH-V6 통합 후)
--
-- Author: SPEC-BRAND-EMBED-001 P5 (2026-05-15)
-- Requires: 063 (brand_multimodal_embeddings)

BEGIN;

CREATE OR REPLACE FUNCTION find_similar_brands(
  p_brand_id bigint,
  p_limit    int DEFAULT 10
)
RETURNS TABLE (
  brand_id              bigint,
  brand_name            text,
  primary_style_node_id bigint,
  similarity            numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH target AS (
    SELECT vector FROM brand_multimodal_embeddings WHERE brand_id = p_brand_id
  )
  SELECT
    b.id,
    b.brand_name,
    b.primary_style_node_id,
    ROUND((1 - (e.vector <=> target.vector))::numeric, 4) AS similarity
  FROM brand_multimodal_embeddings e
  CROSS JOIN target
  JOIN brand_nodes b ON b.id = e.brand_id
  WHERE e.brand_id <> p_brand_id
  ORDER BY e.vector <=> target.vector
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION find_similar_brands IS
  'Top-K brand cosine neighbors in FashionSigLIP space. '
  'NULL target vector → empty result. SPEC-BRAND-EMBED-001 AC-002.';

COMMIT;
