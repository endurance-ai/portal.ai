-- 어드민: 품질 평가 + API 접근 로그

-- 1. 분석 결과 평가
CREATE TABLE eval_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  reviewer_email TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'fail', 'partial')),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_eval_reviews_analysis ON eval_reviews(analysis_id);
CREATE INDEX idx_eval_reviews_verdict ON eval_reviews(verdict);

-- 2. Golden Set (품질 기준 데이터셋)
CREATE TABLE eval_golden_set (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  expected_node_primary TEXT CHECK (expected_node_primary IN ('A-1','A-2','A-3','B','B-2','C','D','E','F','F-2','F-3','G','H','I','K')),
  expected_node_secondary TEXT,
  expected_items JSONB,
  notes TEXT,
  added_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. API 접근 로그
CREATE TABLE api_access_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip TEXT,
  user_agent TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  status_code INT,
  duration_ms INT,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_api_access_logs_created ON api_access_logs(created_at DESC);
CREATE INDEX idx_api_access_logs_endpoint ON api_access_logs(endpoint);
