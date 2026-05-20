-- 082_fix_v6_category_join_verbatim.sql
-- search_products_v6 의 inner JOIN ON 절 정정 — verbatim 매칭으로 변경.
--
-- 배경:
--   migration 073 의 search_products_v6 본문 안에서 3 개 rung 모두 다음 패턴을 사용:
--     LEFT JOIN category_canonical cc
--       ON lower(trim(cc.raw_category)) = lower(trim(p.category))
--
--   category_canonical 은 products.category 의 distinct verbatim snapshot 으로
--   seed 됨 (예: "JERSEY" / "Jersey" / "jersey" 셋 다 각각 row 로 존재). 위 JOIN
--   은 cc.raw_category 컬럼 자체에 lower(trim()) 을 적용해 비교하므로 한 product
--   row 가 같은 normalize 값을 가진 cc row N 개에 매칭 → N 배 fanout.
--
--   증상 — 어드민 v6 검색 디버거 결과 테이블에 같은 product_id 가 2~3 번 중복
--   반환 (확인된 사례: 6300, 9958, 53443, ...). production 봇 검색 결과 카드도
--   동일 fanout 발생.
--
--   원인 분석 — cc 데이터는 의도된 verbatim 매핑 (752 distinct products.category
--   각각이 row 1 개). 잘못된 건 inner JOIN 의 ON 절: products.category 컬럼은
--   cc.raw_category 와 같은 원천이라 verbatim 1:1 매칭이 충분 (그리고 정확).
--   `lower(trim())` 정규화는 사용자가 제공하는 p_category 인자에 대해서만
--   필요 (v_target_family lookup 단계).
--
-- 이 마이그가 하는 일:
--   * search_products_v6 본문의 3 곳 inner JOIN ON 절을
--       lower(trim(cc.raw_category)) = lower(trim(p.category))
--     →
--       cc.raw_category = p.category
--     로 변경.
--   * v_target_family 결정 lookup (p_category 인자 → family) 의 `lower(trim())`
--     는 그대로 유지 — Vision/agent 가 임의 case 로 보낼 수 있어 정규화 필요.
--   * 시그니처 / 리턴 컬럼 / ladder 구조 / cosine 정렬 무변경 — PostgREST
--     schema reload 불필요.
--
-- 영향 검증 (post-commit 권장):
--   -- 디버거에서 dup id 0 확인
--   SELECT COUNT(*) AS total, COUNT(DISTINCT id) AS distinct_ids
--   FROM search_products_v6(
--     (SELECT embedding FROM product_embeddings LIMIT 1),
--     NULL, 'JERSEY', NULL, NULL, 30);
--   -- total = distinct_ids 여야 정상.
--
-- Author: kiko.ai admin cleanup (2026-05-20, v6 fanout fix)

BEGIN;

