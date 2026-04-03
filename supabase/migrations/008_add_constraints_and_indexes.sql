-- 코드 리뷰 반영: 제약 조건 + 인덱스 + 데이터 정합성

-- 1. products.product_url UNIQUE 제약 (중복 크롤링 방지)
ALTER TABLE products
  ADD CONSTRAINT uq_products_product_url UNIQUE (product_url);

-- 2. style_node 유효값 CHECK (AI 환각/오타 방지)
ALTER TABLE brand_nodes
  ADD CONSTRAINT chk_brand_nodes_style_node
  CHECK (style_node IN ('A-1','A-2','A-3','B','B-2','C','D','E','F','F-2','F-3','G','H','I','K'));

ALTER TABLE products
  ADD CONSTRAINT chk_products_style_node
  CHECK (style_node IS NULL OR style_node IN ('A-1','A-2','A-3','B','B-2','C','D','E','F','F-2','F-3','G','H','I','K'));

ALTER TABLE analyses
  ADD CONSTRAINT chk_analyses_style_node_primary
  CHECK (style_node_primary IS NULL OR style_node_primary IN ('A-1','A-2','A-3','B','B-2','C','D','E','F','F-2','F-3','G','H','I','K'));

-- 3. style_node_confidence 범위 제약
ALTER TABLE analyses
  ADD CONSTRAINT chk_analyses_confidence
  CHECK (style_node_confidence IS NULL OR style_node_confidence BETWEEN 0.0 AND 1.0);

-- 4. brand_name_normalized NOT NULL 강제 (007에서 백필했으므로 안전)
ALTER TABLE brand_nodes
  ALTER COLUMN brand_name_normalized SET NOT NULL;

-- 5. 검색 핫패스 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_products_search_main
  ON products (category, in_stock) WHERE in_stock = true;

-- 6. product_no 인덱스 유지 (non-unique — 같은 상품이 여러 카테고리에 걸릴 수 있음)
-- 중복 제거 키는 product_url (UNIQUE constraint above)
