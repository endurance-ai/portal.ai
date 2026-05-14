-- 057_products_brand_node_fk.sql
-- products.brand_node_id bigint NULL FK → brand_nodes(id).
-- products.brand text 컬럼은 raw 표기 보존 (검색·디버깅·legacy join).
-- brand_node_id 는 정규화 매핑 결과를 박는 정식 FK.
--
-- Backfill 전략:
--   1) lower(products.brand) = lower(brand_nodes.brand_name_normalized) — 정확 매칭
--   2) lower(products.brand) = lower(brand_nodes.brand_name)            — fallback (raw)
--   3) 매칭 실패 row 는 NULL 유지. crawler 런타임에서 fuzzy match + review queue 처리.
--
-- 본 마이그레이션은 pg_trgm 휴리스틱을 호출하지 않는다 (운영 안정성).
-- 신규 브랜드 자동 INSERT + alias_candidate review queue 는 crawler 의 책임.
--
-- 영향:
--   products ~33k row 중 brand_nodes 매칭 가능한 row 만 brand_node_id 채워짐.
--   미매칭 row 는 NULL → crawler 다음 import 사이클에서 자동 채움.
--
-- Author: SPEC-BRAND-NODE-001 PR-Y (2026-05-14, crawler 세션)
-- Requires: 056 (brand_nodes.id bigint)

BEGIN;

-- ── 1) brand_node_id 컬럼 추가 ──────────────────────────────
ALTER TABLE products
  ADD COLUMN brand_node_id bigint
    REFERENCES brand_nodes(id) ON DELETE SET NULL;

COMMENT ON COLUMN products.brand_node_id IS
  'FK brand_nodes.id (bigint). crawler import 시 brand_name_normalized 매칭으로 채움. 미매칭 시 NULL — alias_candidate review_queue 로 분기. products.brand text 는 raw 표기 보존용으로 유지.';

-- ── 2) 정확 매칭 backfill (brand_name_normalized) ───────────
UPDATE products p
   SET brand_node_id = bn.id
  FROM brand_nodes bn
 WHERE p.brand_node_id IS NULL
   AND p.brand IS NOT NULL
   AND lower(p.brand) = lower(bn.brand_name_normalized);

-- ── 3) Fallback 매칭 (brand_name raw) ───────────────────────
UPDATE products p
   SET brand_node_id = bn.id
  FROM brand_nodes bn
 WHERE p.brand_node_id IS NULL
   AND p.brand IS NOT NULL
   AND lower(p.brand) = lower(bn.brand_name);

-- ── 4) Backfill 통계 (RAISE NOTICE 로 마이그 로그에 박제) ───
DO $$
DECLARE
  v_total    bigint;
  v_matched  bigint;
  v_null     bigint;
BEGIN
  SELECT COUNT(*) INTO v_total   FROM products;
  SELECT COUNT(*) INTO v_matched FROM products WHERE brand_node_id IS NOT NULL;
  v_null := v_total - v_matched;

  RAISE NOTICE '057 backfill — total=%, matched=%, null=% (% pct matched)',
    v_total, v_matched, v_null,
    CASE WHEN v_total = 0 THEN 0
         ELSE round(100.0 * v_matched / v_total, 2)
    END;
END $$;

-- ── 5) 인덱스 ────────────────────────────────────────────────
-- 검색·관리 쿼리에서 brand_node_id 로 좁히는 경우가 다수 예상 (admin / VLM 큐).
-- partial NOT NULL 로 sparse 매칭 비용 절감.
CREATE INDEX idx_products_brand_node_id
  ON products(brand_node_id)
  WHERE brand_node_id IS NOT NULL;

COMMIT;

-- 검증 쿼리 (수동):
--   SELECT COUNT(*) FILTER (WHERE brand_node_id IS NOT NULL) AS matched,
--          COUNT(*) FILTER (WHERE brand_node_id IS NULL)     AS pending,
--          COUNT(*) AS total
--     FROM products;
--   SELECT bn.brand_name, COUNT(p.id)
--     FROM brand_nodes bn
--     LEFT JOIN products p ON p.brand_node_id = bn.id
--    GROUP BY bn.brand_name
--    ORDER BY COUNT(p.id) DESC
--    LIMIT 20;
