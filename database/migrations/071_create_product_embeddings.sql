-- 071_create_product_embeddings.sql
-- SPEC-SEARCH-V6-001 P0 (3/3) — product_embeddings table + backfill +
-- 027/031 embedding-asset rework.
--
-- 070 이후 실행되므로 products.id 는 이미 bigint -> product_embeddings.
-- product_id 는 처음부터 bigint (SPEC §7a "처음부터 bigint", FK swap
-- 표면 아님). backfill 은 단순 SELECT (uuid 매핑 없음).
--
-- 구조는 brand_multimodal_embeddings (063) 와 대칭: halfvec(768) + HNSW
-- halfvec_cosine_ops. products.embedding 은 이미 halfvec(768) (migration
-- 031 이 vector(768)->halfvec(768) 변환) 이므로 backfill 은 캐스팅 없는
-- 단순 복사.
--
-- HNSW opclass 결정 (SPEC §7a — 구현 시점, ratification 아님):
--   선택: halfvec_cosine_ops.
--   근거:
--     1. Migration 031 이 이미 idx_products_embedding_hnsw 를
--        halfvec_cosine_ops 로 재생성 (031 L33-35) — 이게 확립된 선택,
--        027 의 원래 vector_ip_ops 아님 (027 은 031 로 대체됨).
--     2. brand_multimodal_embeddings (063) 와 대칭 — 둘 다 halfvec(768)
--        HNSW halfvec_cosine_ops. v6 는 products + brand 벡터를 동일
--        cosine 공간에서 랭킹; opclass 일치로 스택 정합 유지.
--     3. FashionSigLIP 출력은 L2-normalized -> cosine == inner-product
--        수학적 등가; cosine_ops 가 명시적·자기설명적 선택.
--     pgvector >= 0.7.0 확인 (031 이 halfvec 위해 이미 요구).
--
-- 027/031 자산 rework (SPEC §7b 체크리스트 — 4종 전부 + python writer):
--   idx_products_embedding_hnsw     -> idx_product_embeddings_hnsw   (여기)
--   idx_products_embedding_pending  -> idx_products_embedding_pending (재작성:
--                                       "images 있으나 product_embeddings
--                                       row 없는 products")
--   VIEW product_embedding_coverage -> product_embeddings LEFT JOIN     (여기)
--   RPC bulk_update_product_embeddings -> product_embeddings UPSERT     (여기)
--   scripts/aws/embed_products.py   -> product_embeddings UPSERT (별도 파일)
--
-- SCOPE GUARD (SPEC §7b [HARD]): products.embedding / embedding_model /
--   embedded_at 컬럼은 여기서 DROP 안 함 — cutover 후 별 마이그, P0 scope
--   밖. 잔존·populated 유지; product_embeddings 가 새 home 이고 이 마이그는
--   ADD + backfill 만 수행.
--
-- Author: SPEC-SEARCH-V6-001 P0 (2026-05-18)

BEGIN;

-- pgvector 이미 존재 (027). halfvec 은 pgvector >= 0.7.0 요구 (031).
CREATE EXTENSION IF NOT EXISTS vector;

-- ── 1) product_embeddings 테이블 ────────────────────────────────
-- product_id bigint PK + FK -> products.id (070 이후 bigint).
CREATE TABLE IF NOT EXISTS product_embeddings (
  product_id      bigint       PRIMARY KEY
                               REFERENCES products(id) ON DELETE CASCADE,
  embedding       halfvec(768) NOT NULL,
  embedding_model text         NOT NULL,
  embedded_at     timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE product_embeddings IS
  'FashionSigLIP(768) product image embeddings, normalized out of products (SPEC-SEARCH-V6-001 §7a). Symmetric with brand_multimodal_embeddings (063). v6 ranks by cosine(query_emb, embedding).';
COMMENT ON COLUMN product_embeddings.embedding IS
  'halfvec(768), FashionSigLIP image embedding of images[0], L2-normalized.';
COMMENT ON COLUMN product_embeddings.embedding_model IS
  'e.g. Marqo/marqo-fashionSigLIP';

-- ── 2) products.embedding 에서 backfill (캐스팅 없음 — 이미 halfvec) ─
-- products.embedding IS NOT NULL 인 ~71k row. id 는 bigint (070 이후) 라
-- 단순 SELECT. Idempotent: ON CONFLICT DO NOTHING 으로 재실행 시 이미
-- 복사된 row 는 no-op.
INSERT INTO product_embeddings (product_id, embedding, embedding_model, embedded_at)
SELECT p.id,
       p.embedding,
       COALESCE(p.embedding_model, 'Marqo/marqo-fashionSigLIP'),
       COALESCE(p.embedded_at, now())
  FROM products p
 WHERE p.embedding IS NOT NULL
