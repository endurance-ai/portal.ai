-- v5 cleanup: 임베딩 불가능한 product row 정리
--
-- 동기:
--   * Supabase Free 0.5GB 한도 (현재 479MB / 96%) 도달
--   * 22개 platform (총 ~45.7k SKU, 전체 56%) 이 임베딩 0% 인 상태
--   * 동시에 이들의 images 컬럼이 사실상 NULL/빈 배열 → 임베딩 영구 불가
--   * v5 검색에서 이 row 들은 dense path 후보가 절대 안 됨
--   * 향후 재크롤링 시 다시 채워지므로 일단 삭제 후 회수
--
-- 삭제 조건 (OR):
--   A. 0% 임베딩 platform 22개 (product_embedding_coverage 뷰 기준)
--   B. images IS NULL OR images[1] IS NULL OR array_length(images, 1) IS NULL
--      (PostgREST 와 부합 — images 가 비었으면 임베딩 자체가 불가능)
--
-- CASCADE:
--   * product_ai_analysis.product_id → CASCADE (012) — 자동 정리
--   * product_reviews.product_id   → CASCADE (019) — 자동 정리
--   * v4 폴백 (portal/app /api/search-products) 은 product_ai_analysis 에서
--     이미 NULL 인 row 들을 무시하므로 사용자 영향 없음
--
-- ⚠ 디스크: 단순 DELETE 는 dead tuple 만 만들고 실제 디스크는 안 줄어듬.
--   VACUUM FULL 은 별도 단계로 분리 — Supabase Free 임시 공간 부족 위험.
--   일단 일반 VACUUM 으로 페이지 재사용 가능하게 표시 → 향후 임베딩 추가가
--   기존 dead tuple 자리에 들어감.

BEGIN;

-- 사전 측정 — 로그로 남김 (Supabase SQL Editor 결과창에 보임)
DO $$
DECLARE
  n_total int;
  n_match int;
BEGIN
  SELECT count(*) INTO n_total FROM products;
  SELECT count(*) INTO n_match
    FROM products
    WHERE platform IN (
      'swallowlounge','sculpstore','triplestore','adekuver','etcseoul',
      '8division','havati','shopamomento','fr8ight','slowsteadyclub',
      'beslow','takeastreet','anotheroffice','eastlogue','chanceclothing',
      'mardimercredi','roughside','bastong','sienneboutique','blankroom',
      'iamshop','visualaid'
    )
    OR images IS NULL
    OR array_length(images, 1) IS NULL
    OR images[1] IS NULL;
  RAISE NOTICE 'BEFORE: total=% ・ to_delete=%', n_total, n_match;
END $$;

-- 메인 삭제
DELETE FROM products
WHERE platform IN (
  'swallowlounge','sculpstore','triplestore','adekuver','etcseoul',
  '8division','havati','shopamomento','fr8ight','slowsteadyclub',
  'beslow','takeastreet','anotheroffice','eastlogue','chanceclothing',
  'mardimercredi','roughside','bastong','sienneboutique','blankroom',
  'iamshop','visualaid'
)
OR images IS NULL
OR array_length(images, 1) IS NULL
OR images[1] IS NULL;

-- 사후 측정
DO $$
DECLARE
  n_after int;
  n_pai int;
  n_rev int;
BEGIN
  SELECT count(*) INTO n_after FROM products;
  SELECT count(*) INTO n_pai FROM product_ai_analysis;
  SELECT count(*) INTO n_rev FROM product_reviews;
  RAISE NOTICE 'AFTER: products=% ・ product_ai_analysis=% ・ product_reviews=%',
    n_after, n_pai, n_rev;
END $$;

COMMIT;

-- 통계 갱신 (ANALYZE 는 트랜잭션 내부에서 실행 가능)
ANALYZE products;
ANALYZE product_ai_analysis;
ANALYZE product_reviews;

-- ⚠ VACUUM / VACUUM FULL 은 트랜잭션 안에서 실행 불가능.
--    Supabase SQL Editor 가 스크립트 전체를 트랜잭션으로 감싸므로 별도 단일 쿼리로 실행해야 함.
--    아래 명령을 SQL Editor 의 새 쿼리에 한 줄씩 (또는 한 번에) 붙여넣기:
--
--    -- 1단계: 일반 VACUUM (dead tuple 재사용 가능하게 표시 — 즉시 디스크 회수 X)
--    VACUUM products;
--    VACUUM product_ai_analysis;
--    VACUUM product_reviews;
--
--    -- 2단계 (선택): VACUUM FULL — 실제 디스크 회수
--    --   * 테이블 rewrite → 임시로 기존 사이즈만큼 추가 공간 필요
--    --   * Free 0.5GB 한도라 실패 가능. 사이즈 여유 확인 후 시도.
--    --   * ACCESS EXCLUSIVE 락 → 검색 일시 차단
--    -- VACUUM FULL products;
--    -- VACUUM FULL product_ai_analysis;
--    -- REINDEX TABLE products;
