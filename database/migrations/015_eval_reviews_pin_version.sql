-- Add pinning and version tracking to eval_reviews
ALTER TABLE eval_reviews
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prompt_version TEXT;

-- Index for pinned reviews (fast lookup)
CREATE INDEX IF NOT EXISTS idx_eval_reviews_pinned
  ON eval_reviews (is_pinned) WHERE is_pinned = TRUE;
