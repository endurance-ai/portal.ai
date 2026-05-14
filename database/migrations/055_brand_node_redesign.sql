-- 055_brand_node_redesign.sql
-- SPEC-BRAND-NODE-001: brand_nodes 에 새 노드 매핑 컬럼 추가 + admin review queue 신설.
-- 옛 brand_nodes.style_node (text, 옛 15 코드) 컬럼은 이 PR 에서 유지.
-- SPEC 3 매핑 끝난 후 별도 cleanup PR 에서 제거 예정.
--
-- Author: SPEC-BRAND-NODE-001 P2a (2026-05-14)
-- Requires: 049 (style_nodes), 050 (seed)

BEGIN;

-- ── brand_nodes 컬럼 추가 ───────────────────────────────────
ALTER TABLE brand_nodes
  ADD COLUMN primary_node_id          bigint REFERENCES style_nodes(id),
  ADD COLUMN secondary_node_id        bigint REFERENCES style_nodes(id),
  ADD COLUMN node_confidence          numeric(3,2)
    CHECK (node_confidence IS NULL OR (node_confidence >= 0 AND node_confidence <= 1)),
  ADD COLUMN node_assigned_at         timestamptz,
  ADD COLUMN node_assigned_model      text,                      -- VLM 모델 ID 추적
  ADD COLUMN representative_image_urls text[];                    -- 분류에 사용된 5장 (or fewer)

-- 빠른 노드 기반 조회 인덱스 (검색 RPC 의 Stage 4 brand 후보 좁힘)
CREATE INDEX idx_brand_nodes_primary   ON brand_nodes (primary_node_id) WHERE primary_node_id IS NOT NULL;
CREATE INDEX idx_brand_nodes_secondary ON brand_nodes (secondary_node_id) WHERE secondary_node_id IS NOT NULL;

COMMENT ON COLUMN brand_nodes.primary_node_id IS
  'FK style_nodes.id. brand 의 1차 감도. SPEC-BRAND-NODE-001 (Haiku 5장 multi-image) 가 채움. 옛 style_node text 컬럼은 cleanup 시 제거.';
COMMENT ON COLUMN brand_nodes.secondary_node_id IS
  'FK style_nodes.id. brand 의 2차 감도. 검색 v6 의 brandScore secondary_match 계산에 사용.';
COMMENT ON COLUMN brand_nodes.node_confidence IS
  'VLM 의 출력 confidence 0-1. < 0.7 이면 admin review queue 로 자동 분기.';
COMMENT ON COLUMN brand_nodes.representative_image_urls IS
  '분류에 입력된 image URL 배열 (최대 5장). 같은 5장 재호출 시 idempotent 보장 + admin debugging.';

-- ── review queue 신설 ───────────────────────────────────────
CREATE TABLE brand_node_review_queue (
  id          bigserial PRIMARY KEY,
  brand_id    uuid NOT NULL REFERENCES brand_nodes(id) ON DELETE CASCADE,
  reason      text NOT NULL
              CHECK (reason IN (
                'insufficient_images',
                'low_confidence',
                'multi_node_conflict',
                'vlm_failed'
              )),
  vlm_output  jsonb,                                              -- VLM raw response (있으면)
  admin_note  text,
  resolved_at timestamptz,
  resolved_by text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 같은 brand 의 open (resolved_at NULL) review 는 1개만 — 패턴 추적 위해 resolved row 는 다수 허용
CREATE UNIQUE INDEX idx_review_open_per_brand
  ON brand_node_review_queue(brand_id) WHERE resolved_at IS NULL;

-- 미처리 큐 빠른 조회 (admin UI 메인 리스트)
CREATE INDEX idx_review_open
  ON brand_node_review_queue(created_at DESC) WHERE resolved_at IS NULL;

-- brand 별 이력 조회
CREATE INDEX idx_review_brand
  ON brand_node_review_queue(brand_id, created_at DESC);

COMMENT ON TABLE brand_node_review_queue IS
  'Brand-VLM 분류 실패 / 저신뢰 / 충돌 / image 부족 케이스를 admin 수동 검수로 보내는 큐. open(resolved_at NULL) 1건 한도 per brand, resolved row 는 이력 보존.';

COMMIT;
