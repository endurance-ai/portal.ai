-- 037: Brand text-pool embeddings (BGE-m3, 1024-dim, L2-normalized).
--
-- Background: 1,000 brand_nodes have rich metadata (brand_keywords,
-- style_node, sensitivity_tags, attributes.silhouette/palette/vibe/...)
-- but no representation suitable for brand-to-brand similarity.
-- Current search engine (api/search-products line 712-727) consumes
-- only style_node + sensitivity_tags for the brandDna term in the 10D
-- weighted sum. Brand-graph features ("similar brand" recommendation,
-- brand diversity in result page, an 11th dimension in brandDna)
-- require a learned vector representation.
--
-- Design: Mirrors products embedding pattern (migration 027). A text
-- pool is composed from brand_nodes columns and encoded with BGE-m3
-- (multilingual, KO/EN strong). Vectors are L2-normalized so
-- vector_ip_ops HNSW yields cosine top-K efficiently. text_hash gives
-- idempotency: subsequent runs skip rows whose canonical text-pool is
-- unchanged.
--
-- Backfill: portal/ai/scripts/embed_brands_text.py. Existing rows
-- with NULL embedding are encoded on first run; the partial index
-- (idx_brand_nodes_embedding_pending) keeps subsequent batch lookups
-- O(remaining) instead of O(total).

ALTER TABLE brand_nodes
  ADD COLUMN IF NOT EXISTS embedding vector(1024),
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS embedding_text_hash text,
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

COMMENT ON COLUMN brand_nodes.embedding IS
  'L2-normalized text-pool embedding (BGE-m3, 1024-dim). Cosine via vector_ip_ops.';
COMMENT ON COLUMN brand_nodes.embedding_model IS
  'Model identifier, e.g. ''BAAI/bge-m3''.';
COMMENT ON COLUMN brand_nodes.embedding_text_hash IS
  'sha256 hex of canonical text-pool used for embedding. Idempotency key.';
COMMENT ON COLUMN brand_nodes.embedded_at IS
  'When this embedding was computed.';

-- HNSW index for fast cosine top-K
-- (matches 027 pattern: vector_ip_ops on L2-normalized vectors).
CREATE INDEX IF NOT EXISTS idx_brand_nodes_embedding_hnsw
  ON brand_nodes USING hnsw (embedding vector_ip_ops)
  WITH (m = 16, ef_construction = 200);

-- Partial index for unembedded brands (batch script optimization).
CREATE INDEX IF NOT EXISTS idx_brand_nodes_embedding_pending
  ON brand_nodes (id)
  WHERE embedding IS NULL;
