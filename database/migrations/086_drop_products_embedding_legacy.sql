-- 086_drop_products_embedding_legacy.sql
-- products 의 레거시 임베딩 컬럼 3종 + pending 부분 인덱스 제거.
-- 071 에서 product_embeddings 테이블로 이전 완료 후 잔존한 dead 자산.
--
-- ─── 배경 ────────────────────────────────────────────────────
--   - products.embedding 은 071 백필 이후 갱신되지 않음 (RPC 는 product_embeddings 에만 write).
--     라이브 기준 stale ~71k rows / halfvec(768) ≈ ~109MB dead 데이터.
--   - 런타임 read 전부 product_embeddings 대상 (search_products_v6, products__id, v6-debug).
--   - 유일한 라이브 의존 객체 = idx_products_embedding_pending (이 파일에서 함께 제거).
--
-- ─── ⚠️ 적용 전 필수 (HARD) ──────────────────────────────────
--   임베딩 배치(aws-infra)가 `products.embedding IS NULL` 로 pending 을 판별 중.
--   이 마이그 적용 전, 배치 pending 판별을 product_embeddings anti-join 으로 전환할 것:
--     batch_embed_full.py / embed_batch_devapp.py:
--       FROM products p
--       LEFT JOIN product_embeddings pe ON pe.product_id = p.id
--       WHERE pe.product_id IS NULL AND p.images IS NOT NULL
--   전환 전 적용 시 배치가 "column does not exist" 로 실패함.
--   부수효과: 전환 시 stale sentinel 발(發) ~47k 중복 재임베딩 낭비도 동시 해소.
--
-- Author: DB cleanup (2026-05-22)
-- Requires: 085 적용 완료 + aws-infra 배치 anti-join 전환 완료

BEGIN;

DROP INDEX IF EXISTS idx_products_embedding_pending;

ALTER TABLE products
  DROP COLUMN IF EXISTS embedding,
  DROP COLUMN IF EXISTS embedding_model,
  DROP COLUMN IF EXISTS embedded_at;

COMMIT;

-- ─── 적용 후 검증 (수동) ─────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='products' AND column_name LIKE 'embed%';   -- 0 rows
--   SELECT indexname FROM pg_indexes WHERE indexname='idx_products_embedding_pending'; -- 0 rows
