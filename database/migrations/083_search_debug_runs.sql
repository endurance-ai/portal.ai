-- 083_search_debug_runs.sql
-- 어드민 v6 검색 디버거 — Run 스냅샷 + 어드민 리뷰 저장.
--
-- 한 Run = 입력 (mode/text/image/filters/steps) + 응답 전체 (trace+results) +
-- 리뷰 (rating 1-5, notes, tags). 어드민 간 공유 (RLS 없음, requireApprovedAdmin
-- 게이트가 라우트에서 제공).

BEGIN;

CREATE TABLE IF NOT EXISTS search_debug_runs (
  id           bigserial PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   text,                       -- admin email
  mode         text NOT NULL CHECK (mode IN ('text', 'image', 'fused')),
  query_text   text,                       -- user 가 입력한 raw 텍스트
  image_url    text,                       -- 임베딩에 들어간 실제 image URL
  source_url   text,                       -- IG/Pinterest 원본 URL (resolve 거쳤을 때)
  filters      jsonb,                      -- {style_node_code, category, limit, ...}
  steps        jsonb,                      -- {run_rewrite, rewrite_model_id, apply_rewrite, run_vision, auto_wire_category}
  response     jsonb NOT NULL,             -- 디버거 라우트 응답 전체 (rewrite/vision/pipeline/rpc/results)
  rating       smallint CHECK (rating BETWEEN 1 AND 5),
  notes        text,
  tags         text[] NOT NULL DEFAULT '{}'::text[]
);

CREATE INDEX IF NOT EXISTS idx_search_debug_runs_created_at
  ON search_debug_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_debug_runs_rating
  ON search_debug_runs (rating) WHERE rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_search_debug_runs_tags
  ON search_debug_runs USING gin (tags);

COMMENT ON TABLE search_debug_runs IS
  '어드민 v6 검색 디버거 Run 히스토리. 공유 — 모든 승인 어드민이 본다. '
  'response 컬럼 = 디버거 라우트 응답 전체 스냅샷 (이후 RPC 결과/스키마 변경에도 '
  '본 row 는 그 시점의 raw 그대로 보존). created_by 는 audit 용, ownership 아님.';

-- app_user 권한 (PostgREST + app/ 서버에서 접근)
GRANT SELECT, INSERT, UPDATE, DELETE ON search_debug_runs TO app_user;
GRANT USAGE, SELECT ON SEQUENCE search_debug_runs_id_seq TO app_user;

COMMIT;
