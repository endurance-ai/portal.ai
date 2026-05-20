-- 078_admin_crawl_platform_stats.sql
-- 어드민 /admin/crawl 페이지용 플랫폼별 크롤 현황 집계 RPC.
--
-- 배경:
--   crawler 는 외부 리포 (endurance-ai/crawler) 에서 실행되고 DB 가 유일한 계약.
--   현재 어떤 플랫폼이 stale 한지 / 채움률이 떨어지는지 / 임베딩 진척이 어디까진지
--   한눈에 볼 수 있는 페이지가 없어서, 운영 판단을 매번 손으로 쿼리해서 함.
--
--   본 RPC 는 products / product_embeddings 두 테이블만 집계해서 플랫폼별
--   한 줄을 돌려준다 (Phase 1 = 모니터링 only, 트리거 X).
--
-- 출력 컬럼:
--   sku_count          전체 SKU 수 (해당 플랫폼)
--   in_stock_count     in_stock=true 수
--   last_crawled_at    MAX(crawled_at)
--   stale_count        crawled_at < now() - 30d 인 SKU 수
--   unembedded_count   product_embeddings 에 없는 SKU 수
--   unbranded_count    brand_node_id IS NULL 인 SKU 수
--   fill_description / fill_color / fill_material / fill_tags / fill_images
--     각 필드가 채워진 SKU 수 (채움률은 클라이언트가 sku_count 나눠서 계산)
--
-- Author: admin crawl monitor (2026-05-20)

BEGIN;

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
  fill_material bigint,
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
    COUNT(*) FILTER (WHERE p.material    IS NOT NULL AND p.material    <> '')::bigint  AS fill_material,
    COUNT(*) FILTER (WHERE p.tags        IS NOT NULL AND array_length(p.tags, 1)   > 0)::bigint  AS fill_tags,
    COUNT(*) FILTER (WHERE p.images      IS NOT NULL AND array_length(p.images, 1) > 0)::bigint  AS fill_images
  FROM products p
  LEFT JOIN product_embeddings pe ON pe.product_id = p.id
  WHERE p.platform IS NOT NULL AND p.platform <> ''
  GROUP BY p.platform
  ORDER BY MAX(p.crawled_at) DESC NULLS LAST;
$$;

COMMENT ON FUNCTION admin_crawl_platform_stats() IS
  '어드민 /admin/crawl 모니터링용 — 플랫폼별 SKU 카운트, 마지막 크롤, stale·임베딩·브랜드매칭·채움률 집계. read-only.';

COMMIT;
