-- 074_drop_dead_product_filter_assets.sql
-- SPEC-SEARCH-V6-001 P5 audit 청산 — get_product_filter_counts() 함수 폐기.
--
-- 배경:
--   069_drop_pai_and_v5_embedding_assets.sql 가 product_ai_analysis 테이블을
--   CASCADE drop 하면서 026 의 get_product_filter_counts() RPC 본문이 깨졌다.
--   069 헤더 주석:
--     "026 get_product_filter_counts() 본문은 PAI 참조 (late-bound, 추적되는
--      의존성 아님) — DROP 후에도 생존, 런타임에 깨짐 (audit, 위 참조)."
--
--   어드민 /admin/products 페이지가 이 RPC 를 호출해 "필터 옵션 로드 실패:
--   relation product_ai_analysis does not exist · migration 026 확인 필요"
--   배너를 띄우고 있었다.
--
-- 이 마이그가 하는 일:
--   * 깨진 RPC get_product_filter_counts() 를 DROP — 069 audit 항목 청산.
--   * 어드민 필터 옵션은 이제 products + style_nodes 직접 집계
--     (src/domains/admin-tools/products/products__filter-options.route.ts) +
--     동일 폼팩터의 count_products_by(p_column) RPC fast-path 로 동작.
--   * count_products_by(p_column) 는 platform / category 두 차원만 받는
--     단순 GROUP BY 집계 — 11만 row 전수 GROUP BY 가 무거우면 RPC 사용,
--     아니면 라우트의 fallback (전수 fetch + 클라이언트 그룹바이) 로 동작.
--
-- SCOPE GUARD:
--   * style_nodes / brand_nodes / products / product_embeddings 스키마는
--     변경하지 않는다. v6 가 의존하는 자산.
--   * 어드민 코드 (products.route.ts, products__id.route.ts, product-detail.tsx)
--     의 PAI 참조 제거는 같은 PR 의 애플리케이션 변경에서 수행됨.
--
-- Author: kiko.ai admin cleanup (2026-05-20)

BEGIN;

-- ── 1) 깨진 RPC 폐기 ──────────────────────────────────────
DROP FUNCTION IF EXISTS get_product_filter_counts();

-- ── 2) 신규 fast-path RPC: products 단일 컬럼 분포 ────────
-- p_column 은 화이트리스트 (platform / category) 만 허용해
-- 다이나믹 SQL 인젝션 표면을 닫는다. 그 외 입력은 NULL 반환.
CREATE OR REPLACE FUNCTION count_products_by(p_column text)
RETURNS TABLE (value text, count bigint)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_column = 'platform' THEN
    RETURN QUERY
      SELECT platform::text AS value, COUNT(*)::bigint AS count
        FROM products
       WHERE platform IS NOT NULL AND platform <> ''
       GROUP BY platform;
  ELSIF p_column = 'category' THEN
    RETURN QUERY
      SELECT category::text AS value, COUNT(*)::bigint AS count
        FROM products
       WHERE category IS NOT NULL AND category <> ''
       GROUP BY category;
  ELSE
    RETURN;
  END IF;
END;
$$;

COMMENT ON FUNCTION count_products_by(text) IS
  'SPEC-SEARCH-V6-001 P5: 어드민 /admin/products 필터 옵션용 단순 분포. '
  'p_column 화이트리스트 = {platform, category}. PAI 폐기 후 가벼운 대체.';

COMMIT;
