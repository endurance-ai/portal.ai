# /find — Instagram 단일 포스트 스크래핑 전략

**작성일**: 2026-04-24
**브랜치**: `worktree-find-ig-post`
**컨텍스트**: `/dna`(프로필 스크래퍼) → `/find`(포스트 링크 → 상품 매칭)으로 포지션 전환. 리스크 검증 스파이크(Task #1) 결과.

## 엔드포인트 실측 결과 (2026-04-24, 무로그인)

| # | URL | 결과 | 비고 |
|---|---|---|---|
| A | `/p/<sc>/?__a=1&__d=dis` | 404 | 레거시 완전 dead |
| B | `/p/<sc>/embed/captioned` | 200 HTML | shell만, post data 없음 (async로드) |
| C | `/p/<sc>/embed/` | 200 HTML | B와 동일 |
| D | `i.instagram.com/api/v1/media/<id>/info/` | 302 → login | 세션쿠키 필수 |
| E | `www.instagram.com/api/v1/media/<id>/info/` | 302 → login | 동일 |
| F | `/p/<sc>/` | 200 SPA shell | SSR 상태에 post 없음 |
| G | POST `/api/graphql/` (doc_id 4종) | 200 `error:1357005` | LSD 토큰/세션 필요 |
| **H** | **`/api/v1/oembed/?url=...`** | **200 JSON** | **author_name(handle) + title(캡션 전체) + thumbnail_url 반환** |
| **I** | **`/api/v1/users/web_profile_info/?username=<handle>`** | **200 JSON** | **최근 ~12 포스트 full data — carousel children / tagged_users / caption 전부** |

## 확정 전략: oEmbed → Profile 체인

```
[포스트 URL]
   ↓ parseUrl (shortcode 추출, /reel/ reject)
[shortcode]
   ↓ oEmbed (~300ms)
[owner_handle + caption + thumbnail]
   ↓ web_profile_info(owner_handle) (~500ms)
[최근 12 포스트 배열]
   ↓ find by shortcode
[target post full data 또는 not_found]
```

### 제약

1. **owner의 최근 ~12개 포스트만 접근 가능**. 그 밖이면 `TOO_OLD` 에러.
2. 비공개 계정: 기존 프로필 스크래퍼와 동일하게 차단됨.
3. 동영상(릴스) URL: 파서에서 reject. 스펙 확정대로.
4. IG 레이트리밋: 프로필 스크래퍼 경험상 공격적으로 안 막히지만, 트래픽 오르면 프록시 필수.

### 얻을 수 있는 데이터 (샘플: @patagonia 카르셀 4장)

- `shortcode`, `owner_handle`, `typename` (GraphImage / GraphSidecar)
- `caption` (전체 텍스트, @멘션/해시태그 포함)
- carousel `children[]` — 각각 `display_url`, `edge_media_to_tagged_user.edges[].user.username`, dimensions
- 댓글/좋아요 count

### 태그된 브랜드 파이프라인

1. 캡션에서 `@handle` 정규식 추출 (`/@[a-zA-Z0-9._]+/g`)
2. carousel 각 slide의 `edge_media_to_tagged_user.edges[].user.username` 추출
3. 합집합을 `brand_nodes` 테이블의 `ig_handle` 컬럼(or `name`)과 매칭 — 매칭된 브랜드 `id[]`가 `/api/search-products`의 `brandFilter`에 투입됨

## 구현 스펙 (Task #2 ~ #7에 그대로 반영)

### DB 스키마 (Task #2)
- `instagram_post_scrapes`: id(uuid), shortcode(unique), owner_handle, caption, media_type('image'|'sidecar'|'video'), tagged_users(jsonb), raw_data(jsonb), status, error_message, created_at
- `instagram_post_scrape_images`: scrape_id(fk), order_index, r2_url, original_url, width, height, tagged_users(jsonb, slide별)
- RLS deny-all (기존 프로필 스크랩 테이블과 동일)

### API (Task #3)
- `POST /api/instagram/fetch-post` — body `{input: string}` (URL 또는 shortcode 수용)
- 파서 로직: `parsePostUrl` 신규 (기존 `parseHandle`은 프로필용으로 유지)
- 에러 코드: `INVALID_URL`, `REEL_NOT_SUPPORTED`, `TOO_OLD`, `PRIVATE`, `NOT_FOUND`, `BLOCKED`, `NETWORK`
- 기존 `/api/instagram/fetch`의 R2 복사 / SSRF allowlist / ProxyAgent 레이어 그대로 재사용

### 병렬 분석 (Task #4)
- 이미지 N장(최대 10) → `/api/analyze` 병렬 호출
- 비용: 10장 × $0.003 = $0.03/게시물, 레이턴시 p50 ~20s 예상 (기존 단일 analyze가 3~5s)
- 서버에서 병렬 fan-out이 타임아웃(Vercel 60s) 위험 → **클라이언트 fan-out + 결과 스트리밍** 권장

### 검색 API (Task #5)
- `brandFilter: string[]` 신규 파라미터 → `WHERE brand_id IN (...)` 하드필터
- 응답을 `{strongMatches: Product[], general: Product[]}` 로 분리
- v5 임베딩 전환 시에도 brandFilter는 pgvector 쿼리 앞단 prefilter로 이식

### 비의류 게이트 (Task #7)
- `/api/analyze` 시스템 프롬프트에 `isApparel: boolean` 필드 추가 요청
- false일 때 프론트에서 "that's not clothes, babe" 스타일 친절 에러

## NOT in scope

- ❌ 릴스 / 비디오 분석 — M1 제외 (프레임 추출/Vision 10콜 과부하)
- ❌ 로그인 세션 쿠키 / 프록시 필수 전환 — 막히면 추가
- ❌ 제품 상세 화면 — 외부 구매처 리다이렉트 유지
- ❌ 실시간 재고/사이즈 — 크롤 스냅샷 수준
- ❌ owner 12개 밖 포스트 지원 — 파라미터드 query_hash 페이지네이션 필요, 추후
