-- 아이템 표준 enum 태깅 지원: subcategory + color_hex 컬럼 추가
ALTER TABLE analysis_items
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS color_hex TEXT;
