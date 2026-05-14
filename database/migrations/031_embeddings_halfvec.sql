-- v5 검색: 임베딩 storage 절감 — vector(768) → halfvec(768)
--
-- 동기:
--   * Supabase Free 0.5GB 한계 도달 (현재 144%)
--   * halfvec(768): 행당 3072B → 1536B (-50%)
--   * HNSW 인덱스도 -50%
--   * 검색 품질 영향 무시 가능 (FashionSigLIP L2-normalized + cosine recall@k -0.5% 이하)
--
-- 부수 개선:
--   027 의 HNSW opclass(vector_ip_ops) 와 030 v5 RPC 연산자(<=>) 불일치 → 인덱스 미사용 가능성.
--   halfvec_cosine_ops 로 정렬하면 ORDER BY <=> 가 인덱스를 실제로 탐.
--
-- ⚠ 디스크: ALTER TYPE 가 테이블 rewrite. HNSW DROP 으로 ~200MB 회수 후 진행.
-- ⚠ 락: 변환 동안 products 테이블 ACCESS EXCLUSIVE → v5 검색 일시 차단 (~30s-1min).
-- ⚠ 사전요건: pgvector >= 0.7.0 (Supabase 는 이미 충족)

BEGIN;

-- 1. 기존 HNSW 인덱스 제거 (rewrite 공간 확보 + opclass 변경 필요)
DROP INDEX IF EXISTS idx_products_embedding_hnsw;

-- 1-1. embedding 컬럼을 참조하는 뷰 제거 (ALTER TYPE 차단 사유)
--      027 에서 생성된 product_embedding_coverage 뷰가 count(embedding) 으로 의존 중.
--      ALTER TYPE 후 동일 정의로 재생성.
DROP VIEW IF EXISTS product_embedding_coverage;

-- 2. 컬럼 타입 변환: vector(768) → halfvec(768)
ALTER TABLE products
  ALTER COLUMN embedding TYPE halfvec(768)
  USING embedding::halfvec(768);

-- 3. HNSW 재생성 — halfvec_cosine_ops 로 v5 RPC 의 <=> 와 일치
CREATE INDEX idx_products_embedding_hnsw
  ON products USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- 3-1. 뷰 재생성 (027 정의 그대로)
CREATE OR REPLACE VIEW product_embedding_coverage AS
SELECT
  platform,
  count(*) AS total,
  count(embedding) AS embedded,
  round(100.0 * count(embedding) / nullif(count(*), 0), 2) AS pct_embedded,
  max(embedded_at) AS last_embedded_at
FROM products
GROUP BY platform
ORDER BY total DESC;

-- 4. bulk update RPC: cast 타입 갱신 (배치 임베딩 스크립트가 사용)
CREATE OR REPLACE FUNCTION bulk_update_product_embeddings(payload jsonb)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  n int;
BEGIN
  UPDATE products p
  SET embedding = (u->>'embedding')::halfvec(768),
      embedding_model = u->>'model',
      embedded_at = now()
  FROM jsonb_array_elements(payload) u
  WHERE p.id = (u->>'id')::uuid;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- 5. v5 검색 RPC: query_embedding 파라미터 타입 vector(768) → halfvec(768)
--    함수 본문은 030 과 동일. 파라미터 타입만 변경.
--    Python(_embedding_to_pgvector) 측은 변경 불필요 — 텍스트 포맷 [v1,v2,...] 동일.
CREATE OR REPLACE FUNCTION search_products_v5(
  query_embedding halfvec(768),
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

-- 6. 030 의 vector(768) 시그니처 잔재 제거 — CREATE OR REPLACE 는 시그니처가 다르면
--    새 오버로드를 만들기 때문에 모호성(ambiguous function call) 방지 차원에서 명시 제거.
DROP FUNCTION IF EXISTS search_products_v5(
  vector, text, text[], text[], text, integer, integer, text[], integer, integer
);

COMMIT;

-- 7. 통계 갱신 (트랜잭션 외부에서 실행)
ANALYZE products;

COMMENT ON FUNCTION search_products_v5(
  halfvec, text, text[], text[], text, integer, integer, text[], integer, integer
) IS
  'v5 검색 (halfvec): HNSW dense + pgroonga sparse + RRF. portal/ai 에서 호출.';
