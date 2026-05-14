-- 카테고리 + 세일 정보 컬럼 추가

alter table products
  add column if not exists category text,
  add column if not exists original_price integer,
  add column if not exists sale_price integer,
  add column if not exists product_no integer,
  add column if not exists last_seen_at timestamptz;

-- 카테고리 인덱스
create index if not exists idx_products_category on products (category);

-- product_no 중복 제거용
create index if not exists idx_products_product_no on products (product_no) where product_no is not null;

comment on column products.category is '상품 카테고리: Outer, Top, Bottom, Shoes, Bag, Accessories, Dress, Knitwear, Shirts';
comment on column products.original_price is '원가 (KRW)';
comment on column products.sale_price is '세일가 (null이면 세일 아님)';
comment on column products.product_no is 'Cafe24 상품 고유번호 (중복 제거 키)';
comment on column products.last_seen_at is '마지막으로 크롤링에서 확인된 시각 (soft-delete 판단용)';
