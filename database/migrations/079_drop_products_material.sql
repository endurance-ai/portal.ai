-- 079_drop_products_material.sql
-- products.material 컬럼 폐기 + admin_crawl_platform_stats RPC 갱신.
--
-- 배경:
--   migration 011 (2025-Q1) 가 검색 품질용 enrichment 컬럼으로 추가했던 5종 중 하나.
--   2026-05-20 채움률 진단 결과:
--     description : 82,392 / 118,504 (69%) — Shopify global 만 채움
--     color       : 26,996 / 118,504 (23%)
--     tags        : 82,854 / 118,504 (70%)
--     images[]    : 84,053 / 118,504 (71%)
--     material    :       0 / 118,504 (  0%) ← 본 컬럼 — 완전 사망
--
--   crawler 측 (endurance-ai/crawler) 의 cafe24 detail parser 가 material
--   추출을 시도하나 실제 결과는 항상 null/empty. 069 PAI drop 이후로는
--   검색이 ImageEmbedding cosine 만 사용 — material text 는 어디서도 안 읽힘.
--
--   crawler 측은 commit fccd744 (2026-05-20) 에서 INSERT 매핑 제거 완료.
--   추출 로직 자체는 보존 — 향후 컬럼 복구 시 한 줄만 추가하면 부활.
--
-- 본 마이그가 하는 일:
--   1) products.material 컬럼 DROP
--   2) admin_crawl_platform_stats() RPC 재정의 — fill_material 컬럼 제거
--      (RETURNS TABLE signature 변경이라 DROP FUNCTION + CREATE 필요)
--
-- Author: kiko.ai admin (2026-05-20)

BEGIN;

-- 1) drop dead column
ALTER TABLE products
  DROP COLUMN IF EXISTS material;

-- 2) RPC 갱신 — signature 가 바뀌므로 DROP 후 CREATE
DROP FUNCTION IF EXISTS admin_crawl_platform_stats();

CREATE OR REPLACE FUNCTION admin_crawl_platform_stats()
RETURNS TABLE (
  platform text,
  sku_count bigint,
  in_stock_count bigint,
  last_crawled_at timestamptz,
  stale_count bigint,
  unembedded_count bigint,
  unbranded_count bigint,
  fill_description bigint,
  fill_color bigint,
  fill_tags bigint,
  fill_images bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.platform::text                                                                AS platform,
    COUNT(*)::bigint                                                                AS sku_count,
    COUNT(*) FILTER (WHERE p.in_stock)::bigint                                      AS in_stock_count,
    MAX(p.crawled_at)                                                               AS last_crawled_at,
    COUNT(*) FILTER (
      WHERE p.crawled_at IS NULL OR p.crawled_at < now() - interval '30 days'
    )::bigint                                                                       AS stale_count,
    COUNT(*) FILTER (WHERE pe.product_id IS NULL)::bigint                           AS unembedded_count,
    COUNT(*) FILTER (WHERE p.brand_node_id IS NULL)::bigint                         AS unbranded_count,
    COUNT(*) FILTER (WHERE p.description IS NOT NULL AND p.description <> '')::bigint  AS fill_description,
    COUNT(*) FILTER (WHERE p.color       IS NOT NULL AND p.color       <> '')::bigint  AS fill_color,
    COUNT(*) FILTER (WHERE p.tags        IS NOT NULL AND array_length(p.tags, 1)   > 0)::bigint  AS fill_tags,
    COUNT(*) FILTER (WHERE p.images      IS NOT NULL AND array_length(p.images, 1) > 0)::bigint  AS fill_images
  FROM products p
  LEFT JOIN product_embeddings pe ON pe.product_id = p.id
  WHERE p.platform IS NOT NULL AND p.platform <> ''
  GROUP BY p.platform
  ORDER BY MAX(p.crawled_at) DESC NULLS LAST;
$$;

COMMENT ON FUNCTION admin_crawl_platform_stats() IS
  '어드민 /admin/crawl 모니터링용 — 플랫폼별 SKU 카운트, 마지막 크롤, stale·임베딩·브랜드매칭·채움률 집계. read-only. (079 갱신: material 컬럼 제거)';

GRANT EXECUTE ON FUNCTION admin_crawl_platform_stats() TO app_user;

COMMIT;
