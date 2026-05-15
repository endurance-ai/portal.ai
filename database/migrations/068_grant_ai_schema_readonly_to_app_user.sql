-- 068_grant_ai_schema_readonly_to_app_user.sql
-- app_user (Next.js db.ts pg Pool) 에게 ai 스키마 READ-ONLY 권한 부여.
--
-- 배경:
--   ai 스키마는 endurance-ai/ai-server (Alembic 관리, owner=ai_user) 의 운영 데이터.
--   card_impression / log_conversation_event / user_taste_profile / user_session.
--   어드민 "AI 인사이트" 페이지가 통계/조회 (read-only) 하려면 app_user 의
--   SELECT 권한 필요. 현재 ai_user 만 권한 보유.
--
-- 안전:
--   - SELECT only. INSERT/UPDATE/DELETE/TRUNCATE 부여 안 함.
--   - ai-server 의 쓰기 경로에 영향 없음.
--   - ALTER DEFAULT PRIVILEGES 로 ai_user 가 향후 만드는 새 테이블도 자동 SELECT.
--
-- Author: AI 인사이트 어드민 (2026-05-15)

BEGIN;

GRANT USAGE ON SCHEMA ai TO app_user;
GRANT SELECT ON ALL TABLES IN SCHEMA ai TO app_user;

-- ai-server (ai_user) 가 이후 생성하는 테이블도 app_user 가 자동 SELECT
ALTER DEFAULT PRIVILEGES FOR ROLE ai_user IN SCHEMA ai
  GRANT SELECT ON TABLES TO app_user;

COMMIT;
