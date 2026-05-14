-- 061_dedup_brand_nodes.sql
-- brand_nodes 중복 row 정리 + 정규화 통일 + case-insensitive UNIQUE 추가.
--
-- 배경:
--   엑셀 import 가 brand_name_normalized 에 .toLowerCase() 안 했고,
--   기존 UNIQUE 제약이 case-sensitive 라서 "Lanvin" / "lanvin" 같은
--   case 차이만 있는 중복 row 28그룹 (56 rows) 박혀 있었음.
--   분류 결과 같은 brand 가 2개 ID 로 갈라져 검색·VLM 매핑 혼란.
--
-- 전략:
--   1) 각 그룹에서 product 보유 수 큰 ID 를 canonical 로 선정.
--   2) products / brand_similar / brand_attribute_proposals /
--      brand_node_review_queue 의 FK 를 canonical 로 이관.
--      brand_similar 는 PK 중복 가능 → 중복 row 삭제 (재계산 가능).
--   3) duplicate brand_nodes row 삭제.
--   4) canonical 의 brand_name_normalized 를 lower 로 통일.
--   5) UNIQUE INDEX on lower(brand_name_normalized) 추가 (재발 방지).
--
-- 영향:
--   - brand_nodes: 2,100 → 2,072 (28 row 삭제)
--   - products: 일부 brand_node_id 가 canonical 로 이관
--   - brand_similar: dup brand 의 similar row 삭제 (재계산으로 복구)
--
-- Author: SPEC-BRAND-NODE-001 review fix (2026-05-14, crawler 세션)

BEGIN;

-- ── 1) 중복 그룹 분석 + canonical 선정 ───────────────
CREATE TEMP TABLE dedup_plan AS
WITH dup AS (
  SELECT lower(brand_name_normalized) AS k
    FROM brand_nodes
   WHERE brand_name_normalized IS NOT NULL
   GROUP BY 1
  HAVING COUNT(*) > 1
),
ranked AS (
  SELECT bn.id, dup.k,
         ROW_NUMBER() OVER (
           PARTITION BY dup.k
           ORDER BY (SELECT COUNT(*) FROM products p WHERE p.brand_node_id = bn.id) DESC,
                    bn.id ASC
         ) AS rnk
    FROM brand_nodes bn
    JOIN dup ON dup.k = lower(bn.brand_name_normalized)
)
SELECT k,
       MAX(CASE WHEN rnk = 1 THEN id END) AS canonical_id,
       array_agg(id) FILTER (WHERE rnk > 1) AS duplicate_ids
  FROM ranked
 GROUP BY k;

-- 검증: 그룹 수 일치 확인
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM dedup_plan;
  RAISE NOTICE '061 dedup — % duplicate groups detected', v_count;
  IF v_count = 0 THEN
    RAISE NOTICE '061 dedup — 중복 없음, 마이그레이션 skip';
    RETURN;
  END IF;
END $$;

-- ── 2) products 재매핑 (duplicate_ids → canonical_id) ─
UPDATE products p
   SET brand_node_id = dp.canonical_id
  FROM dedup_plan dp
 WHERE p.brand_node_id = ANY(dp.duplicate_ids);

-- ── 3) brand_similar 충돌 회피 위해 dup row 삭제 ─────
-- (재계산 가능한 비저장 데이터, CASCADE 로 처리해도 됨)
DELETE FROM brand_similar bs
 USING dedup_plan dp
 WHERE bs.brand_id = ANY(dp.duplicate_ids)
    OR bs.similar_brand_id = ANY(dp.duplicate_ids);

-- ── 4) brand_attribute_proposals 이관 ────────────────
UPDATE brand_attribute_proposals bap
   SET brand_id = dp.canonical_id
  FROM dedup_plan dp
 WHERE bap.brand_id = ANY(dp.duplicate_ids);

-- ── 5) brand_node_review_queue 이관 ──────────────────
-- partial unique (brand_id) WHERE resolved_at IS NULL 충돌 가능 → resolved 처리
UPDATE brand_node_review_queue
   SET resolved_at = now(),
       resolved_by = 'dedup-061',
       admin_note  = 'auto-resolved during brand_nodes dedup'
 WHERE brand_id IN (SELECT unnest(duplicate_ids) FROM dedup_plan)
   AND resolved_at IS NULL;

UPDATE brand_node_review_queue rq
   SET brand_id = dp.canonical_id
  FROM dedup_plan dp
 WHERE rq.brand_id = ANY(dp.duplicate_ids);

-- ── 6) duplicate brand_nodes 삭제 ────────────────────
DELETE FROM brand_nodes bn
 USING dedup_plan dp
 WHERE bn.id = ANY(dp.duplicate_ids);

-- ── 7) canonical 정규화 통일 (lower) ─────────────────
-- 이제 그룹당 1개 row 만 남아있으니 lower 적용 시 충돌 없음.
UPDATE brand_nodes
   SET brand_name_normalized = lower(brand_name_normalized)
 WHERE brand_name_normalized IS NOT NULL
   AND brand_name_normalized <> lower(brand_name_normalized);

-- ── 8) case-insensitive UNIQUE 추가 (재발 방지) ──────
CREATE UNIQUE INDEX idx_brand_nodes_normalized_ci
  ON brand_nodes(lower(brand_name_normalized))
  WHERE brand_name_normalized IS NOT NULL;

COMMENT ON INDEX idx_brand_nodes_normalized_ci IS
  'Case-insensitive uniqueness on brand_name_normalized. 옛 case-sensitive UNIQUE 가 case 차이로 중복 허용한 문제 (061) 재발 방지.';

-- ── 9) 최종 통계 ─────────────────────────────────────
DO $$
DECLARE
  v_total integer;
  v_lower_done integer;
BEGIN
  SELECT COUNT(*) INTO v_total FROM brand_nodes;
  SELECT COUNT(*) INTO v_lower_done
    FROM brand_nodes
   WHERE brand_name_normalized IS NOT NULL
     AND brand_name_normalized = lower(brand_name_normalized);
  RAISE NOTICE '061 dedup — brand_nodes total=% (lower-normalized=%)', v_total, v_lower_done;
END $$;

COMMIT;

-- 검증 쿼리 (수동):
--   SELECT lower(brand_name_normalized), COUNT(*)
--     FROM brand_nodes WHERE brand_name_normalized IS NOT NULL
--    GROUP BY 1 HAVING COUNT(*) > 1;  -- 0 rows expected
