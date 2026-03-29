-- MOODFIT Analysis Logs
-- Supabase Dashboard > SQL Editor에서 실행

create table if not exists analyses (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,

  -- 원본 이미지 (Supabase Storage URL 또는 base64 미포함)
  image_filename text,
  image_size_bytes int,

  -- AI 분석 원본 응답 (GPT-4o-mini)
  ai_raw_response jsonb not null,

  -- 파싱된 주요 필드 (쿼리 편의)
  mood_tags jsonb,           -- [{"label":"Street","score":92}, ...]
  mood_summary text,
  mood_vibe text,
  palette jsonb,             -- [{"hex":"#2E3336","label":"Charcoal"}, ...]
  style_fit text,
  style_aesthetic text,
  detected_gender text,

  -- 아이템별 검색 쿼리 & 결과
  items jsonb,               -- AI가 추출한 아이템 배열
  search_queries jsonb,      -- 실제 SerpApi에 보낸 쿼리들
  search_results jsonb,      -- SerpApi 응답 (스코어링 후)

  -- 메타
  analysis_duration_ms int,
  search_duration_ms int,
  error text
);

-- 시간순 조회용 인덱스
create index if not exists idx_analyses_created_at on analyses (created_at desc);

-- 성별/스타일별 필터링
create index if not exists idx_analyses_gender on analyses (detected_gender);
create index if not exists idx_analyses_aesthetic on analyses (style_aesthetic);
