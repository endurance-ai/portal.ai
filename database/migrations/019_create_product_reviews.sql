-- 상품 리뷰 테이블 + products에 리뷰 집계 컬럼 추가

-- 1. product_reviews 테이블
CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  text TEXT,
  author TEXT,
  review_date TEXT,
  photo_urls TEXT[],
  body_info JSONB,  -- {height, weight, usualSize, purchasedSize, bodyType}
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews (product_id);

-- 2. products 테이블에 리뷰 집계 컬럼
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_rating NUMERIC(2,1);
