-- 056_brand_nodes_pk_to_bigserial.sql
-- brand_nodes.id uuid → bigserial 전환 + 참조 FK 동기 swap.
-- + pg_trgm extension (crawler 의 alias 휴리스틱 의존성)
-- + brand_node_review_queue.reason CHECK 에 'alias_candidate' 추가
--
-- 옛 uuid 보존 안 함 (사용자 결정 2026-05-14). git history + 백업이 rollback 안전판.
--
-- 영향 받는 테이블:
--   brand_nodes (PK)
--   brand_similar (brand_id, similar_brand_id)
--   brand_attribute_proposals (brand_id)
--   brand_node_review_queue (brand_id) — 055 에서 추가
--
-- 데이터 크기 (2026-05-14 기준):
--   brand_nodes 2,100 / brand_similar 42,000 / brand_attribute_proposals 3,529 /
--   brand_node_review_queue 0
--
-- Author: SPEC-BRAND-NODE-001 PR-X (2026-05-14)

BEGIN;

-- ── (선행) pg_trgm extension ─────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1) brand_nodes 에 bigserial 컬럼 추가 ───────────────────
ALTER TABLE brand_nodes
  ADD COLUMN id_new bigserial NOT NULL;
CREATE UNIQUE INDEX brand_nodes_id_new_uniq ON brand_nodes(id_new);

-- ── 2) 자식 테이블에 새 bigint FK 컬럼 추가 ──────────────────
ALTER TABLE brand_similar
  ADD COLUMN brand_id_new         bigint,
  ADD COLUMN similar_brand_id_new bigint;

ALTER TABLE brand_attribute_proposals
  ADD COLUMN brand_id_new bigint;

ALTER TABLE brand_node_review_queue
  ADD COLUMN brand_id_new bigint;

-- ── 3) Backfill (uuid → bigint 매핑) ────────────────────────
UPDATE brand_similar bs
   SET brand_id_new = bn.id_new
  FROM brand_nodes bn
 WHERE bs.brand_id = bn.id;

UPDATE brand_similar bs
   SET similar_brand_id_new = bn.id_new
  FROM brand_nodes bn
 WHERE bs.similar_brand_id = bn.id;

UPDATE brand_attribute_proposals bap
   SET brand_id_new = bn.id_new
  FROM brand_nodes bn
 WHERE bap.brand_id = bn.id;

UPDATE brand_node_review_queue rq
   SET brand_id_new = bn.id_new
  FROM brand_nodes bn
 WHERE rq.brand_id = bn.id;

-- ── 4) Backfill 무결성 검증 (NULL 없음 확인) ─────────────────
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM brand_similar
   WHERE brand_id_new IS NULL OR similar_brand_id_new IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'brand_similar backfill incomplete: % rows have NULL', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM brand_attribute_proposals
   WHERE brand_id_new IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'brand_attribute_proposals backfill incomplete: % rows have NULL', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM brand_node_review_queue
   WHERE brand_id_new IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'brand_node_review_queue backfill incomplete: % rows have NULL', v_count;
  END IF;
END $$;

-- ── 5) 옛 FK / 인덱스 drop ──────────────────────────────────
ALTER TABLE brand_similar
  DROP CONSTRAINT brand_similar_brand_id_fkey,
  DROP CONSTRAINT brand_similar_similar_brand_id_fkey;

ALTER TABLE brand_attribute_proposals
  DROP CONSTRAINT brand_attribute_proposals_brand_id_fkey;

ALTER TABLE brand_node_review_queue
  DROP CONSTRAINT brand_node_review_queue_brand_id_fkey;

-- review_queue 의 brand_id 기반 partial unique / 인덱스 (055) 도 함께 drop —
-- 컬럼 rename 후 재생성.
DROP INDEX IF EXISTS idx_review_open_per_brand;
DROP INDEX IF EXISTS idx_review_brand;

-- ── 6) 옛 uuid 컬럼 drop ─────────────────────────────────────
ALTER TABLE brand_similar
  DROP COLUMN brand_id,
  DROP COLUMN similar_brand_id;

ALTER TABLE brand_attribute_proposals
  DROP COLUMN brand_id;

ALTER TABLE brand_node_review_queue
  DROP COLUMN brand_id;