CREATE OR REPLACE FUNCTION search_products_v6(
  query_embedding   halfvec(768),
  p_style_node_id   bigint  DEFAULT NULL,
  p_category        text    DEFAULT NULL,
  p_subcategory     text    DEFAULT NULL,
  p_brand_names     text[]  DEFAULT NULL,
  p_limit           int     DEFAULT 30
)
RETURNS TABLE (
  id            bigint,
  brand         text,
  name          text,
  price         integer,
  image_url     text,
  product_url   text,
  platform      text,
  subcategory   text,
  distance      double precision,
  degraded      boolean
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_target_family text := NULL;
  v_node_count    integer := 0;
  v_node_fam_cnt  integer := 0;
BEGIN
  -- ── p_category → family lookup (정규화 유지) ──────────────────────
  -- p_category 는 호출자(Vision/agent/admin)가 임의 case 로 보낼 수 있어
  -- lower(trim()) 정규화로 cc 의 매칭 row 한 개를 찾는다 (LIMIT 1 이므로
  -- fanout 없음). cc 가 verbatim seed 라 모든 변형이 들어있어 매칭이 안정.
  IF p_category IS NOT NULL THEN
    SELECT cc.family INTO v_target_family
    FROM category_canonical cc
    WHERE lower(trim(cc.raw_category)) = lower(trim(p_category))
    LIMIT 1;
    IF v_target_family IS NULL THEN
      v_target_family := 'other';
    END IF;
  END IF;

  -- family gate 는 v_target_family 가 구체 family 일 때만 작동.
  -- NULL → p_category 미지정 / 'other' → 매핑 없음 둘 다 gate 비활성.

  -- ── rung 1 count: EXACT node + family gate ────────────────────────
  IF p_style_node_id IS NOT NULL THEN
    SELECT count(*) INTO v_node_fam_cnt
    FROM products p
    JOIN brand_nodes bn ON bn.id = p.brand_node_id
    JOIN product_embeddings pe ON pe.product_id = p.id
    LEFT JOIN category_canonical cc
      ON cc.raw_category = p.category   -- 082: verbatim 매칭
    WHERE bn.primary_style_node_id = p_style_node_id
      AND p.in_stock = true
      AND (
        p_category IS NULL
        OR v_target_family IS NULL
        OR v_target_family = 'other'
        OR COALESCE(cc.family, 'other') = v_target_family
      )
      AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
      AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names));
  END IF;

  IF p_style_node_id IS NOT NULL AND v_node_fam_cnt > 0 THEN
    -- ── rung 1: EXACT node + family gate (NOT degraded) ────────────
    RETURN QUERY
      SELECT p.id, p.brand, p.name, p.price, p.image_url, p.product_url,
             p.platform, p.subcategory,
             (pe.embedding <=> query_embedding)::double precision AS distance,
             false AS degraded
      FROM products p
      JOIN brand_nodes bn ON bn.id = p.brand_node_id
      JOIN product_embeddings pe ON pe.product_id = p.id
      LEFT JOIN category_canonical cc
        ON cc.raw_category = p.category   -- 082: verbatim 매칭
      WHERE bn.primary_style_node_id = p_style_node_id
        AND p.in_stock = true
        AND (
          p_category IS NULL
          OR v_target_family IS NULL
          OR v_target_family = 'other'
          OR COALESCE(cc.family, 'other') = v_target_family
        )
        AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
        AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names))
      ORDER BY pe.embedding <=> query_embedding ASC, p.created_at DESC
      LIMIT p_limit;
    RETURN;
  END IF;

  -- ── rung 2: node filter dropped, family gate KEPT (degraded) ─────
  SELECT count(*) INTO v_node_count
  FROM products p
  JOIN product_embeddings pe ON pe.product_id = p.id
  LEFT JOIN brand_nodes bn ON bn.id = p.brand_node_id
  LEFT JOIN category_canonical cc
    ON cc.raw_category = p.category       -- 082: verbatim 매칭
  WHERE p.in_stock = true
    AND (
      p_category IS NULL
      OR v_target_family IS NULL
      OR v_target_family = 'other'
      OR COALESCE(cc.family, 'other') = v_target_family
    )
    AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
    AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names));

  IF v_node_count > 0 THEN
    RETURN QUERY
      SELECT p.id, p.brand, p.name, p.price, p.image_url, p.product_url,
             p.platform, p.subcategory,
             (pe.embedding <=> query_embedding)::double precision AS distance,
             true AS degraded
      FROM products p
      JOIN product_embeddings pe ON pe.product_id = p.id
      LEFT JOIN brand_nodes bn ON bn.id = p.brand_node_id
      LEFT JOIN category_canonical cc
        ON cc.raw_category = p.category   -- 082: verbatim 매칭
      WHERE p.in_stock = true
        AND (
          p_category IS NULL
          OR v_target_family IS NULL
          OR v_target_family = 'other'
          OR COALESCE(cc.family, 'other') = v_target_family
        )
        AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
        AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names))
      ORDER BY pe.embedding <=> query_embedding ASC, p.created_at DESC
      LIMIT p_limit;
    RETURN;
  END IF;

  -- ── rung 3: node + family BOTH dropped (still degraded) ──────────
  RETURN QUERY
    SELECT p.id, p.brand, p.name, p.price, p.image_url, p.product_url,
           p.platform, p.subcategory,
           (pe.embedding <=> query_embedding)::double precision AS distance,
           true AS degraded
    FROM products p
    JOIN product_embeddings pe ON pe.product_id = p.id
    LEFT JOIN brand_nodes bn ON bn.id = p.brand_node_id
    WHERE p.in_stock = true
      AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
      AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names))
    ORDER BY pe.embedding <=> query_embedding ASC, p.created_at DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION search_products_v6 IS
  'v6 embedding-first retrieval (SPEC-SEARCH-V6-001 §4/§13 + 073 family '
  'gate + 082 verbatim JOIN fix). FILTER1 EXACT primary_style_node → '
  'FILTER2 canonical FAMILY (category_canonical, verbatim raw_category JOIN '
  '— 082 으로 fanout 제거) + in_stock + embedding → cosine `<=>` ASC, '
  'created_at DESC tie. Ladder F: rung1 node+family (degraded=false) → '
  'rung2 node dropped/family kept (degraded=true) → rung3 cosine-only.';

COMMIT;
