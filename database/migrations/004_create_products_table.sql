-- 크롤링 상품 테이블 — 편집샵에서 수집한 실제 상품 데이터
-- 브랜드-노드 매핑은 brand_nodes 테이블에서 관리

-- 1. 브랜드-노드 매핑 (Fashion Genome Brand_DB 기반)
create table if not exists brand_nodes (
  id uuid default gen_random_uuid() primary key,
  brand_name text not null,
  platform text,                          -- "샵아모멘토", "ssense"
  style_node text not null,               -- "C", "B-2", "A-1" 등
  sensitivity_tags text[],                -- {"미니멀", "하이엔드"}
  gender_scope text[],                    -- {"men", "women"}
  price_band text,                        -- "mid", "high", "luxury"
  updated_at timestamptz default now()
);

create unique index if not exists idx_brand_nodes_name_platform
  on brand_nodes (brand_name, platform);
create index if not exists idx_brand_nodes_style_node
  on brand_nodes (style_node);

-- 2. 크롤링 상품 테이블
create table if not exists products (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,

  -- 상품 기본 정보
  brand text not null,
  name text not null,
  price integer,                          -- 원화 기준 (KRW)
  image_url text,
  product_url text not null,
  in_stock boolean default true,

  -- 출처
  platform text not null,                 -- "shopamomento", "ssense"
  gender text[],                          -- {"women", "men"}

  -- Fashion Genome 연동 (brand_nodes에서 조인)
  style_node text,                        -- 비정규화: 빠른 필터용

  -- 크롤링 메타
  crawled_at timestamptz,
  updated_at timestamptz default now()
);

create index if not exists idx_products_brand on products (brand);
create index if not exists idx_products_platform on products (platform);
create index if not exists idx_products_style_node on products (style_node);
create index if not exists idx_products_in_stock on products (in_stock) where in_stock = true;
create index if not exists idx_products_gender on products using gin (gender);

-- 전문 검색용 (상품명 + 브랜드)
create index if not exists idx_products_search
  on products using gin (to_tsvector('simple', brand || ' ' || name));
