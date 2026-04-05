-- 상품 이미지 AI 분석 결과 테이블
-- products와 1:N 관계 (버전별 분석 결과 저장)

CREATE TABLE product_ai_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- 버전 관리
  version TEXT NOT NULL DEFAULT 'v1',
  model_id TEXT NOT NULL,
  prompt_hash TEXT,

  -- 정규화된 enum 필드
  category TEXT NOT NULL,
  subcategory TEXT,
  fit TEXT,
  fabric TEXT,
  color_family TEXT,
  color_detail TEXT,

  -- 스타일 분류
  style_node TEXT,
  mood_tags TEXT[],
  keywords_ko TEXT[],
  keywords_en TEXT[],

  -- 메타
  confidence NUMERIC(3,2),
  raw_response JSONB,
  error TEXT,

  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE (product_id, version)
);

-- 검색용 인덱스
CREATE INDEX idx_pai_version ON product_ai_analysis (version);
CREATE INDEX idx_pai_product_version ON product_ai_analysis (product_id, version);
CREATE INDEX idx_pai_category ON product_ai_analysis (version, category);
CREATE INDEX idx_pai_subcategory ON product_ai_analysis (version, subcategory);
CREATE INDEX idx_pai_style_node ON product_ai_analysis (version, style_node);
CREATE INDEX idx_pai_color_family ON product_ai_analysis (version, color_family);
CREATE INDEX idx_pai_fit ON product_ai_analysis (version, fit);
CREATE INDEX idx_pai_fabric ON product_ai_analysis (version, fabric);
CREATE INDEX idx_pai_mood_tags ON product_ai_analysis USING gin (mood_tags);
CREATE INDEX idx_pai_keywords_ko ON product_ai_analysis USING gin (keywords_ko);
CREATE INDEX idx_pai_keywords_en ON product_ai_analysis USING gin (keywords_en);

COMMENT ON TABLE product_ai_analysis IS '상품 이미지 AI 분석 결과. products와 1:N (버전별). 검색 매칭의 핵심 데이터.';
