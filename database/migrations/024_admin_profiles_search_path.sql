-- SECURITY DEFINER 함수는 search_path를 고정해야 schema-injection 공격을 막을 수 있음
-- 022에서 만든 handle_new_admin_user()에 search_path 잠금 적용

ALTER FUNCTION handle_new_admin_user() SET search_path = public, pg_temp;
