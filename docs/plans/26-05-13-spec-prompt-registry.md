# SPEC-PROMPT-REGISTRY-001 — VLM Prompt DB Registry

**Status**: Draft
**Created**: 2026-05-13
**Depends on**: SPEC-NODE-REDESIGN-001
**Blocks**: SPEC-BRAND-NODE-001, SPEC-SEARCH-V6-001

---

## 1. 문제

VLM/Vision prompt 가 코드/텍스트 파일 3곳에 박혀있고 enum 정의가 중복. drift 위험 + 튜닝마다 deploy.

**현재 분포:**
| 파일 | 용도 | 크기 |
|---|---|---|
| `scripts/local/pai_backfill/prompt.txt` | PAI 백필 (VLM 이미지 분석) | 8,248 char |
| `src/lib/prompts/analyze.ts` | Vision 분석 (사용자 IG 업로드) | TS const |
| `src/lib/prompts/prompt-search.ts` | 검색 쿼리 파싱 | TS const |

**문제 결과:**
- 같은 enum (mood/color/fabric/style_node) 가 3곳에 중복 → 한 곳만 수정 시 drift
- prompt 튜닝 시 코드 변경 → PR → review → deploy 필요 (느림)
- A/B 테스트 불가 (코드에 한 버전만 박힘)
- 변경 이력/사유 추적 불가 (git diff 만으로는 부족)

---

## 2. 목표

1. **단일 진실의 원천 (DB)**: 모든 prompt 를 `prompts` 테이블로 이전.
2. **상황별 분리**: `situation` enum 으로 (vision-analyze / pai-backfill / search-parse / brand-vlm 등).
3. **버저닝 + A/B**: 동일 situation 내 여러 version, `is_active=true` 1개.
4. **Placeholder 시스템**: `{{NODES_BLOCK}}`, `{{MOOD_ENUM}}`, `{{COLOR_ENUM}}` 등 런타임 fetch.
5. **Admin CRUD**: `/admin/prompts` 에서 편집 + 활성 toggle.
6. **감사 로그**: 변경 시 누가/언제/왜 (notes).

---

## 3. Acceptance Criteria

- **AC-001**: `prompts` 테이블 생성 후, 4개 situation 의 active row INSERT (vision-analyze, pai-backfill, search-parse, brand-vlm).
- **AC-002**: 런타임 호출 시 `getActivePrompt(situation)` API 가 placeholder 치환된 최종 prompt 문자열 반환.
- **AC-003**: Placeholder 명세는 `placeholders` jsonb 컬럼에 schema 로 정의 — `{nodes: "from style_nodes v7", mood_enum: "static array"}`.
- **AC-004**: 같은 situation 내 `is_active=true` 가 동시에 2개 이상이면 INSERT/UPDATE rejected (DB constraint).
- **AC-005**: `scripts/local/pai_backfill/prompt.txt` → DB row 로 이전. 파일은 read-only 백업으로 archive.
- **AC-006**: `src/lib/prompts/analyze.ts`, `prompt-search.ts` 의 const → DB fetch wrapper 로 교체.
- **AC-007**: Admin UI 에서 prompt UPDATE 후 30초 이내 다음 VLM 호출에 반영 (cache TTL).
- **AC-008**: A/B 테스트 모드 — `is_active=false` 인 variant 를 명시적 flag (`?prompt_variant=X`) 로 호출 가능 (admin/test 한정).

---

## 4. Schema

```sql
-- 052_prompts.sql
CREATE TABLE prompts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  situation    text NOT NULL,                 -- 'vision-analyze' | 'pai-backfill' | 'search-parse' | 'brand-vlm'
  version      text NOT NULL,                 -- 'v1', 'v2', ... (per situation)
  is_active    boolean NOT NULL DEFAULT false,
  system_md    text NOT NULL,                 -- 시스템 prompt (placeholder 포함)
  user_md      text NOT NULL,                 -- 유저 prompt template
  placeholders jsonb NOT NULL DEFAULT '{}',   -- {nodes_block: {source: 'style_nodes', version: 'v7'}, ...}
  model_id     text,                          -- 권장 모델 (선택, e.g. 'us.amazon.nova-lite-v1:0')
  max_tokens   integer DEFAULT 700,
  temperature  numeric(3,2) DEFAULT 0.0,
  notes        text,                          -- 변경 이유
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- situation 별 active row 1개 unique
CREATE UNIQUE INDEX idx_prompts_active_per_situation
  ON prompts(situation) WHERE is_active = true;

CREATE INDEX idx_prompts_situation_version ON prompts(situation, version);
```

