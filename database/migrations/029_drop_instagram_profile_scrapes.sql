-- /dna 라우트 제거에 따라 instagram 프로필 스크랩 테이블 정리
-- migration 025에서 생성된 instagram_scrapes / instagram_scrape_images 드랍
-- /find 플로우는 instagram_post_scrapes(028) 테이블을 별도로 사용 → 영향 없음

DROP TABLE IF EXISTS instagram_scrape_images;
DROP TABLE IF EXISTS instagram_scrapes;
