-- 039: brand_attribute_proposals — autonomous-loop review queue
-- for proposed updates to brand_nodes.attributes.{vibe,palette,...}.
--
-- Background: As of 2026-05-07, brand_nodes attribute coverage is
-- skewed — silhouette 81.7%, detail 74.7% are healthy, but
-- palette 36.9%, material 30.4%, vibe 14.1% are sparse. An LLM-driven
-- daily routine proposes attribute additions; high-confidence
-- proposals (>= 0.85) auto-apply, lower-confidence enter a human
-- review queue.
--
-- Status machine:
--   pending      → LLM proposed, awaiting review or auto-merge cutoff
--   approved     → human approved; application is downstream
--   auto_applied → confidence >= threshold, applied without review
--   rejected     → human rejected; kept for anti-pattern detection
--
-- Idempotency: legitimate re-proposals after policy/prompt changes are
-- allowed, so no UNIQUE constraint here. Application-level dedup (e.g.,
-- skip if a (brand, field) has a non-rejected row within N days) is
-- left to the builder script.

CREATE TABLE IF NOT EXISTS brand_attribute_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brand_nodes(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('vibe','palette','material','detail','silhouette')),
  proposed_values text[] NOT NULL CHECK (array_length(proposed_values, 1) >= 1),
  confidence numeric(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source text NOT NULL,
  reasoning text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','auto_applied')),
  applied_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Pending queue lookup (admin UI consumes this).
CREATE INDEX IF NOT EXISTS idx_brand_attr_pending
  ON brand_attribute_proposals (confidence DESC, created_at DESC)
  WHERE status = 'pending';

-- Per-brand history lookup (dedup + audit).
CREATE INDEX IF NOT EXISTS idx_brand_attr_brand
  ON brand_attribute_proposals (brand_id, field, created_at DESC);

-- RLS: admin-only access (mirrors 033 eval_* admin-gating).
ALTER TABLE brand_attribute_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin only access" ON brand_attribute_proposals;
CREATE POLICY "admin only access"
ON brand_attribute_proposals FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE user_id = auth.uid() AND status = 'approved'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE user_id = auth.uid() AND status = 'approved'
  )
);

COMMENT ON TABLE brand_attribute_proposals IS
  'Autonomous-loop attribute proposals (vibe/palette/material/detail/silhouette). Admin-only.';
COMMENT ON COLUMN brand_attribute_proposals.confidence IS
  'Auto-merge threshold: >= 0.85 enters status=auto_applied without human review.';