---

## 5. 런타임 조립 로직

```ts
// src/lib/prompts/registry.ts
import { cache } from "react"  // 5분 TTL cache

const fetchActivePrompt = cache(async (situation: PromptSituation) => {
  const row = await db.from("prompts")
    .where({ situation, is_active: true })
    .single()
  return row
})

export async function buildPrompt(
  situation: PromptSituation,
  variables?: Record<string, string>
): Promise<{ system: string; user: string; model_id?: string; max_tokens: number }> {
  const tmpl = await fetchActivePrompt(situation)
  const placeholders = await resolvePlaceholders(tmpl.placeholders)
  // {{NODES_BLOCK}} → style_nodes 테이블 fetch + format
  // {{MOOD_ENUM}} → static enum string
  // {{...custom}} → variables override
  const merged = { ...placeholders, ...(variables ?? {}) }
  return {
    system: render(tmpl.system_md, merged),
    user: render(tmpl.user_md, merged),
    model_id: tmpl.model_id,
    max_tokens: tmpl.max_tokens,
  }
}

function render(tmpl: string, vars: Record<string, string>): string {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}
```

**Placeholder 종류:**

| Placeholder | Resolver |
|---|---|
| `{{NODES_BLOCK}}` | `style_nodes` v7 active rows → markdown block |
| `{{MOOD_ENUM}}` | static (legacy, optional) |
| `{{COLOR_ENUM}}` | static array → CSV |
| `{{FABRIC_ENUM}}` | static array |
| `{{NODE_KEYWORDS}}` | per node, joined keywords |
| `{{TARGET_NODE}}` | runtime variable (검색 시 사용자가 어떤 node 원하는지) |

---

## 6. 구현 단계

**P1**: 마이그레이션 + seed
- 052_prompts.sql
- 현재 `prompt.txt` 를 분해해서 system_md / user_md / placeholders 추출 → INSERT 'pai-backfill' v1
- analyze.ts / prompt-search.ts 도 동일하게 INSERT

**P2**: TS wrapper + cache
- `src/lib/prompts/registry.ts` 구현
- 5분 React `cache` + 명시적 invalidate API

**P3**: 호출처 교체
- `scripts/local/pai_backfill/run_*.py` — Python 에서 DB fetch (httpx 로 PostgREST 호출). 또는 빌드 시점 dump → file
- `src/app/api/analyze/route.ts` — `buildPrompt('vision-analyze', { target_node })` 형태
- `src/app/api/search-products/route.ts` — 동일

**P4**: Admin UI
- `/admin/prompts` — situation 필터, version 비교 (diff 표시), is_active toggle
- 편집 시 syntax highlight (markdown), preview rendered output

**P5**: A/B / 검증
- `?prompt_variant=v2` query param 으로 비활성 prompt 호출 (admin only)
- 변경 후 24시간 같은 input set 으로 비교

---

## 7. Out of Scope

- Backfill script 의 Python 측 placeholder 처리 — 별도 helper script 또는 빌드 dump 결정 (P3 시점에 정함)
- Streaming prompt 변경 → 일단 모든 prompt 는 1-shot

---

## 8. Risks

| Risk | 완화 |
|---|---|
| Python script 가 PostgREST 호출하면 의존성 증가 | 빌드 시점에 prompt 파일 dump 옵션 제공 |
| Cache miss 시 매 호출 DB fetch → latency | 5분 cache, miss 시 fallback to last-known-good in memory |
| 잘못된 placeholder ({{X}} 미해결) | render 시 raw `{{X}}` 그대로 → VLM 응답 noise. validator 추가 |
| A/B 변형이 production 으로 새는 사고 | `is_active=true` unique constraint + variant flag admin-only |