-- brand_nodes 의 PK + 옛 id 컬럼 drop
ALTER TABLE brand_nodes DROP CONSTRAINT brand_nodes_pkey;
ALTER TABLE brand_nodes DROP COLUMN id;

-- ── 7) 새 컬럼 rename ───────────────────────────────────────
ALTER TABLE brand_nodes
  RENAME COLUMN id_new TO id;

ALTER TABLE brand_similar
  RENAME COLUMN brand_id_new TO brand_id;
ALTER TABLE brand_similar
  RENAME COLUMN similar_brand_id_new TO similar_brand_id;

ALTER TABLE brand_attribute_proposals
  RENAME COLUMN brand_id_new TO brand_id;

ALTER TABLE brand_node_review_queue
  RENAME COLUMN brand_id_new TO brand_id;

-- ── 8) 새 PK + 옛 임시 unique 정리 ──────────────────────────
DROP INDEX brand_nodes_id_new_uniq;            -- 임시 unique 제거
ALTER TABLE brand_nodes ADD PRIMARY KEY (id);

-- ── 9) 자식 컬럼 NOT NULL + FK 재구성 ────────────────────────
ALTER TABLE brand_similar
  ALTER COLUMN brand_id SET NOT NULL,
  ALTER COLUMN similar_brand_id SET NOT NULL,
  ADD CONSTRAINT brand_similar_brand_id_fkey
    FOREIGN KEY (brand_id) REFERENCES brand_nodes(id) ON DELETE CASCADE,
  ADD CONSTRAINT brand_similar_similar_brand_id_fkey
    FOREIGN KEY (similar_brand_id) REFERENCES brand_nodes(id) ON DELETE CASCADE;

ALTER TABLE brand_attribute_proposals
  ALTER COLUMN brand_id SET NOT NULL,
  ADD CONSTRAINT brand_attribute_proposals_brand_id_fkey
    FOREIGN KEY (brand_id) REFERENCES brand_nodes(id) ON DELETE CASCADE;

ALTER TABLE brand_node_review_queue
  ALTER COLUMN brand_id SET NOT NULL,
  ADD CONSTRAINT brand_node_review_queue_brand_id_fkey
    FOREIGN KEY (brand_id) REFERENCES brand_nodes(id) ON DELETE CASCADE;

-- ── 10) review_queue 인덱스 재생성 (055 와 동일) ────────────
CREATE UNIQUE INDEX idx_review_open_per_brand
  ON brand_node_review_queue(brand_id) WHERE resolved_at IS NULL;

CREATE INDEX idx_review_brand
  ON brand_node_review_queue(brand_id, created_at DESC);

-- ── 11) sequence 이름 cleanup (id_new_seq → id_seq) ─────────
ALTER SEQUENCE brand_nodes_id_new_seq RENAME TO brand_nodes_id_seq;

-- ── 12) review_queue.reason 에 alias_candidate 추가 ─────────
ALTER TABLE brand_node_review_queue
  DROP CONSTRAINT brand_node_review_queue_reason_check;

ALTER TABLE brand_node_review_queue
  ADD CONSTRAINT brand_node_review_queue_reason_check
    CHECK (reason IN (
      'insufficient_images',
      'low_confidence',
      'multi_node_conflict',
      'vlm_failed',
      'alias_candidate'
    ));

-- ── 코멘트 ───────────────────────────────────────────────────
COMMENT ON COLUMN brand_nodes.id IS
  'bigserial PK (2026-05-14 전환, 옛 uuid 폐기). 외부 노출 시 그대로 사용 가능 (700~2k brand 규모).';

COMMENT ON CONSTRAINT brand_node_review_queue_reason_check ON brand_node_review_queue IS
  'reason 화이트리스트. alias_candidate = crawler backfill 시 trigram 유사 brand 발견 → admin 결정 대기.';

COMMIT;

-- 검증 쿼리 (수동):
--   SELECT id, brand_name FROM brand_nodes ORDER BY id LIMIT 5;          -- bigint id 확인
--   SELECT COUNT(*) FROM brand_similar;                                   -- 42000 유지
--   SELECT COUNT(*) FROM brand_attribute_proposals;                       -- 3529 유지
--   SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name='brand_nodes' AND column_name='id';                -- bigint