ON CONFLICT (product_id) DO NOTHING;

-- ── 3) backfill 무결성 검증 (count parity) ──────────────────────
DO $$
DECLARE
  v_src integer;
  v_dst integer;
BEGIN
  SELECT count(*) INTO v_src FROM products WHERE embedding IS NOT NULL;
  SELECT count(*) INTO v_dst FROM product_embeddings;
  IF v_dst < v_src THEN
    RAISE EXCEPTION 'product_embeddings backfill incomplete: products w/ embedding=% but product_embeddings=%', v_src, v_dst;
  END IF;
  RAISE NOTICE 'product_embeddings backfill OK: src(products.embedding)=% dst(product_embeddings)=%', v_src, v_dst;
END $$;

-- ── 4) HNSW 인덱스 (halfvec_cosine_ops — 헤더 결정 참조) ────────
-- @MX:ANCHOR: [AUTO] idx_product_embeddings_hnsw is the v6 ANN ranking index
--   — every /api/find/search cosine top-N query depends on it (REQ-V6-002,
--   AC-020). m=16/ef_construction=200 mirrors 031 + brand_multimodal (063).
-- @MX:REASON: SPEC-SEARCH-V6-001 §7a fixes the embedding-first ranking
--   contract to this index; opclass halfvec_cosine_ops keeps products and
--   brand_multimodal_embeddings in one consistent cosine space.
-- @MX:SPEC: SPEC-SEARCH-V6-001
-- /dev/shm 우회: db 컨테이너 공유메모리 64MB(Docker 기본) < 병렬 HNSW
-- 공유세그먼트 요청(~533MB, 71k×halfvec768). 직렬 빌드는 private
-- maintenance_work_mem(512MB)만 사용 → /dev/shm 0. 프로브로 동일 행수
-- 직렬 빌드 성공 입증. SET LOCAL = 트랜잭션-로컬(단일 tx·ROLLBACK 계약 양립),
-- 마이그 self-contained(인프라 가정 무의존). dev-app 단일운영·무사용자·
-- product_embeddings 신규 테이블(동시 접근 0)이라 직렬 빌드 lock 시간 허용.
SET LOCAL max_parallel_maintenance_workers = 0;
CREATE INDEX IF NOT EXISTS idx_product_embeddings_hnsw
  ON product_embeddings USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- ── 5) pending 부분 인덱스 (027 rework) ─────────────────────────
