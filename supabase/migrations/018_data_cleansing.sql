-- 데이터 클렌징 — 검색 품질 저하 원인 데이터 수정

-- 1) fit에 'wide-pants'가 들어간 레코드 → fit을 'relaxed'로 보정
UPDATE product_ai_analysis
SET fit = 'relaxed'
WHERE fit = 'wide-pants';

-- 2) fit에 문자열 'null'이 들어간 레코드 → NULL로 보정
UPDATE product_ai_analysis
SET fit = NULL
WHERE fit = 'null';

-- 3) version이 'true'인 레코드 처리
--    같은 product_id로 이미 v1이 존재하면 → 중복이므로 삭제
DELETE FROM product_ai_analysis
WHERE version = 'true'
  AND product_id IN (
    SELECT product_id FROM product_ai_analysis WHERE version = 'v1'
  );
--    v1이 없는 나머지만 → v1으로 보정
UPDATE product_ai_analysis
SET version = 'v1'
WHERE version = 'true';

-- 4) brand가 '판매가 :'인 상품 → 빈 문자열로 보정 (sienneboutique 파싱 에러)
UPDATE products
SET brand = ''
WHERE brand = '판매가 :';

-- 5) 비표준 카테고리 정규화 (네비게이션 라벨이 카테고리로 들어간 경우)
UPDATE products
SET category = ''
WHERE category IN (
  'Selected Brands', 'Beslow', 'Beslow Purple', 'Slowboy',
  'BEST', 'NEW', 'Sale', 'Event', 'LOOKBOOK'
);
