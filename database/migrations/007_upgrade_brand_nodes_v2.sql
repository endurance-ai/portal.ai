-- Fashion Genome DB v2 스키마 업그레이드
-- v2 변경: 브랜드명 정규화, 멀티 플랫폼, 키워드, 카테고리 타입

-- 1. 새 컬럼 추가
alter table brand_nodes
  add column if not exists brand_name_normalized text,
  add column if not exists brand_keywords text[],
  add column if not exists category_type text,
  add column if not exists source_platforms text[];

-- 2. brand_name_normalized 기본값 = brand_name (기존 데이터 호환)
update brand_nodes
  set brand_name_normalized = brand_name
  where brand_name_normalized is null;

-- 3. source_platforms 기본값 = 기존 platform을 배열로 변환
update brand_nodes
  set source_platforms = array[platform]
  where source_platforms is null and platform is not null;

-- 4. unique index 변경: platform → brand_name_normalized 기준
drop index if exists idx_brand_nodes_name_platform;
create unique index if not exists idx_brand_nodes_normalized_name
  on brand_nodes (brand_name_normalized);

-- 5. 카테고리 타입 인덱스 (제외 필터용)
create index if not exists idx_brand_nodes_category_type
  on brand_nodes (category_type);

-- 6. 키워드 검색용 GIN 인덱스
create index if not exists idx_brand_nodes_keywords
  on brand_nodes using gin (brand_keywords);

comment on column brand_nodes.brand_name_normalized is '정규화된 브랜드명 (조인 키)';
comment on column brand_nodes.brand_keywords is '브랜드 검색 키워드: {"드레이프", "모노톤", "구조적"}';
comment on column brand_nodes.category_type is '의류, 주얼리, 제외 등';
comment on column brand_nodes.source_platforms is '소스 플랫폼 목록: {"AMOMENTO", "SSENSE"}';
