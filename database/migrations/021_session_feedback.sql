-- analysis_sessions: 유저 분석 세션 (리파인 체인 단위)
CREATE TABLE IF NOT EXISTS analysis_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  initial_prompt text,
  initial_image_url text,
  gender text,
  analysis_count int NOT NULL DEFAULT 1,
  last_analysis_id uuid
);

CREATE INDEX idx_sessions_created_at ON analysis_sessions (created_at DESC);

-- user_feedbacks: 유저 피드백 (세션당 1개)
CREATE TABLE IF NOT EXISTS user_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('up', 'down')),
  tags text[] DEFAULT '{}',
  comment text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedbacks_session ON user_feedbacks (session_id);
CREATE INDEX idx_feedbacks_rating ON user_feedbacks (rating);
CREATE INDEX idx_feedbacks_created_at ON user_feedbacks (created_at DESC);

-- analyses 테이블에 세션 관련 컬럼 추가
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES analysis_sessions(id) ON DELETE SET NULL;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS parent_analysis_id uuid REFERENCES analyses(id) ON DELETE SET NULL;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS refinement_prompt text;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS sequence_number int DEFAULT 1;

CREATE INDEX idx_analyses_session ON analyses (session_id);
CREATE INDEX idx_analyses_parent ON analyses (parent_analysis_id);