-- 원본 (027): 임베딩 필요 products = embedding IS NULL AND images.
--
-- SPEC §7b 문구에 대한 PUSHBACK: 부분 인덱스 predicate 는 다른 테이블을
-- 참조할 수 없음 (PostgreSQL 은 인덱스 대상 테이블 자체 컬럼에 대한
-- immutable 식만 허용 — `id NOT IN (SELECT ... FROM product_embeddings)` 는
-- invalid 이고 CREATE INDEX 시점에 실패). "product_embeddings row 없음"
-- anti-join 은 raw 부분 인덱스로 표현 불가. 따라서 권위 있는 pending
-- 판단은 다음에 위치:
--   * VIEW product_embedding_coverage (step 6, LEFT JOIN), 및
--   * scripts/aws/embed_products.py 클라이언트 측 anti-join.
--
-- 이 인덱스는 027 의 products 자체 컬럼 predicate 를 유지하며, 이는 이
-- 마이그 시점/이후 "product_embeddings row 없음" 과 정확히 등가:
-- products.embedding 은 잔존·populated (SPEC §7b — cutover 후 별 마이그
-- 까지 미 drop) 이고 step 2 가 모든 `products.embedding IS NOT NULL` row 를
-- product_embeddings 로 backfill 했으므로, P0/pre-cutover 구간 전체에서
-- `embedding IS NULL` <=> product_embeddings row 없음. 컬럼 drop 전까지
-- 올바른 보수적 "임베딩 필요" 신호로 유효.
CREATE INDEX IF NOT EXISTS idx_products_embedding_pending
  ON products (id)
  WHERE embedding IS NULL
    AND images IS NOT NULL
    AND array_length(images, 1) > 0;

-- ── 6) coverage VIEW (027/031 rework) ───────────────────────────
-- count(products.embedding) 대신 product_embeddings LEFT JOIN 으로 전환.
CREATE OR REPLACE VIEW product_embedding_coverage AS
SELECT p.platform,
       count(*)                                                AS total,
       count(pe.product_id)                                    AS embedded,
       round(100.0 * count(pe.product_id)
             / nullif(count(*), 0), 2)                          AS pct_embedded,
       max(pe.embedded_at)                                     AS last_embedded_at
  FROM products p
  LEFT JOIN product_embeddings pe ON pe.product_id = p.id
 GROUP BY p.platform
 ORDER BY total DESC;

-- ── 7) bulk UPSERT RPC (027/031 rework) ─────────────────────────
-- payload: [{"id": "<bigint as text>", "embedding": "[v1,v2,...]", "model": "Marqo/..."}]
-- INSERT ... ON CONFLICT (product_id) DO UPDATE — bigint product_id 키.
CREATE OR REPLACE FUNCTION bulk_update_product_embeddings(payload jsonb)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  n int;
BEGIN
  INSERT INTO product_embeddings (product_id, embedding, embedding_model, embedded_at)
  SELECT (u->>'id')::bigint,
         (u->>'embedding')::halfvec(768),
         u->>'model',
         now()
    FROM jsonb_array_elements(payload) u
  ON CONFLICT (product_id) DO UPDATE
    SET embedding       = EXCLUDED.embedding,
        embedding_model = EXCLUDED.embedding_model,
        embedded_at     = EXCLUDED.embedded_at;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION bulk_update_product_embeddings(jsonb) IS
  'product_embeddings bulk UPSERT (SPEC-SEARCH-V6-001 §7b). Keyed on bigint product_id. Used by scripts/aws/embed_products.py.';

COMMIT;

-- ── 통계 갱신 (트랜잭션 외부) ───────────────────────────────────
ANALYZE product_embeddings;

-- ── 권장 검증 (수동, commit 후) ─────────────────────────────────
--   SELECT data_type FROM information_schema.columns
--     WHERE table_name='product_embeddings' AND column_name='product_id'; -- bigint
--   SELECT count(*) FROM product_embeddings;                              -- ~71k
--   SELECT count(*) FROM products WHERE embedding IS NOT NULL;            -- == above
--   -- ANN smoke (반드시 idx_product_embeddings_hnsw 사용):
--   EXPLAIN ANALYZE
--     SELECT product_id FROM product_embeddings
--     ORDER BY embedding <=> (SELECT embedding FROM product_embeddings LIMIT 1)
--     LIMIT 10;
--   SELECT * FROM product_embedding_coverage;
--   -- products.embedding 컬럼은 반드시 잔존해야 함 (SPEC §7b):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='products' AND column_name='embedding';            -- 1 row
