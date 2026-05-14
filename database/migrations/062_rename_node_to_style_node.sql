-- 062_rename_node_to_style_node.sql
-- brand_nodes 컬럼 rename: node_* → style_node_* + legacy style_node text 제거.
--
-- 동기:
--   "node" 라는 추상 이름이 brand_nodes 안에서 헷갈림.
--   "style_node" 가 명확. 컬럼명 통일 + 옛 enum text 컬럼 cleanup.
--
-- 변경:
--   DROP COLUMN brand_nodes.style_node (legacy 15-code text enum, deprecated since 055)
--   RENAME primary_node_id      → primary_style_node_id
--   RENAME secondary_node_id    → secondary_style_node_id
--   RENAME node_confidence      → style_node_confidence
--   RENAME node_assigned_at     → style_node_assigned_at
--   RENAME node_assigned_model  → style_node_assigned_model
--   RENAME 관련 인덱스 / RPC 재정의 (classify_brand_acquire)
--
-- 영향:
--   - 모든 app + crawler 코드 (옛 컬럼명 SELECT/UPDATE)
--   - classify_brand_acquire RPC return 컬럼명 (route.ts 의 lockRow.primary_node_id 호출)
--
-- Author: SPEC-BRAND-NODE-001 follow-up rename (2026-05-14)
-- Requires: 060 (classify_brand_acquire), 061 (dedup)

BEGIN;

-- ── 1) legacy style_node text 컬럼 제거 ────────────────
-- 055 코멘트 "별도 cleanup PR 에서 제거 예정" → 본 마이그가 그것.
-- 옛 brand_nodes_style_node 관련 인덱스 / check 도 같이 제거.
DROP INDEX IF EXISTS idx_brand_nodes_style_node;
ALTER TABLE brand_nodes DROP COLUMN style_node;

-- ── 2) bigint FK 컬럼 rename ──────────────────────────
ALTER TABLE brand_nodes
  RENAME COLUMN primary_node_id     TO primary_style_node_id;
ALTER TABLE brand_nodes
  RENAME COLUMN secondary_node_id   TO secondary_style_node_id;

-- ── 3) 메타 컬럼 rename ───────────────────────────────
ALTER TABLE brand_nodes
  RENAME COLUMN node_confidence     TO style_node_confidence;
ALTER TABLE brand_nodes
  RENAME COLUMN node_assigned_at    TO style_node_assigned_at;
ALTER TABLE brand_nodes
  RENAME COLUMN node_assigned_model TO style_node_assigned_model;

-- ── 4) CHECK constraint name 갱신 (numeric range) ─────
-- 055 에서 "node_confidence_check" 형태로 자동 생성됨. ALTER TABLE 시 PG 가 자동으로
-- 새 컬럼명 따라 constraint 이름 안 바뀜 — 명시적 rename.
ALTER TABLE brand_nodes
  RENAME CONSTRAINT brand_nodes_node_confidence_check TO brand_nodes_style_node_confidence_check;

-- ── 5) 인덱스 rename ──────────────────────────────────
ALTER INDEX idx_brand_nodes_primary
  RENAME TO idx_brand_nodes_primary_style;
ALTER INDEX idx_brand_nodes_secondary
  RENAME TO idx_brand_nodes_secondary_style;

-- ── 6) classify_brand_acquire RPC 재정의 ──────────────
-- return 컬럼명도 같이 바꿔야 호출처에서 lockRow.primary_style_node_id 접근 가능.
-- CREATE OR REPLACE 는 return type 변경 불가 → DROP 선행.
DROP FUNCTION IF EXISTS classify_brand_acquire(bigint, boolean);

CREATE FUNCTION classify_brand_acquire(p_brand_id bigint, p_force boolean)
RETURNS TABLE (
  id bigint,
  brand_name text,
  primary_style_node_id bigint,
  skip_reason text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_row brand_nodes%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM brand_nodes WHERE brand_nodes.id = p_brand_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT p_force AND v_row.primary_style_node_id IS NOT NULL THEN
    id := v_row.id;
    brand_name := v_row.brand_name;
    primary_style_node_id := v_row.primary_style_node_id;
    skip_reason := 'already_classified';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.style_node_assigned_at IS NOT NULL
     AND v_row.style_node_assigned_at > now() - interval '60 seconds' THEN
    id := v_row.id;
    brand_name := v_row.brand_name;
    primary_style_node_id := v_row.primary_style_node_id;
    skip_reason := 'recently_assigned';
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE brand_nodes
     SET style_node_assigned_at = now()
   WHERE brand_nodes.id = p_brand_id;

  id := v_row.id;
  brand_name := v_row.brand_name;
  primary_style_node_id := v_row.primary_style_node_id;
  skip_reason := NULL;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION classify_brand_acquire IS
  'Atomic lock + read for /api/internal/classify-brand. style_node_assigned_at 가 60s sentinel. (062 rename: node→style_node)';

GRANT EXECUTE ON FUNCTION classify_brand_acquire(bigint, boolean) TO app_user;

-- ── 7) 컬럼 코멘트 재박제 ─────────────────────────────
COMMENT ON COLUMN brand_nodes.primary_style_node_id IS
  'FK style_nodes.id (bigint). brand 의 1차 감도. brand-VLM 가 채움. (062 rename from primary_node_id)';
COMMENT ON COLUMN brand_nodes.secondary_style_node_id IS
  'FK style_nodes.id. 2차 감도. v6 brandScore secondary_match 에 사용. (062 rename from secondary_node_id)';
COMMENT ON COLUMN brand_nodes.style_node_confidence IS
  'VLM confidence 0~1. < 0.7 이면 review_queue. (062 rename from node_confidence)';
COMMENT ON COLUMN brand_nodes.style_node_assigned_at IS
  '60s lock sentinel + 분류 시각. (062 rename from node_assigned_at)';
COMMENT ON COLUMN brand_nodes.style_node_assigned_model IS
  'VLM 모델 ID (gpt-4o-mini 등). (062 rename from node_assigned_model)';

COMMIT;

-- 검증 쿼리:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='brand_nodes'
--       AND column_name LIKE '%style_node%';
--   → primary_style_node_id, secondary_style_node_id, style_node_confidence,
--     style_node_assigned_at, style_node_assigned_model
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='brand_nodes' AND column_name='style_node';
--   → 0 rows (dropped)
