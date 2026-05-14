-- instagram_post_scrapes: /find 플로우용 단일 포스트 스크랩 결과
-- 스크래핑 경로: oEmbed(owner handle 획득) → web_profile_info(full post data) — 리서치는 docs/plans/26-04-24-find-ig-post-scraping.md
-- 포스트 메타 1행 + 캐러셀 slide N행(R2 복사본 URL 보관)

CREATE TABLE IF NOT EXISTS instagram_post_scrapes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortcode text NOT NULL,
  owner_handle text NOT NULL,
  owner_full_name text,
  media_type text NOT NULL CHECK (media_type IN ('image', 'sidecar', 'video')),
  caption text,
  -- 캡션 @멘션 + carousel 전 slide의 tagged_users 머지. [{username, full_name, source: 'caption'|'tag', slide_index?}]
  mentioned_users jsonb NOT NULL DEFAULT '[]'::jsonb,
  like_count integer,
  comment_count integer,
  taken_at timestamptz,
  source text NOT NULL DEFAULT 'profile_walk'
    CHECK (source IN ('profile_walk', 'direct', 'graphql')),
  status text NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'partial', 'failed')),
  used_proxy boolean NOT NULL DEFAULT false,
  error_code text,
  error_message text,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 같은 shortcode 중복 스크랩 허용(실패 재시도 기록), 단 성공 결과는 application 단에서 upsert 하도록 처리.
CREATE INDEX IF NOT EXISTS idx_instagram_post_scrapes_shortcode
  ON instagram_post_scrapes (shortcode);
CREATE INDEX IF NOT EXISTS idx_instagram_post_scrapes_owner_handle
  ON instagram_post_scrapes (owner_handle);
CREATE INDEX IF NOT EXISTS idx_instagram_post_scrapes_created_at
  ON instagram_post_scrapes (created_at DESC);

CREATE TABLE IF NOT EXISTS instagram_post_scrape_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_id uuid NOT NULL REFERENCES instagram_post_scrapes(id) ON DELETE CASCADE,
  order_index integer NOT NULL,
  r2_url text NOT NULL,
  original_url text,
  width integer,
  height integer,
  is_video boolean NOT NULL DEFAULT false,
  -- 해당 slide에 태깅된 유저. [{username, full_name}]
  tagged_users jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scrape_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_instagram_post_scrape_images_scrape_id
  ON instagram_post_scrape_images (scrape_id, order_index);

-- RLS: service_role 전용 (어드민/서버 API만 읽음). anon/authenticated deny-all.
ALTER TABLE instagram_post_scrapes ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_post_scrape_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_anon" ON instagram_post_scrapes;
CREATE POLICY "deny_all_anon" ON instagram_post_scrapes
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_all_anon" ON instagram_post_scrape_images;
CREATE POLICY "deny_all_anon" ON instagram_post_scrape_images
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
