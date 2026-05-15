-- 063_brand_multimodal_embeddings.sql
-- SPEC-BRAND-EMBED-001: brand 의 시각 + 텍스트 신호를 단일 768-dim 벡터로 통합 저장.
--
-- 모델:
--   Marqo/marqo-fashionSigLIP — SigLIP 계열 패션 fine-tune.
--   image encoder × 최대 5장 (representative_image_urls, 실제 1~5) + text encoder × N chunks
--   (anchor, brand_keywords, vibe+silhouette, palette+material+detail)
--   → L2-normalize 된 vector 들의 평균 → 최종 L2-normalize.
--
--   v5 product 임베딩 (027) 과 같은 모델/공간이라 product ↔ brand,
--   user-image ↔ brand cosine 비교가 같은 인덱스에서 동작.
--
-- 037 brand_nodes.embedding (BGE-m3 1024-dim 텍스트) 와는 별개:
--   037 은 옛 15-code style_node 풀 기반 + 활용 0건 → SPEC 5 search v6 에서
--   재임베딩 또는 폐기 예정. 본 마이그는 그것을 건드리지 않음.
--
-- 저장 결정 (1:1 인데 별도 테이블):
--   - 재계산이 잦음 (representative_image_urls 변경 시) → 메타 row 와 분리
--   - multi-strategy (mean_of_5 / representative_only / multi-line) 확장 여지
--   - brand_nodes wide table 회피
--
-- Author: SPEC-BRAND-EMBED-001 P2 (2026-05-14)
-- Requires: 055 (representative_image_urls), 062 (primary_style_node_id rename), pgvector >= 0.7 (halfvec)

BEGIN;

CREATE TABLE IF NOT EXISTS brand_multimodal_embeddings (
  brand_id            bigint PRIMARY KEY REFERENCES brand_nodes(id) ON DELETE CASCADE,
  vector              halfvec(768) NOT NULL,
  embedding_model     text NOT NULL,
  strategy            text NOT NULL DEFAULT 'mean_image5_text_chunks',
  source_image_count  integer NOT NULL CHECK (source_image_count >= 0),
  source_text_hash    text,
  source_image_hash   text,
  embedded_at         timestamptz NOT NULL DEFAULT now()
);

-- HNSW for cosine top-K via halfvec_ip_ops (vector is L2-normalized
-- so inner product == cosine similarity). 027/037 패턴 동일.
CREATE INDEX IF NOT EXISTS idx_brand_multimodal_emb_hnsw
  ON brand_multimodal_embeddings
  USING hnsw (vector halfvec_ip_ops)
  WITH (m = 16, ef_construction = 200);

COMMENT ON TABLE brand_multimodal_embeddings IS
  'Single multimodal (image+text) brand vector in FashionSigLIP space. '
  'Used for similar-brand recommendation, node centroid (064), '
  'adjacency derivation, and vision-to-brand NN. See SPEC-BRAND-EMBED-001.';

COMMENT ON COLUMN brand_multimodal_embeddings.vector IS
  'L2-normalized halfvec(768). Cosine ≡ inner product via halfvec_ip_ops.';

COMMENT ON COLUMN brand_multimodal_embeddings.embedding_model IS
  'Model identifier, e.g. ''Marqo/marqo-fashionSigLIP''.';

COMMENT ON COLUMN brand_multimodal_embeddings.strategy IS
  'Mixing strategy. Default: mean of 5 image vectors + N text chunk vectors.';

COMMENT ON COLUMN brand_multimodal_embeddings.source_image_count IS
  'Number of representative images actually encoded (0~5: brand may have 1~5 urls; download may fail).';

COMMENT ON COLUMN brand_multimodal_embeddings.source_text_hash IS
  'sha256 of canonical text-pool input. Used for idempotent re-embedding skip.';

COMMENT ON COLUMN brand_multimodal_embeddings.source_image_hash IS
  'sha256 of sorted representative_image_urls. Used together with text hash.';

COMMIT;
