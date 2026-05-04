-- Migration 033: eval v6 evaluation infrastructure
-- @MX:NOTE - RLS pattern reference: admin-gating predicate (admin_profiles.status='approved')
--           NOTE: 023_admin_profiles_rls.sql uses own-row pattern for admin_profiles itself.
--           For eval_* tables we need admin-gating, so we inline the EXISTS predicate here.
-- @MX:NOTE - Frozen baseline invariant: eval_runs row with algorithm_version='v4' AND
--           golden_query_id IS NULL AND frozen=true is locked once set (REQ-V6-EVAL-004).
-- @MX:WARN - search_path lock on prevent_frozen_v4_baseline_overwrite() (SECURITY DEFINER
--           + SET search_path = public, pg_temp) — schema injection guard, mirrors 024.
-- SPEC-V6-EVAL T-001

-- =============================================================================
-- 1. Tables
-- =============================================================================

-- 1.1 eval_golden_queries: 정답셋 쿼리 카탈로그 (Instagram URL 또는 query_signature 식별)
CREATE TABLE eval_golden_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_url text NULL,
  query_signature text NULL,
  intent_note text NOT NULL,
  created_by text NOT NULL,                 -- admin email or labeler_id
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  algorithm_version text NOT NULL DEFAULT 'v4'
    CHECK (algorithm_version IN ('v4', 'v6')),
  -- 최소 한 가지 식별자는 있어야 함
  CONSTRAINT eval_golden_queries_identity_present
    CHECK (instagram_url IS NOT NULL OR query_signature IS NOT NULL)
);

-- Dual identity 중복 방지: PostgreSQL 15+ NULLS NOT DISTINCT
-- (Supabase는 PG 15+ 기본 지원. 만약 호환 이슈 발생 시 partial unique index 두 개로 대체)
CREATE UNIQUE INDEX eval_golden_queries_identity_unique
  ON eval_golden_queries (instagram_url, query_signature) NULLS NOT DISTINCT;

-- 1.2 eval_judgments: (query, product, algorithm_version) 단위 라벨 (relevance grade 0~3)
CREATE TABLE eval_judgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  golden_query_id uuid NOT NULL REFERENCES eval_golden_queries(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  relevance_grade smallint NOT NULL CHECK (relevance_grade BETWEEN 0 AND 3),
  labeler_id text NOT NULL,
  labeled_at timestamptz NOT NULL DEFAULT now(),
  algorithm_version text NOT NULL CHECK (algorithm_version IN ('v4', 'v6')),
  notes text NULL,
  UNIQUE (golden_query_id, product_id, algorithm_version)
);

-- 1.3 eval_runs: nDCG@10 / Precision@5 결과 스냅샷
--     golden_query_id NULL = 전체 쿼리에 대한 aggregate 스냅샷
CREATE TABLE eval_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  golden_query_id uuid NULL REFERENCES eval_golden_queries(id) ON DELETE CASCADE,
  algorithm_version text NOT NULL CHECK (algorithm_version IN ('v4', 'v6')),
  ndcg_at_10 numeric(5,4) NOT NULL CHECK (ndcg_at_10 BETWEEN 0 AND 1),
  precision_at_5 numeric(5,4) NOT NULL CHECK (precision_at_5 BETWEEN 0 AND 1),
  query_count integer NOT NULL CHECK (query_count >= 0),
  judgment_count integer NOT NULL CHECK (judgment_count >= 0),
  frozen boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now(),
  notes text NULL
);

-- =============================================================================
-- 2. Indexes
-- =============================================================================

CREATE INDEX idx_eval_judgments_query_algo
  ON eval_judgments (golden_query_id, algorithm_version);
CREATE INDEX idx_eval_judgments_product
  ON eval_judgments (product_id);
CREATE INDEX idx_eval_runs_algo_computed
  ON eval_runs (algorithm_version, computed_at DESC);
CREATE INDEX idx_eval_golden_queries_algo
  ON eval_golden_queries (algorithm_version);

-- =============================================================================
-- 3. Frozen baseline trigger (REQ-V6-EVAL-004)
-- =============================================================================
-- v4 aggregate baseline (golden_query_id IS NULL, frozen=true)는 단 한 번만 기록 가능.
-- 이미 frozen=true 인 v4 aggregate row 가 존재하면 새 INSERT 거부.

CREATE OR REPLACE FUNCTION prevent_frozen_v4_baseline_overwrite()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.algorithm_version = 'v4'
     AND NEW.golden_query_id IS NULL
     AND EXISTS (
       SELECT 1 FROM eval_runs
       WHERE algorithm_version = 'v4'
         AND golden_query_id IS NULL
         AND frozen = true
     )
  THEN
    RAISE EXCEPTION 'baseline already frozen for v4 aggregate'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_frozen_v4_baseline_overwrite ON eval_runs;
CREATE TRIGGER trg_prevent_frozen_v4_baseline_overwrite
BEFORE INSERT ON eval_runs
FOR EACH ROW EXECUTE FUNCTION prevent_frozen_v4_baseline_overwrite();

-- =============================================================================
-- 4. RLS — 관리자 전용 접근 (REQ-V6-EVAL-005)
-- =============================================================================
-- service_role 은 RLS 우회. authenticated role 은 admin_profiles.status='approved' 일 때만 통과.
-- FOR ALL = SELECT/INSERT/UPDATE/DELETE 모두 적용. WITH CHECK 로 admin-only write 보장.

-- 4.1 eval_golden_queries
ALTER TABLE eval_golden_queries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin only access" ON eval_golden_queries;
CREATE POLICY "admin only access"
ON eval_golden_queries FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE user_id = auth.uid() AND status = 'approved'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE user_id = auth.uid() AND status = 'approved'
  )
);

-- 4.2 eval_judgments
ALTER TABLE eval_judgments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin only access" ON eval_judgments;
CREATE POLICY "admin only access"
ON eval_judgments FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE user_id = auth.uid() AND status = 'approved'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE user_id = auth.uid() AND status = 'approved'
  )
);

-- 4.3 eval_runs
ALTER TABLE eval_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin only access" ON eval_runs;
CREATE POLICY "admin only access"
ON eval_runs FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE user_id = auth.uid() AND status = 'approved'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE user_id = auth.uid() AND status = 'approved'
  )
);
