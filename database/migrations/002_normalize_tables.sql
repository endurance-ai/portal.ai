-- 정규화: analyses → analysis_items → item_search_results

-- 1. 아이템 테이블
create table if not exists analysis_items (
  id uuid default gen_random_uuid() primary key,
  analysis_id uuid not null references analyses(id) on delete cascade,
  created_at timestamptz default now() not null,

  -- AI 추출 데이터
  item_index int not null,              -- 0, 1, 2... (순서)
  item_id text not null,                -- "outer", "top", "bottom", "shoes", "accessory"
  category text not null,               -- "Outer", "Top", "Bottom"
  name text not null,                   -- "Oversized Wool Coat"
  detail text,                          -- "Dropped shoulder, mid-thigh length"
  fabric text,                          -- "Wool blend"
  color text,                           -- "Charcoal grey"
  fit text,                             -- "Oversized"

  -- 이미지 위 위치 좌표
  position_top numeric,                 -- 0-100 (%)
  position_left numeric,                -- 0-100 (%)

  -- 검색 쿼리
  search_query_original text,           -- AI가 생성한 원본 쿼리
  search_query_sent text,               -- 실제 SerpApi에 보낸 쿼리 (성별 추가 등)
  gender_appended boolean default false -- 성별 키워드 자동 추가 여부
);

create index if not exists idx_analysis_items_analysis_id on analysis_items(analysis_id);
create index if not exists idx_analysis_items_category on analysis_items(category);

-- 2. 검색 결과 테이블 (아이템별 개별 상품)
create table if not exists item_search_results (
  id uuid default gen_random_uuid() primary key,
  item_id uuid not null references analysis_items(id) on delete cascade,
  analysis_id uuid not null references analyses(id) on delete cascade,
  created_at timestamptz default now() not null,

  -- SerpApi 원본 데이터
  serp_position int,                    -- SerpApi 결과 순위 (1-indexed)
  title text,
  brand text,
  price text,
  extracted_price numeric,
  rating numeric,
  reviews int,
  thumbnail_url text,
  product_link text,
  platform text,                        -- "SSENSE", "Zara", "H&M"

  -- 스코어링
  relevance_score numeric,              -- 자체 스코어링 점수
  is_selected boolean default false     -- 최종 4개로 선택되었는지
);

create index if not exists idx_item_search_results_item_id on item_search_results(item_id);
create index if not exists idx_item_search_results_analysis_id on item_search_results(analysis_id);
create index if not exists idx_item_search_results_brand on item_search_results(brand);
create index if not exists idx_item_search_results_selected on item_search_results(is_selected) where is_selected = true;

-- 3. analyses 테이블에서 JSONB 컬럼은 유지 (raw 백업용)
-- items, search_queries, search_results JSONB는 그대로 두고
-- 정규화 테이블에 구조화된 데이터를 별도 저장
-- → 나중에 JSONB 컬럼 drop 가능
