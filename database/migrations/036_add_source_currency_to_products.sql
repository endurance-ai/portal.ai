-- 036: Add source currency and price for global pricing display.
--
-- Background: ZARA US, Uniqlo US, etc. report USD natively. The
-- crawler's import pipeline (crawler/src/import-products.ts) converts
-- the source price to KRW via FX_TO_KRW (currently hardcoded
-- USD = 1430) and writes the converted value to `price`. Before this
-- migration the original (pre-conversion) price + currency were
-- discarded, so the admin UI could only show KRW for every platform
-- regardless of the underlying market.
--
-- This migration preserves the original currency + price as-is.
-- Display layers prefer source_currency/source_price when available
-- and fall back to KRW (`price`).
--
-- Backfill policy: existing rows are not retroactively populated.
-- NULL means "legacy KRW-only import" — display layers fall back to
-- the converted KRW `price`. New imports always populate both.
--
-- SPEC: SPEC-PLATFORM-EXPANSION-005 amendment (post-Run-phase finding,
--       2026-05-06). Schema migration was originally out-of-scope per
--       SPEC-005 §Non-Goals, lifted by user decision 2026-05-06.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS source_currency TEXT,
  ADD COLUMN IF NOT EXISTS source_price NUMERIC(12, 2);

COMMENT ON COLUMN products.source_currency IS
  'Original currency code from crawl source (USD/EUR/GBP/KRW). NULL = legacy KRW-only row imported before 2026-05-06.';

COMMENT ON COLUMN products.source_price IS
  'Original price in source_currency before FX conversion. KRW-source rows store the same numeric value as price; non-KRW rows store the native decimal (e.g. USD 99.90).';

-- Optional partial index — query patterns that filter by non-KRW source
-- (e.g. "show all USD products") become index-only scans.
CREATE INDEX IF NOT EXISTS idx_products_source_currency
  ON products (source_currency)
  WHERE source_currency IS NOT NULL AND source_currency <> 'KRW';
