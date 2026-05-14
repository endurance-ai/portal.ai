-- Fashion Genome 연동: 스타일 노드 + 감도 태그 컬럼 추가
-- analyses 테이블에 AI가 분류한 노드/태그 저장

alter table analyses
  add column if not exists style_node_primary text,
  add column if not exists style_node_secondary text,
  add column if not exists style_node_confidence numeric,
  add column if not exists sensitivity_tags jsonb;

-- 노드별 분석 조회용 인덱스
create index if not exists idx_analyses_style_node_primary
  on analyses (style_node_primary);

comment on column analyses.style_node_primary is '1순위 스타일 노드 ID (예: C, B-2, A-1) — fashion-genome.ts STYLE_NODES 참조';
comment on column analyses.style_node_secondary is '2순위 스타일 노드 ID';
comment on column analyses.style_node_confidence is '1순위 노드 신뢰도 (0.0~1.0)';
comment on column analyses.sensitivity_tags is '감도 태그 배열 (예: ["미니멀", "하이엔드"]) — fashion-genome.ts SENSITIVITY_TAGS 참조';
