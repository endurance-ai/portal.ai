-- 골든셋 확장: 검색 평가용 expected 필드 추가

ALTER TABLE eval_golden_set
  ADD COLUMN IF NOT EXISTS expected_products JSONB,
  ADD COLUMN IF NOT EXISTS expected_color_family TEXT,
  ADD COLUMN IF NOT EXISTS expected_fit TEXT,
  ADD COLUMN IF NOT EXISTS expected_fabric TEXT,
  ADD COLUMN IF NOT EXISTS test_type TEXT DEFAULT 'image';

COMMENT ON COLUMN eval_golden_set.expected_products IS '기대되는 검색 결과 [{brand, category, subcategory}]';
COMMENT ON COLUMN eval_golden_set.test_type IS 'image: 이미지 기반, prompt: 프롬프트 기반';
