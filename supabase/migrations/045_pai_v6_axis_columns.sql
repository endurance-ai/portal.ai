-- 045_pai_v6_axis_columns.sql
-- PAI 에 v6 axis 8개 컬럼 추가 — Vision AI 가 이미 출력하지만 raw_response.parsed 에만
-- 박혀있던 것을 named column 으로 승격. 검색 RPC 가 인덱스 활용 가능.
--
-- Author: pai-sync-backfill session (2026-05-12)
-- Related: scripts/local/pai_backfill/prompt.txt v2 (8 axis 출력)
-- 검증: kikoai dev-app PG, 기존 PAI 컬럼 패턴과 동일 (free text, check 제약 없음)

-- ── 컬럼 추가 ────────────────────────────────────────────────
ALTER TABLE product_ai_analysis
  ADD COLUMN IF NOT EXISTS neckline   text,
  ADD COLUMN IF NOT EXISTS sleeve     text,
  ADD COLUMN IF NOT EXISTS length     text,
  ADD COLUMN IF NOT EXISTS closure    text,
  ADD COLUMN IF NOT EXISTS texture    text,
  ADD COLUMN IF NOT EXISTS decoration text,
  ADD COLUMN IF NOT EXISTS silhouette text,
  ADD COLUMN IF NOT EXISTS formality  text;

-- ── 인덱스 — 검색 RPC 활용 위한 (version, X) 복합 btree ──
-- 기존 idx_pai_{category, fit, fabric, ...} 와 동일 패턴
CREATE INDEX IF NOT EXISTS idx_pai_neckline   ON product_ai_analysis (version, neckline);
CREATE INDEX IF NOT EXISTS idx_pai_sleeve     ON product_ai_analysis (version, sleeve);
CREATE INDEX IF NOT EXISTS idx_pai_length     ON product_ai_analysis (version, length);
CREATE INDEX IF NOT EXISTS idx_pai_closure    ON product_ai_analysis (version, closure);
CREATE INDEX IF NOT EXISTS idx_pai_texture    ON product_ai_analysis (version, texture);
CREATE INDEX IF NOT EXISTS idx_pai_decoration ON product_ai_analysis (version, decoration);
CREATE INDEX IF NOT EXISTS idx_pai_silhouette ON product_ai_analysis (version, silhouette);
CREATE INDEX IF NOT EXISTS idx_pai_formality  ON product_ai_analysis (version, formality);

-- ── COMMENT — 컬럼 의미 박제 ─────────────────────────────────
COMMENT ON COLUMN product_ai_analysis.neckline   IS 'v6 axis: round/v-neck/turtle/mock-neck/square/halter/off-shoulder/boat/henley/crew/scoop/polo/hood/collar/n/a';
COMMENT ON COLUMN product_ai_analysis.sleeve     IS 'v6 axis: sleeveless/short/long/three-quarter/balloon/puff/bishop/cape/raglan/dropped/n/a';
COMMENT ON COLUMN product_ai_analysis.length     IS 'v6 axis: cropped/regular/long/maxi/midi/mini/n/a';
COMMENT ON COLUMN product_ai_analysis.closure    IS 'v6 axis: button/zipper/belt/tie/elastic/hook/snap/drawstring/none/n/a';
COMMENT ON COLUMN product_ai_analysis.texture    IS 'v6 axis: matte/glossy/pearl/velvet/metallic/washed-denim/smooth/distressed/ribbed/brushed/n/a';
COMMENT ON COLUMN product_ai_analysis.decoration IS 'v6 axis: embroidery/print/patch/ribbon/chain/beads/fringe/sequin/studs/lace/none/n/a';
COMMENT ON COLUMN product_ai_analysis.silhouette IS 'v6 axis: boxy/slim/a-line/h-line/balloon/cocoon/mermaid/drape/straight/fitted/n/a';
COMMENT ON COLUMN product_ai_analysis.formality  IS 'v6 axis: casual/smart-casual/semi-formal/formal/beach/loungewear/athletic/workwear';
