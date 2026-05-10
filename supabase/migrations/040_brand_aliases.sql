-- 040: brand_nodes.aliases — sub-brand alias merging.
--
-- Background: products.brand 표기와 brand_nodes 표기가 자주 어긋남.
-- 발견된 패턴 (2026-05-07 진단):
--   - 메가 브랜드 미등록  (ZARA, Uniqlo, Drake's, Kith, adidas, Vans, Prada …)
--   - sub-brand vs parent (adidas ↔ adidas Originals, Jordan ↔ Nike Jordan,
--                          Valentino ↔ Valentino Garavani, McQueen ↔ Alexander McQueen)
--   - 악센트 (Aimé Leon Dore, Yvonne Léon)  ← 정규화 함수 강화로 해결
--
-- 해결:
--   - 메가 브랜드: scripts/register_unmatched_brands.ts 가 신규 row 자동 생성
--   - sub-brand: 사람 검수 후 aliases 에 별칭 추가 → resolve-brands 가 매칭에 사용
--
-- aliases 형태: text[] (소문자, 정규화 전 raw 표기 유지). 정규화는 lookup 시점에 일괄 적용.

ALTER TABLE brand_nodes
  ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT '{}';

COMMENT ON COLUMN brand_nodes.aliases IS
  'Alternate raw brand-name labels seen in products. Matched via app-side normalization (NFKD-aware).';

-- GIN 인덱스 — aliases 배열에서 fast lookup
CREATE INDEX IF NOT EXISTS idx_brand_nodes_aliases
  ON brand_nodes USING gin (aliases);
