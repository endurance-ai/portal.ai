-- 060_classify_brand_lock_helper.sql
-- /api/internal/classify-brand 의 race-free 진입 가드 + review_queue upsert helper.
-- SPEC-BRAND-NODE-001 review fix.
--
-- Author: SPEC-BRAND-NODE-001 P3' review fix (2026-05-14)

BEGIN;

-- ── classify_brand_acquire(brand_id, force) ─────────────────
-- conditional UPDATE 패턴으로 race-free lock 획득.
-- - force=true 이면 무조건 잡음
-- - force=false 이면 (primary_node_id IS NULL) AND (assigned 60초 경과) 만 잡음
-- RETURNING — 0 row 면 skip, 1 row 면 처리.
CREATE OR REPLACE FUNCTION classify_brand_acquire(p_brand_id bigint, p_force boolean)
RETURNS TABLE (
  id bigint,
  brand_name text,
  primary_node_id bigint,
  skip_reason text          -- NULL = 진행, 값 있으면 skip 이유
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_row brand_nodes%ROWTYPE;
BEGIN
  -- 1) row lock + read
  SELECT * INTO v_row FROM brand_nodes WHERE brand_nodes.id = p_brand_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;   -- 빈 결과 → 404
  END IF;

  -- 2) skip 조건 체크
  IF NOT p_force AND v_row.primary_node_id IS NOT NULL THEN
    id := v_row.id;
    brand_name := v_row.brand_name;
    primary_node_id := v_row.primary_node_id;
    skip_reason := 'already_classified';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.node_assigned_at IS NOT NULL
     AND v_row.node_assigned_at > now() - interval '60 seconds' THEN
    id := v_row.id;
    brand_name := v_row.brand_name;
    primary_node_id := v_row.primary_node_id;
    skip_reason := 'recently_assigned';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 3) lock 획득 — node_assigned_at 을 sentinel 로 박음 (60초 mutex)
  UPDATE brand_nodes
     SET node_assigned_at = now()
   WHERE brand_nodes.id = p_brand_id;

  id := v_row.id;
  brand_name := v_row.brand_name;
  primary_node_id := v_row.primary_node_id;
  skip_reason := NULL;       -- NULL = 진행
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION classify_brand_acquire IS
  'Atomic lock + read for /api/internal/classify-brand. SELECT FOR UPDATE + conditional sentinel write. skip_reason NULL = 진행, 값 있으면 skip.';

GRANT EXECUTE ON FUNCTION classify_brand_acquire(bigint, boolean) TO app_user;

-- ── enqueue_brand_review(brand_id, reason, vlm_output) ──────
-- partial unique index on (brand_id) WHERE resolved_at IS NULL 를 활용한 atomic upsert.
-- 기존 open row 있으면 UPDATE, 없으면 INSERT.
CREATE OR REPLACE FUNCTION enqueue_brand_review(
  p_brand_id bigint,
  p_reason text,
  p_vlm_output jsonb
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_id bigint;
BEGIN
  -- 1) open row 가 있는지 확인 + lock
  SELECT id INTO v_id
    FROM brand_node_review_queue
   WHERE brand_id = p_brand_id AND resolved_at IS NULL
   FOR UPDATE;

  IF FOUND THEN
    UPDATE brand_node_review_queue
       SET reason = p_reason,
           vlm_output = p_vlm_output
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO brand_node_review_queue (brand_id, reason, vlm_output)
  VALUES (p_brand_id, p_reason, p_vlm_output)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION enqueue_brand_review IS
  'Race-free upsert into brand_node_review_queue. Same brand 의 open row 1개 보장 (partial unique index 와 함께).';

GRANT EXECUTE ON FUNCTION enqueue_brand_review(bigint, text, jsonb) TO app_user;

COMMIT;
