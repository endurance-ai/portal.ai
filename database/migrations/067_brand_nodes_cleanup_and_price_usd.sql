-- 067_brand_nodes_cleanup_and_price_usd.sql
-- brand_nodes 슬림화: 옛 자산 12 컬럼 + price_band drop, price_min_usd/max_usd 신규 + backfill.
--
-- 배경:
--   - sensitivity_tags / brand_keywords — 옛 LLM 출력, SPEC-SEARCH-V6 미사용. user 결정.
--   - 037 BGE-m3 텍스트 임베딩 (embedding/model/hash/at + x_umap/y_umap/at) — stale.
--     brand_multimodal_embeddings (063) 가 대체.
--   - representative_image_urls — products.is_brand_representative 가 source of truth.
--     중복. brand-node-review / brand-nodes 가 products 직접 쿼리하도록 migration.
--   - category_type — "의류" 등 generic. 검색 미사용.
--   - aliases — 거의 비어있고 활용 미정. user 결정.
--   - price_band — "10~30만" 등 한글 비표준. price_min_usd / price_max_usd (numeric) 로 교체.
--
-- 영향:
--   - brand-graph (037 기반 페이지) 통째 깨짐 → 사이드바에서 제거 + 코드 cleanup 같이.
--   - brand_similar 테이블 (037 cosine 기반) 은 잔존. brand_nodes.embedding 의존이지만 FK 는 brand_id 라 별도. 사용처 (admin) 정리 후 별도 PR 로 drop 검토.
--   - clusterFromSensitivity → 옛 sensitivity_tags 의존. drop 시 brand-graph 색상 fallback "uncategorized".
--   - search-products v4 의 brandDna 로드 (line 251) 가 sensitivity_tags 의존. SPEC-SEARCH-V6 가 어차피 대체.
--
-- Author: brand_nodes slim (2026-05-15)
-- Requires: 063 (brand_multimodal_embeddings)

BEGIN;

-- ─── 1) 새 컬럼 ──────────────────────────────────────
ALTER TABLE brand_nodes
  ADD COLUMN IF NOT EXISTS price_min_usd numeric,
  ADD COLUMN IF NOT EXISTS price_max_usd numeric;

COMMENT ON COLUMN brand_nodes.price_min_usd IS
  'USD 환산 최저가. products 기준 자동 채움 OR 어드민 수동 입력. 사용자 향 표시 X (검수 비교용).';
COMMENT ON COLUMN brand_nodes.price_max_usd IS
  'USD 환산 최고가. products 기준 자동 채움 OR 어드민 수동 입력.';

-- ─── 2) Backfill from products (source_price + source_currency → USD) ────
-- 정적 환율 (2026 추정): 1 USD ≈ 1370 KRW / 1.27 USD = 1 GBP / 1.07 USD = 1 EUR / 156 JPY / 7.2 CNY
WITH fx_rates(currency, usd_per) AS (
  VALUES
    ('USD'::text, 1.0::numeric),
    ('KRW', (1.0/1370)::numeric),
    ('GBP', 1.27::numeric),
    ('EUR', 1.07::numeric),
    ('JPY', (1.0/156)::numeric),
    ('CNY', (1.0/7.2)::numeric)
),
product_usd AS (
  SELECT
    p.brand_node_id,
    p.source_price * COALESCE(f.usd_per, (1.0/1370)::numeric) AS price_usd
  FROM products p
  LEFT JOIN fx_rates f ON UPPER(p.source_currency) = f.currency
  WHERE p.brand_node_id IS NOT NULL
    AND p.source_price IS NOT NULL
    AND p.source_price > 0
),
brand_stats AS (
  SELECT brand_node_id,
    MIN(price_usd) AS min_usd,
    MAX(price_usd) AS max_usd
  FROM product_usd
  GROUP BY brand_node_id
)
UPDATE brand_nodes b
SET price_min_usd = ROUND(bs.min_usd::numeric, 2),
    price_max_usd = ROUND(bs.max_usd::numeric, 2)
FROM brand_stats bs
WHERE b.id = bs.brand_node_id;

-- ─── 3) Fallback: products 가 없는 brand → price_band 파싱 ─────
-- 패턴 "X~Y만" / "Y만+" / "~Y만"
-- 단위: 만원 (10000 KRW) → USD: × 10000 / 1370
UPDATE brand_nodes
SET
  price_min_usd = ROUND(
    (regexp_replace(split_part(price_band, '~', 1), '[^0-9]', '', 'g'))::numeric
      * 10000.0 / 1370.0, 2),
  price_max_usd = ROUND(
    (regexp_replace(split_part(price_band, '~', 2), '[^0-9]', '', 'g'))::numeric
      * 10000.0 / 1370.0, 2)
WHERE price_min_usd IS NULL
  AND price_band IS NOT NULL
  AND price_band ~ '^[0-9]+만~[0-9]+만$';

-- "Y만+" → min 만 채움
UPDATE brand_nodes
SET price_min_usd = ROUND(
  (regexp_replace(price_band, '[^0-9]', '', 'g'))::numeric
    * 10000.0 / 1370.0, 2)
WHERE price_min_usd IS NULL
  AND price_band ~ '^[0-9]+만\+$';

-- "~Y만" → max 만 채움
UPDATE brand_nodes
SET price_max_usd = ROUND(
  (regexp_replace(price_band, '[^0-9]', '', 'g'))::numeric
    * 10000.0 / 1370.0, 2)
WHERE price_max_usd IS NULL
  AND price_band ~ '^~[0-9]+만$';

-- ─── 4) DROP 옛 컬럼 12종 + price_band ────────────────
-- 인덱스 (idx_brand_nodes_aliases / keywords / category_type / embedding_hnsw /
--   embedding_pending) 은 컬럼 drop 시 자동 cascade.
ALTER TABLE brand_nodes
  DROP COLUMN IF EXISTS representative_image_urls,
  DROP COLUMN IF EXISTS category_type,
  DROP COLUMN IF EXISTS aliases,
  DROP COLUMN IF EXISTS sensitivity_tags,
  DROP COLUMN IF EXISTS brand_keywords,
  DROP COLUMN IF EXISTS embedding,
  DROP COLUMN IF EXISTS embedding_model,
  DROP COLUMN IF EXISTS embedding_text_hash,
  DROP COLUMN IF EXISTS embedded_at,
  DROP COLUMN IF EXISTS x_umap,
  DROP COLUMN IF EXISTS y_umap,
  DROP COLUMN IF EXISTS umap_at,
  DROP COLUMN IF EXISTS price_band;

COMMIT;
