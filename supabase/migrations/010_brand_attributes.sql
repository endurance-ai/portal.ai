-- brand_nodes에 attributes JSONB 컬럼 추가

ALTER TABLE brand_nodes
  ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}';

COMMENT ON COLUMN brand_nodes.attributes IS 'Brand attributes: {silhouette: [], palette: [], material: [], detail: [], vibe: []}';

CREATE INDEX IF NOT EXISTS idx_brand_nodes_attributes
  ON brand_nodes USING gin (attributes);
