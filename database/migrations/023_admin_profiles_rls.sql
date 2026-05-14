-- admin_profiles: middleware(authenticated role)에서 본인 row를 읽을 수 있도록 RLS 정책 추가
-- service_role은 RLS를 우회하므로 헬퍼/트리거/어드민 API는 영향 없음

ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own admin_profile" ON admin_profiles;
CREATE POLICY "read own admin_profile"
ON admin_profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
