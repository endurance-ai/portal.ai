-- instagram_scrapes: /dna 플로우용 인스타 프로필 스크랩 결과
-- 프로필 메타 1행 + 수집 이미지 N행(R2 복사본 URL 보관)

CREATE TABLE IF NOT EXISTS instagram_scrapes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle text NOT NULL,
  source text NOT NULL DEFAULT 'web_profile_info',
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed')),
  used_proxy boolean NOT NULL DEFAULT false,
  full_name text,
  biography text,
  profile_pic_r2_url text,
  profile_pic_original_url text,
  follower_count integer,
  following_count integer,
  post_count integer,
  is_private boolean DEFAULT false,
  is_verified boolean DEFAULT false,
  external_url text,
  category text,
  raw_data jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instagram_scrapes_handle ON instagram_scrapes (handle);
CREATE INDEX IF NOT EXISTS idx_instagram_scrapes_created_at ON instagram_scrapes (created_at DESC);

CREATE TABLE IF NOT EXISTS instagram_scrape_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_id uuid NOT NULL REFERENCES instagram_scrapes(id) ON DELETE CASCADE,
  order_index integer NOT NULL,
  shortcode text,
  r2_url text NOT NULL,
  original_url text,
  caption text,
  like_count integer,
  comment_count integer,
  taken_at timestamptz,
  is_video boolean DEFAULT false,
  width integer,
  height integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instagram_scrape_images_scrape_id
  ON instagram_scrape_images (scrape_id, order_index);

-- RLS: service_role만 접근 (admin API 전용). anon key 접근 차단.
ALTER TABLE instagram_scrapes ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_scrape_images ENABLE ROW LEVEL SECURITY;

-- 정책 없이 RLS만 켜면 service_role만 통과 (service_role은 RLS 우회 가능).
-- 명시적 deny-all 정책을 anon/authenticated에 적용.
DROP POLICY IF EXISTS "deny_all_anon" ON instagram_scrapes;
CREATE POLICY "deny_all_anon" ON instagram_scrapes
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_all_anon" ON instagram_scrape_images;
CREATE POLICY "deny_all_anon" ON instagram_scrape_images
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
