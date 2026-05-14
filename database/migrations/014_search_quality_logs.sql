-- 검색 품질 로깅: 매 검색마다 아이템별 스코어 기록

CREATE TABLE search_quality_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  item_id TEXT NOT NULL,
  query_category TEXT,
  query_subcategory TEXT,
  query_color_family TEXT,
  query_fit TEXT,
  query_fabric TEXT,
  query_style_node TEXT,
  result_count INT NOT NULL DEFAULT 0,
  top_score NUMERIC,
  avg_score NUMERIC,
  score_breakdown JSONB,
  is_empty BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sql_empty ON search_quality_logs (is_empty) WHERE is_empty = true;
CREATE INDEX idx_sql_category ON search_quality_logs (query_category);
CREATE INDEX idx_sql_created ON search_quality_logs (created_at DESC);
