-- 049_style_nodes.sql
-- Style Node DB-managed taxonomy 테이블 신설.
-- 기존 src/lib/fashion-genome.ts 의 STYLE_NODES 상수를 DB 로 이전하기 위한 schema.
-- Seed (INSERT) 는 별도 migration 또는 admin UI 로 처리. 본 migration 은 schema 만.
--
-- Author: SPEC-NODE-REDESIGN-001 P1 (2026-05-13)
-- Related: docs/plans/26-05-13-spec-node-redesign.md
-- 검증: kikoai dev-app PG

BEGIN;

-- ── style_nodes 테이블 ───────────────────────────────────────
CREATE TABLE style_nodes (
  id            bigserial PRIMARY KEY,
  code          text UNIQUE NOT NULL
                CHECK (code ~ '^[A-Z]{1,3}$'),          -- A, B, ..., Z, AA, AB...

  -- 외부 표시용 (en/ko 짝)
  name_en       text NOT NULL,
  name_ko       text NOT NULL,

  -- 내부 로직용 (VLM prompt 주입, 검색 reference)
  mood          text,                                    -- 한 줄 무드 (en)
  include_rule  text,                                    -- 포함 기준 (en)
  exclude_rule  text,                                    -- 제외 기준 (en, dispatch 포함)
  keywords_en   text[] NOT NULL DEFAULT '{}',            -- VLM 매칭 키워드

  -- admin 한글 보조
  keywords_ko   text[] NOT NULL DEFAULT '{}',

  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 인덱스 ───────────────────────────────────────────────────
-- 활성 노드만 조회 (VLM prompt 빌드, admin 리스트)
CREATE INDEX idx_style_nodes_active ON style_nodes(id) WHERE is_active = true;

-- code 로 빠른 lookup (검색 RPC, brand 매핑)
-- (UNIQUE constraint 가 자동 생성하지만, 명시적으로 의도 표현)

-- ── updated_at 자동 갱신 트리거 ──────────────────────────────
CREATE OR REPLACE FUNCTION style_nodes_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_style_nodes_updated_at
  BEFORE UPDATE ON style_nodes
  FOR EACH ROW
  EXECUTE FUNCTION style_nodes_set_updated_at();

-- ── 코멘트 ───────────────────────────────────────────────────
COMMENT ON TABLE style_nodes IS
  'Fashion style taxonomy. DB-managed (formerly src/lib/fashion-genome.ts STYLE_NODES const). Editable via /admin/style-nodes. Drives VLM classification prompts and brand/product node assignment.';

COMMENT ON COLUMN style_nodes.code IS
  'Slot label (single/triple uppercase). Semantically neutral — meaning lives in name_en/mood/include_rule. Stable across taxonomy revisions.';

COMMENT ON COLUMN style_nodes.mood IS
  'One-line evocative description (en). Injected into VLM prompt as vibe signal alongside include/exclude rules.';

COMMENT ON COLUMN style_nodes.include_rule IS
  'When to assign this node (en). Concrete signals VLM should detect. Injected into VLM prompt.';

COMMENT ON COLUMN style_nodes.exclude_rule IS
  'When NOT to assign this node and where to dispatch instead (e.g. "→ B" reference). Critical for boundary disambiguation. Injected into VLM prompt.';

COMMENT ON COLUMN style_nodes.keywords_en IS
  'English keywords injected into VLM prompt for matching. Drives classification accuracy.';

COMMENT ON COLUMN style_nodes.keywords_ko IS
  'Korean keywords for admin UI reference only. Not used in VLM prompts or search RPC.';

COMMIT;
