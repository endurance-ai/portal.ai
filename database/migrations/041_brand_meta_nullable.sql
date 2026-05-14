-- 041: Relax NOT NULL on brand_nodes meta columns.
--
-- Background: register_unmatched_brands.ts auto-registers ~840 new brands
-- discovered in products.brand but not yet in brand_nodes. Per HANDOFF
-- decision #6 (2026-05-07), meta fields (style_node, sensitivity_tags,
-- brand_keywords, gender_scope) are populated by the autonomous loop —
-- not at registration time. NULL = "not yet classified".
--
-- The original schema (migrations 002-005) seeded brand_nodes fully
-- and required all meta columns NOT NULL. With auto-registration as
-- the new ingest path, NULL is the semantically correct sentinel for
-- "awaiting classification".

ALTER TABLE brand_nodes
  ALTER COLUMN style_node DROP NOT NULL,
  ALTER COLUMN sensitivity_tags DROP NOT NULL,
  ALTER COLUMN brand_keywords DROP NOT NULL,
  ALTER COLUMN gender_scope DROP NOT NULL;

COMMENT ON COLUMN brand_nodes.style_node IS
  'Style node classification. NULL = awaiting autonomous-loop classification.';
COMMENT ON COLUMN brand_nodes.sensitivity_tags IS
  'Brand sensitivity tags. NULL = awaiting autonomous-loop classification.';
COMMENT ON COLUMN brand_nodes.brand_keywords IS
  'Brand keywords. NULL = awaiting autonomous-loop classification.';
COMMENT ON COLUMN brand_nodes.gender_scope IS
  'Brand gender scope. NULL = awaiting autonomous-loop classification.';
