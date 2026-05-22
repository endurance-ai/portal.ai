-- 087_drop_public_flow_tables.sql
-- 공개 IG "snitch" 메인플로우 + analytics/user-voice 어드민 제거에 따른 테이블 정리.
-- app 을 admin 전용으로 축소 (2026-05-22). 코드 삭제는 동일 PR 에 포함.
--
-- ─── DROP 대상 ───────────────────────────────────────────────
--   [1] instagram_post_scrape_images  — 메인플로우(/api/instagram, /api/find) 전용. admin 미사용.
--   [2] instagram_post_scrapes        — 동일. (images → scrapes 순서로 drop)
--   [3] search_quality_logs           — analytics + pipeline-health 만 읽었음(둘 다 삭제). ai 리포 0.
--                                       2026-05-10 이후 write 중단 stale.
--   [4] user_feedbacks                — user-voice(삭제) read + /api/feedback(삭제) write. ai 0.
--   [5] analysis_sessions             — /api/analyze(레거시, 삭제) write + user-voice(삭제) read.
--
-- ─── analyses / analysis_items (참고) ───────────────────────
--   087 시점엔 /admin/eval 가 읽어 유지했으나, 동일 PR 의 089 에서 eval 페이지 제거와
--   함께 DROP 됨. (writer /api/analyze 도 제거 → 신규 row 0). 신규 환경 재현 시 085→089
--   순서 적용하면 본 087 단계에선 잔존, 089 에서 최종 제거됨.
--   - analyses.session_id / parent_analysis_id / refinement_prompt / sequence_number
--     컬럼은 analysis_sessions 제거 후 dangling 이지만 FK 없음. 본 마이그에서 미건드림
--     (eval read 컬럼 아님 — 추후 별도 정리 가능).
--
-- 검증(pg_constraint): analyses_session_id_fkey(analyses→analysis_sessions) 선제거 필요 →
--   본 마이그에서 ALTER TABLE analyses DROP CONSTRAINT 로 처리. user_feedbacks_session_id_fkey
--   는 user_feedbacks 를 먼저 drop 해 자동 해소. instagram images→scrapes FK 는 순서로 해소.
--   ai 리포 grep 0.
-- Author: admin-only 전환 (2026-05-22)

BEGIN;

-- images → scrapes 순서 (FK instagram_post_scrape_images_scrape_id_fkey).
DROP TABLE IF EXISTS instagram_post_scrape_images;
DROP TABLE IF EXISTS instagram_post_scrapes;

-- search_quality_logs / user_feedbacks 는 analyses·analysis_sessions 로의 outgoing FK 를
-- 가지나, 테이블 drop 시 함께 제거됨. user_feedbacks 를 analysis_sessions 보다 먼저 drop →
-- user_feedbacks_session_id_fkey 자동 해소.
DROP TABLE IF EXISTS search_quality_logs;
DROP TABLE IF EXISTS user_feedbacks;

-- analyses(유지)가 analysis_sessions 로 거는 FK 를 먼저 떼야 drop 가능.
-- (analyses.session_id 컬럼은 088 에서 제거 — 여기선 제약만 선제거)
ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_session_id_fkey;
DROP TABLE IF EXISTS analysis_sessions;

COMMIT;

-- ─── 적용 후 검증 (수동) ─────────────────────────────────────
--   SELECT to_regclass('public.instagram_post_scrapes');   -- NULL
--   SELECT to_regclass('public.instagram_post_scrape_images'); -- NULL
--   SELECT to_regclass('public.search_quality_logs');      -- NULL
--   SELECT to_regclass('public.user_feedbacks');           -- NULL
--   SELECT to_regclass('public.analysis_sessions');        -- NULL
