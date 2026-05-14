-- 상품 상세 페이지 크롤링 데이터 컬럼 추가
-- Priority 1: 검색 품질 직결
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS material TEXT,
  ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Priority 2: 데이터 품질
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS images TEXT[],
  ADD COLUMN IF NOT EXISTS size_info TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS product_code TEXT;

-- 전문 검색 인덱스 확장 (description, color, material 포함)
DROP INDEX IF EXISTS idx_products_search;
CREATE INDEX idx_products_search
  ON products USING gin (
    to_tsvector('simple',
      coalesce(brand, '') || ' ' ||
      coalesce(name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(color, '') || ' ' ||
      coalesce(material, '')
    )
  );

-- 서브카테고리 인덱스
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products (subcategory);

-- 색상 인덱스
CREATE INDEX IF NOT EXISTS idx_products_color ON products (color);
