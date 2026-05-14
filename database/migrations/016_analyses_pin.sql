-- Add is_pinned to analyses for card-level pinning (eval page)
ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_analyses_pinned
  ON analyses (is_pinned) WHERE is_pinned = TRUE;
