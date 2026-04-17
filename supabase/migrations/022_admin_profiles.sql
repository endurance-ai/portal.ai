-- admin_profiles: 어드민 승인 게이트
-- 회원가입 → pending 기본값, 관리자가 DB에서 직접 approved로 전환해야 접근 가능

CREATE TABLE IF NOT EXISTS admin_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_profiles_status ON admin_profiles (status);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION set_admin_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_profiles_updated_at ON admin_profiles;
CREATE TRIGGER trg_admin_profiles_updated_at
BEFORE UPDATE ON admin_profiles
FOR EACH ROW EXECUTE FUNCTION set_admin_profiles_updated_at();

-- 신규 가입자 자동 pending insert
CREATE OR REPLACE FUNCTION handle_new_admin_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.admin_profiles (user_id, status)
  VALUES (NEW.id, 'pending')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created_admin_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_admin_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_admin_user();

-- 기존 가입자 전부 approved로 백필 (마이그레이션 시점 기준)
INSERT INTO admin_profiles (user_id, status)
SELECT id, 'approved' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
