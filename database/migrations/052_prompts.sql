-- 052_prompts.sql
-- VLM/Text prompt registry — DB-managed prompt taxonomy.
-- 옛 src/lib/prompts/*.ts 의 하드코딩 template 을 DB 로 이전.
-- Seed 는 053 에서. 본 migration 은 schema 만.
--
-- Author: SPEC-PROMPT-REGISTRY-001 P1 (2026-05-14)
-- Related: docs/plans/26-05-13-spec-prompt-registry.md
-- 검증: kikoai dev-app PG. Requires 049_style_nodes.sql trigger function.

BEGIN;

CREATE TABLE prompts (
  id            bigserial PRIMARY KEY,

  -- 식별 (composite natural key)
  situation     text NOT NULL,                   -- TS enum 으로 typo 가드
  version       text NOT NULL
                CHECK (length(version) BETWEEN 1 AND 30),

  -- 운영 플래그
  is_active     boolean NOT NULL DEFAULT false,

  -- 본문
  system_md     text NOT NULL,
  user_md       text NOT NULL,
  placeholders  jsonb NOT NULL DEFAULT '{}',     -- runtime resolver schema

  -- VLM 호출 파라미터
  model_id      text,                             -- 권장 모델 (선택)
  max_tokens    integer DEFAULT 1200,
  temperature   numeric(3,2) DEFAULT 0.0,

  -- 감사 / 메타
  notes         text,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (situation, version)
);

-- situation 별 active 1개만 허용
CREATE UNIQUE INDEX idx_prompts_active_per_situation
  ON prompts(situation)
  WHERE is_active = true;

-- situation 별 조회 (active row pickup + admin list)
CREATE INDEX idx_prompts_situation ON prompts(situation);

-- updated_at 자동 갱신 (049 의 함수 재사용)
CREATE TRIGGER trg_prompts_updated_at
  BEFORE UPDATE ON prompts
  FOR EACH ROW
  EXECUTE FUNCTION style_nodes_set_updated_at();

-- 코멘트
COMMENT ON TABLE prompts IS
  'VLM/Text prompt registry. DB-managed; admin editable via /admin/prompts. Each situation has exactly one is_active=true row at a time (unique partial index). placeholders jsonb holds runtime resolver schema (e.g. {{NODES_BLOCK}} → fetch style_nodes table).';

COMMENT ON COLUMN prompts.situation IS
  'Use-case slot. Whitelisted in TS code (PromptSituation enum). Examples: vision-analyze, prompt-search, brand-vlm.';

COMMENT ON COLUMN prompts.version IS
  'Free-form label within situation, 1-30 chars. e.g. v1, v2-strict, 2026-05-13-experiment.';

COMMENT ON COLUMN prompts.placeholders IS
  'Resolver schema for {{PLACEHOLDER}} tokens. Format: {token_name: {source: "style_nodes" | "static" | "runtime", ...meta}}.';

COMMIT;
