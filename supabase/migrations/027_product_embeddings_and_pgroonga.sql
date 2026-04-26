-- 검색 엔진 v5: 임베딩 기반 전환 인프라
-- - products.embedding: FashionSigLIP(768-dim) 이미지 임베딩 저장
-- - pgroonga 인덱스: 한국어/다국어 BM25 풀텍스트 검색
-- - v4(product_ai_analysis)와 병행 운영, 검증 후 제거

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgroonga;

-- 2. 임베딩 컬럼 + HNSW 인덱스
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

COMMENT ON COLUMN products.embedding IS 'FashionSigLIP image embedding of images[0]';
COMMENT ON COLUMN products.embedding_model IS 'e.g. Marqo/marqo-fashionSigLIP';

-- HNSW: inner product 거리 (FashionSigLIP 출력이 L2-normalized이므로 cos ≈ ip)
-- m=16, ef_construction=200 (pgvector 권장 기본값, 81k 상품에 충분)
CREATE INDEX IF NOT EXISTS idx_products_embedding_hnsw
  ON products USING hnsw (embedding vector_ip_ops)
  WITH (m = 16, ef_construction = 200);

-- 3. pgroonga 풀텍스트 인덱스 (한국어 토크나이저)
-- brand + name + description + material + color 통합 검색 텍스트
-- (tags는 배열이라 array_to_string이 STABLE → 인덱스 표현식 불가. tags는 hard filter로 별도 처리)
CREATE INDEX IF NOT EXISTS idx_products_pgroonga_search
  ON products USING pgroonga (
    (coalesce(brand, '') || ' ' ||
     coalesce(name, '') || ' ' ||
     coalesce(description, '') || ' ' ||
     coalesce(material, '') || ' ' ||
     coalesce(color, ''))
  );

-- tags용 별도 GIN 인덱스 (배열 포함 연산자 @> 지원)
CREATE INDEX IF NOT EXISTS idx_products_tags_gin
  ON products USING gin (tags);

-- 4. 임베딩 배치 상태 추적용 부분 인덱스 (아직 임베딩 안 된 상품 빠르게 조회)
CREATE INDEX IF NOT EXISTS idx_products_embedding_pending
  ON products (id)
  WHERE embedding IS NULL AND images IS NOT NULL AND array_length(images, 1) > 0;

-- 5. 임베딩 커버리지 모니터링 뷰
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

-- 6. HNSW 런타임 튜닝용 함수 (ef_search 동적 조절)
-- Usage: SELECT set_hnsw_ef_search(100); SELECT ... (기본 40, 높이면 recall↑ latency↑)
CREATE OR REPLACE FUNCTION set_hnsw_ef_search(ef int)
RETURNS void LANGUAGE sql AS $$
  SET LOCAL hnsw.ef_search = ef;
$$;

-- 7. 임베딩 bulk update RPC (배치 인코딩 스크립트에서 사용)
-- payload: [{"id": "<uuid>", "embedding": "[0.1,0.2,...]", "model": "Marqo/..."}]
CREATE OR REPLACE FUNCTION bulk_update_product_embeddings(payload jsonb)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  n int;
BEGIN
  UPDATE products p
  SET embedding = (u->>'embedding')::vector,
      embedding_model = u->>'model',
      embedded_at = now()
  FROM jsonb_array_elements(payload) u
  WHERE p.id = (u->>'id')::uuid;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
