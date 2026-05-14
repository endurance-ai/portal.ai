-- 별점 관련 컬럼 제거 (Cafe24 리뷰에 별점 없음)

ALTER TABLE product_reviews DROP COLUMN IF EXISTS rating;
ALTER TABLE products DROP COLUMN IF EXISTS average_rating;
