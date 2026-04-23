-- 상품 필터 옵션 RPC — 어드민 /admin/products 필터 바의 드롭다운을
-- 실제 DB 값으로 동적으로 채우기 위한 집계 함수
--
-- 반환 포맷:
--   dimension                    | value           | count
--   'platform'                   | 'shopamomento'  | 1234
--   'category'                   | 'Outer'         | 456
--   'style_node'                 | 'A-1'           | 234
--   'color_family'               | 'BLACK'         | 1500
--   'fit'                        | 'regular'       | 890
--   'fabric'                     | 'cotton'        | 1100
--   'subcategory:Outer'          | 'overcoat'      | 12
--   'subcategory:Top'            | 't-shirt'       | 340

CREATE OR REPLACE FUNCTION get_product_filter_counts()
RETURNS TABLE (
  dimension text,
  value text,
  count bigint
)
LANGUAGE sql
STABLE
AS $$
  -- 플랫폼: products 테이블 기준 (실제 크롤된 것)
  SELECT 'platform'::text AS dimension, platform AS value, COUNT(*)::bigint AS count
  FROM products
  WHERE platform IS NOT NULL AND platform <> ''
  GROUP BY platform

  UNION ALL

  -- 카테고리: products.category (크롤 단계 분류)
  SELECT 'category'::text, category, COUNT(*)::bigint
  FROM products
  WHERE category IS NOT NULL AND category <> ''
  GROUP BY category

  UNION ALL

  -- 스타일 노드: AI 분석 기준
  SELECT 'style_node'::text, style_node, COUNT(*)::bigint
  FROM product_ai_analysis
  WHERE version = 'v1' AND style_node IS NOT NULL AND style_node <> ''
  GROUP BY style_node

  UNION ALL

  -- 컬러 패밀리: AI 분석 기준
  SELECT 'color_family'::text, color_family, COUNT(*)::bigint
  FROM product_ai_analysis
  WHERE version = 'v1' AND color_family IS NOT NULL AND color_family <> ''
  GROUP BY color_family

  UNION ALL

  -- 핏: AI 분석 기준
  SELECT 'fit'::text, fit, COUNT(*)::bigint
  FROM product_ai_analysis
  WHERE version = 'v1' AND fit IS NOT NULL AND fit <> ''
  GROUP BY fit

  UNION ALL

  -- 패브릭: AI 분석 기준
  SELECT 'fabric'::text, fabric, COUNT(*)::bigint
  FROM product_ai_analysis
  WHERE version = 'v1' AND fabric IS NOT NULL AND fabric <> ''
  GROUP BY fabric

  UNION ALL

  -- 서브카테고리: 카테고리별로 그룹핑 (dimension에 category 인코딩)
  SELECT ('subcategory:' || category)::text, subcategory, COUNT(*)::bigint
  FROM product_ai_analysis
  WHERE version = 'v1' AND subcategory IS NOT NULL AND subcategory <> '' AND category IS NOT NULL
  GROUP BY category, subcategory;
$$;

COMMENT ON FUNCTION get_product_filter_counts() IS
  '어드민 상품 필터 드롭다운용 동적 옵션 집계. dimension/value/count 반환. 10분 캐시 권장.';
