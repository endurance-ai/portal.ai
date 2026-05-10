-- 038: brand_similar — brand-to-brand similarity graph
-- (top-K nearest-neighbor edges, computed from brand_nodes.embedding).
--
-- Background: Enables "similar brand" recommendation surfaces, brand
-- diversity caps in search results, and a future 11th dimension in
-- the brandDna weighted sum. Computed daily from brand_nodes.embedding
-- (migration 037) — graph rebuild is idempotent (truncate-and-
-- repopulate per source brand_id), so no history retained here.
-- For history, snapshot via a downstream report.
--
-- Cardinality: ~1,000 source brands × top-20 ≈ 20,000 rows. Orphan
-- nodes (no products in the catalog) are skipped at write time by the
-- builder script — they remain candidates as similar_brand_id but
-- never appear as a source brand_id.

CREATE TABLE IF NOT EXISTS brand_similar (
  brand_id uuid NOT NULL REFERENCES brand_nodes(id) ON DELETE CASCADE,
  similar_brand_id uuid NOT NULL REFERENCES brand_nodes(id) ON DELETE CASCADE,
  similarity numeric(5,4) NOT NULL CHECK (similarity BETWEEN 0 AND 1),
  rank smallint NOT NULL CHECK (rank BETWEEN 1 AND 100),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, similar_brand_id),
  CHECK (brand_id != similar_brand_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_similar_lookup
  ON brand_similar (brand_id, rank);

-- Reverse lookup: "which brands consider X among their top-K?"
-- Useful for two-way diversity caps and rebuild diff diagnostics.
CREATE INDEX IF NOT EXISTS idx_brand_similar_reverse
  ON brand_similar (similar_brand_id);

COMMENT ON TABLE brand_similar IS
  'Top-K nearest-neighbor brand graph computed from brand_nodes.embedding (037). Rebuilt daily.';
COMMENT ON COLUMN brand_similar.similarity IS
  'cosine in [0, 1] — L2-normalized inner product clamped to non-negative.';
COMMENT ON COLUMN brand_similar.rank IS
  '1 = most similar (per brand_id partition).';
