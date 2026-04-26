-- 검색 엔진 v5: dense (HNSW pgvector) + sparse (pgroonga BM25) + RRF
-- 책임 경계 (B 옵션):
--   * 이 RPC: dense+sparse+RRF → top-K 후보 반환
--   * AI 서버 Python 측: 다양성 캡(브랜드/플랫폼), tolerance, 최종 정렬
-- portal/ai (FastAPI)에서 호출. v4 (/api/search-products)는 폴백 전용으로 유지.
--
-- ⚠ pgroonga_score(tableoid, ctid) 는 실제 테이블의 시스템 컬럼이 필요 — CTE 결과로는
--    동작하지 않음 (`SELECT p.*` 은 시스템 컬럼을 포함하지 않음). 따라서 dense/sparse
--    각 CTE에서 products를 직접 쿼리하고 hard filter를 인라인.

-- 풀텍스트 검색 텍스트 컬럼식 (pgroonga 인덱스와 동일 표현식 유지)
CREATE OR REPLACE FUNCTION product_search_text(p products)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(p.brand, '') || ' ' ||
         coalesce(p.name, '') || ' ' ||
         coalesce(p.description, '') || ' ' ||
         coalesce(p.material, '') || ' ' ||
         coalesce(p.color, '');
$$;

-- 메인 v5 검색 RPC.
-- - query_embedding: FashionSigLIP 768-dim (이미지 임베딩)
-- - query_text: 자유 텍스트 (Vision의 searchQuery 또는 브랜드/이름 키워드)
-- - brand_filter: 활성 시 hard filter (strongMatches 모드)
-- - tags_filter: 활성 시 GIN 인덱스 활용
-- - k: top-K (기본 50, AI 서버에서 다양성 캡 후 15개로 줄임)
-- - rrf_k: RRF 상수 (60 권장)
CREATE OR REPLACE FUNCTION search_products_v5(
  query_embedding vector(768),
  query_text text DEFAULT NULL,
  brand_filter text[] DEFAULT NULL,
  gender_filter text[] DEFAULT NULL,
  subcategory_filter text DEFAULT NULL,
  price_min integer DEFAULT NULL,
  price_max integer DEFAULT NULL,
  tags_filter text[] DEFAULT NULL,
  k integer DEFAULT 50,
  rrf_k integer DEFAULT 60
)
RETURNS TABLE (
  id uuid,
  brand text,
  name text,
  price integer,
  image_url text,
  product_url text,
  platform text,
  subcategory text,
  color text,
  material text,
  style_node text,
  gender text[],
  tags text[],
  dense_rank integer,
  sparse_rank integer,
  dense_score double precision,
  sparse_score double precision,
  score double precision
)
LANGUAGE sql STABLE AS $$
  WITH dense AS (
    -- HNSW: vector_ip_ops 인덱스 (FashionSigLIP는 L2 normalized → cos ≈ inner product)
    SELECT
      p.id,
      1 - (p.embedding <=> query_embedding) AS sim,
      row_number() OVER (ORDER BY p.embedding <=> query_embedding ASC) AS r
    FROM products p
    WHERE p.in_stock = true
      AND p.embedding IS NOT NULL
      AND (brand_filter IS NULL OR p.brand = ANY(brand_filter))
      AND (gender_filter IS NULL OR p.gender && gender_filter)
      AND (subcategory_filter IS NULL OR p.subcategory = subcategory_filter)
      AND (price_min IS NULL OR p.price >= price_min)
      AND (price_max IS NULL OR p.price <= price_max)
      AND (tags_filter IS NULL OR p.tags && tags_filter)
    ORDER BY p.embedding <=> query_embedding ASC
    LIMIT k * 4
  ),
  sparse AS (
    -- pgroonga: BM25-유사 score. query_text NULL이면 빈 결과.
    -- pgroonga_score 는 실제 테이블 시스템 컬럼 필요 → products 직접 참조
    SELECT
      p.id,
      pgroonga_score(p.tableoid, p.ctid) AS sim,
      row_number() OVER (ORDER BY pgroonga_score(p.tableoid, p.ctid) DESC) AS r
    FROM products p
    WHERE p.in_stock = true
      AND query_text IS NOT NULL
      AND query_text <> ''
      AND product_search_text(p) &@~ query_text
      AND (brand_filter IS NULL OR p.brand = ANY(brand_filter))
      AND (gender_filter IS NULL OR p.gender && gender_filter)
      AND (subcategory_filter IS NULL OR p.subcategory = subcategory_filter)
      AND (price_min IS NULL OR p.price >= price_min)
      AND (price_max IS NULL OR p.price <= price_max)
      AND (tags_filter IS NULL OR p.tags && tags_filter)
    ORDER BY pgroonga_score(p.tableoid, p.ctid) DESC
    LIMIT k * 4
  ),
  fused AS (
    SELECT
      coalesce(d.id, s.id) AS id,
      d.r AS dense_rank,
      s.r AS sparse_rank,
      coalesce(d.sim, 0)::double precision AS dense_score,
      coalesce(s.sim, 0)::double precision AS sparse_score,
      coalesce(1.0 / (rrf_k + d.r), 0) + coalesce(1.0 / (rrf_k + s.r), 0) AS score
    FROM dense d
    FULL OUTER JOIN sparse s ON d.id = s.id
  )
  SELECT
    p.id,
    p.brand,
    p.name,
    p.price,
    p.image_url,
    p.product_url,
    p.platform,
    p.subcategory,
    p.color,
    p.material,
    p.style_node,
    p.gender,
    p.tags,
    f.dense_rank::integer,
    f.sparse_rank::integer,
    f.dense_score,
    f.sparse_score,
    f.score
  FROM fused f
  JOIN products p USING (id)
  ORDER BY f.score DESC
  LIMIT k;
$$;

COMMENT ON FUNCTION search_products_v5 IS
  'v5 검색: HNSW dense + pgroonga sparse + RRF. AI 서버(portal/ai)에서 호출. 다양성 캡은 클라이언트 측에서 적용.';
