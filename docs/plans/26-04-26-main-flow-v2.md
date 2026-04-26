# 메인 플로우 v2 — 단일 슬라이드 / 단일 아이템 정밀 매칭

**작성일**: 2026-04-26
**수정일**: 2026-04-26 — Apify dry-run 완료, 응답 스키마 실측 반영, 결정 5 수정
**상태**: 설계 확정, 구현 진행 중
**의존**: ✅ Apify 토큰 (FREE plan, $5/월 credit)

## 배경

현행 메인 플로우는 두 가지 구조적 한계를 갖고 있다.

1. **TOO_OLD 문제** — `web_profile_info` 무로그인 엔드포인트는 owner의 최근 ~12개 포스트만 반환. 그보다 오래된 포스트는 fetch 불가.
2. **너무 넓은 매칭** — 슬라이드 N장 × 다중 아이템을 모두 분석하고 합쳐서 검색 → 사용자가 진짜 원하는 1개 아이템이 결과에 묻힘.

새 플로우는 **"사용자가 가리킨 1장의 슬라이드 → 검출된 아이템 중 1개 선택 → 그 1개에 정확히 좁힌 매칭"** 으로 전환한다. *최대한 좁혀서 찾아주는 게 베스트* 라는 원칙.

## 결정 사항 (확정)

1. **Apify `apify/instagram-post-scraper` + `run-sync-get-dataset-items` 채택** — 임의 post URL의 풀 데이터 fetch
2. **모든 슬라이드 + 메타 데이터를 R2/DB에 캐시** — 같은 shortcode 재요청 시 Apify 호출 스킵 (캐시 히트 → 즉시 반환)
3. **URL의 `?img_index=N` 파싱** — 인스타가 캐러셀 클릭 시 붙이는 표준 파라미터
4. **img_index 없으면 슬라이드 picker UI 노출** — 사용자가 직접 1장 선택
5. **Vision 프롬프트는 archived `src/lib/prompts/analyze.ts` 재활용** — 다중 아이템 검출 + isApparel 게이트 + enum 강제 + searchQuery 자동 생성. user prompt 한 줄만 "outfit photo" → "single image" 로 조정
6. **검출된 아이템 중 사용자가 1개 선택** — picker UI는 archived `_archive-qa/_qa/step-confirm.tsx` 패턴 재활용 (edit attrs 부분은 드롭, pure single-select)
7. **brandFilter 는 post-level taggedUsers + 캡션 @mentions** — Apify가 슬라이드별 태그를 보존하지 않음(2026-04-26 dry-run 확인). 슬라이드 narrowing은 Vision 검출 단일 아이템이 담당
8. **선택된 1개 아이템 query만 search-products에 투입** — `queries[]` 배열은 길이 1

## 새 플로우

```
post URL 입력 (img_index 있을 수도 / 없을 수도)
  ↓
[Step 1: scrape]
  shortcode 추출 → instagram_post_scrapes 캐시 조회
    cache HIT → DB에서 즉시 반환
    cache MISS → Apify run-sync (~10~30s) → R2 업로드 + DB insert
  ↓
[Step 2: slide select]
  URL에 img_index 있음 → 해당 슬라이드로 자동 점프
  없음 → 슬라이드 thumbnail 그리드 picker 노출 → 사용자 선택
  ↓
[Step 3: vision]
  선택된 1장에 archived analyze 프롬프트 적용
  → isApparel 게이트 + items[] 다중 검출 + styleNode + searchQuery
  ↓
[Step 4: item select]
  검출된 items[] 그리드 → 사용자가 1개 선택
  ↓
[Step 5: search]
  선택 아이템 query 1개 + 그 슬라이드의 tagged_users 만으로 brandFilter 빌드
  search-products in-process 호출 → strongMatches + general
  ↓
[Step 6: results]
  카드 그리드 + (이후) 리파인먼트 바
```

## 구현 작업 (단계별)

### Phase 1 — 인프라 / 데이터

| 작업 | 영향 |
|---|---|
| Apify 계정 + API token 발급 → `APIFY_TOKEN` 환경변수 추가 | `docs/infra/env.md` 업데이트 |
| `apify/instagram-post-scraper` actor ID + 입력 스키마 dry-run 확인 (단일 post URL 1건 호출 → 응답 필드 실측) | open item, 구현 전 필수 |
| `instagram_post_scrapes` / `instagram_post_scrape_images` 컬럼 보강 — Apify 응답 필드(예: `mediaType`, `coowners`, `productTags`)가 현 스키마에 없으면 컬럼 추가 마이그 030 | DB migration |

### Phase 2 — Backend

| 작업 | 변경 위치 |
|---|---|
| `parse-post-url.ts` 에 `imgIndex: number \| null` 파싱 추가 | `src/lib/instagram/parse-post-url.ts` |
| `post-client.ts` — Apify run-sync 클라이언트로 교체 (cache lookup → Apify fallback) | `src/lib/instagram/post-client.ts` 재작성 |
| `parse-post-response.ts` — Apify 응답 → `InstagramPostDetail` 매핑 함수 추가 | `src/lib/instagram/parse-post-response.ts` |
| `fetch-post` route — cache hit/miss 로직 + `imgIndex` 응답 포함 | `src/app/api/instagram/fetch-post/route.ts` |
| `analyze-post` route — `slideIndex` 파라미터 받아 단일 슬라이드만 Vision 호출 | `src/app/api/find/analyze-post/route.ts` |
| `run-vision.ts` — archived `analyze.ts` 프롬프트 채택, user prompt 단일 슬라이드용으로 조정 | `src/lib/analyze/run-vision.ts` + 새 `src/lib/prompts/single-slide-analyze.ts` |
| `find/search` route — `selectedItem` 1개 + `slideTaggedUsers` 1개의 슬라이드 입력 받기 | `src/app/api/find/search/route.ts` |

### Phase 3 — Frontend

| 작업 | 변경 위치 |
|---|---|
| 4-step state machine 재설계 (URL → fetch → slide pick? → item pick → results) | `src/app/_components/find-client.tsx` 재작성 |
| Slide picker UI — 캐러셀 슬라이드 thumbnail 그리드 + 클릭 선택 | 새 `src/app/_components/slide-picker.tsx` |
| Item picker UI — archived `step-confirm.tsx` 단순화 버전 (edit 드롭) | 새 `src/app/_components/item-picker.tsx` |
| Loading state — Apify ~10~30s 대기용 progress UX (cache hit 시 0초) | `find-client.tsx` 안 |
| Result + refinement 바 — 단일 아이템 base로 동작하도록 호출 시그니처만 조정 | 기존 `find-result.tsx` / `refinement-bar.tsx` 부분 수정 |

## archived 코드 활용 매핑

| 새 위치 | archived 출처 | 처분 |
|---|---|---|
| `src/lib/prompts/single-slide-analyze.ts` | `src/lib/prompts/analyze.ts` | 그대로 복사 + user prompt 한 줄 조정. position 좌표 필드는 단일 아이템 픽 모드에서 불필요 → 응답 스키마에서 드롭 검토 |
| `src/app/_components/item-picker.tsx` | `src/app/_archive-qa/_qa/step-confirm.tsx` | 그리드 + 선택 패턴 그대로. `editedItem` / `onEditAttr` 관련 코드 모두 드롭. `LOCKABLE_ATTRS`, `getOptionsForAttr` 의존 제거 |
| `AnalyzedItem` 타입 | `src/app/_archive-qa/_qa/types.ts` | 새 위치(`src/lib/find/types.ts` 신설)로 이전 + import 정리 |
| enum (`product-enums`, `enum-display-ko`, `season-pattern` 등) | `src/lib/enums/*` (이미 살아있음) | 그대로 사용 |

## 비용 추정 (실측)

| 항목 | 단가 | 월 부담 (100 scrapes/day, cache hit 30% 가정) |
|---|---|---|
| Apify `instagram-post-scraper` | **$0.0023/post** (PRICE_PER_DATASET_ITEM, 실측) | ~$5 (free credit 안에서 거의 cover) |
| GPT-4o-mini Vision (단일 슬라이드 × $0.003) | $0.003/post | ~$9 |
| **합계** | — | **~$10~15/월 POC** |

Apify FREE plan 월 $5 credit = **~2,173 scrape/월 무료**. POC 트래픽 (월 ~3,000) 가정 시 추가 ~$2 만 부담.
1k/day 트래픽 시 월 ~$70 → Starter plan 검토 시점.

## 성공 기준

- 임의의 post URL (TOO_OLD 였던 케이스 포함) → 풀 슬라이드 데이터 100% 수신
- `?img_index` 가 있는 URL → 사용자에게 슬라이드 picker 노출 안 됨 (자동 점프)
- 단일 슬라이드에서 의류 다중 검출 → top picker UX에서 1개 선택 가능
- 캐시 히트 시 latency < 1s, 미스 시 < 30s
- Apify 비용 월 $30 미만 (POC 트래픽 가정)

## NOT in scope

- ❌ Apify webhook + 비동기 폴링 (POC는 sync 5분 안에 끝남, 폴링은 그로스 단계 검토)
- ❌ Reels 지원 (`/reel/` URL은 `REEL_NOT_SUPPORTED` reject 유지)
- ❌ Stories / Highlights 스크래핑 (post 한정)
- ❌ 다중 아이템 동시 선택 (현 스펙은 정확히 1개 선택)
- ❌ 슬라이드 picker에서 여러 슬라이드 픽 (1개만 픽)
- ❌ 검색 엔진 v5 임베딩 전환 (이건 별개 plan, `26-04-23-embedding-rewrite-plan.md` 참조 — v2 메인 플로우는 v4 검색 위에서 동작)
- ❌ Vision 응답에 `position` 좌표 (단일 아이템 픽엔 불필요, 응답 스키마에서 드롭 가능)
- ❌ archived `_archive-qa/` 코드 일괄 삭제 (v2 안정화 후 별도 PR)

## Apify 응답 스키마 (실측, 2026-04-26)

### Actor 입력
```json
{
  "username": ["https://www.instagram.com/p/<shortcode>/"],
  "addParentData": false
}
```

> `username` 필드명은 misleading — username/profile URL/post URL 모두 같은 배열에 받음. post URL 1개 입력 시 `resultsLimit` 무시되고 그 1건만 반환.

### 단일 post 응답 (28 top-level 필드)

| 필드 | 타입 | 우리 사용 |
|---|---|---|
| `id` | string | `instagram_post_scrapes.ig_post_id` |
| `shortCode` | string | `instagram_post_scrapes.shortcode` (UNIQUE 캐시 키) |
| `url` | string | original IG URL |
| `type` | `"Image"` / `"Video"` / `"Sidecar"` | `mediaType` 매핑 |
| `productType` | `"feed"` / `"clips"` / `"igtv"` | Reel 감지 (`clips` → reject) |
| `caption` | string | `instagram_post_scrapes.caption` |
| `hashtags` | string[] | 자동 추출 (우리 파서 불필요) |
| `mentions` | string[] | 자동 추출 (자체 `extractCaptionMentions` 폐기 가능) |
| `taggedUsers` | object[] | post-level brandFilter 소스 |
| `childPosts` | object[] | 캐러셀 슬라이드 (Sidecar 일 때) |
| `displayUrl` | string | 단일 image/video 일 때 thumbnail |
| `images` | array | 비어있는 경우 많음, 신뢰 X — `displayUrl` 우선 |
| `dimensionsHeight`, `dimensionsWidth` | int | 슬라이드 dims |
| `videoUrl`, `videoDuration`, `videoPlayCount`, `videoViewCount` | — | Video/Reel 전용 |
| `audioUrl`, `musicInfo` | — | Reel 전용 |
| `commentsCount`, `likesCount`, `firstComment`, `latestComments` | — | engagement (현 시점 미사용) |
| `ownerUsername`, `ownerFullName`, `ownerId` | string | author 정보 |
| `timestamp` | ISO string | 작성 시각 |
| `alt` | string | IG 접근성 텍스트 — Vision 보조 컨텍스트 후보 |
| `inputUrl` | string | 우리가 보낸 URL echo |
| `isCommentsDisabled` | bool | (미사용) |

### `childPosts[]` 구조 (캐러셀 슬라이드)

```ts
{
  id: string,
  shortCode: string,    // 슬라이드 자체 shortcode (parent와 다름!)
  url: string,          // 슬라이드 URL
  type: "Image" | "Video",
  displayUrl: string,   // 슬라이드 이미지 (← 우리가 R2에 저장)
  alt: string,          // 슬라이드별 IG 접근성 텍스트
  dimensionsHeight: number,
  dimensionsWidth: number,
  // 그 외 필드 (caption, mentions 등)는 parent post 에 있고 여기는 null
}
```

### img_index 매핑

- IG URL `?img_index=N` 은 **1-indexed** (N=1 → 첫 슬라이드)
- 우리 코드: `childPosts[N - 1]` 로 매핑
- 단일 image/video post: `childPosts.length === 0`, `displayUrl` 직접 사용

### 슬라이드 한계 (확인됨)

- **per-slide `taggedUsers` 없음** — Apify가 모든 태그를 post-level로 평탄화. `childPosts[0].taggedUsers` 는 top-level 미러, 다른 슬라이드는 `None`
- → 결정 7 변경: **post-level brandFilter** 만 사용

### Latency 실측

| 입력 | 응답 시간 |
|---|---|
| 단일 post URL | **~5~10초** (cold) |
| username + resultsLimit=5 | ~25초 |

→ 우리 케이스 (단일 post)는 sync 5분 안에 충분히 끝남. `run-sync-get-dataset-items` 채택.

### API endpoint

```
POST https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items?timeout=120
Authorization: Bearer $APIFY_TOKEN
Content-Type: application/json
```

응답: HTTP 201 + dataset items (배열).

## Open items (남은 결정)

1. ~~**Apify 응답 스키마 dry-run 검증**~~ ✅ 2026-04-26 완료
2. **마이그 030 필요성** — Apify 응답 추가 필드 (`alt`, `productType`, 카운트들) 컬럼 추가할지 / 기존 `raw_data jsonb` 에 통째 저장할지. → **결정**: `raw_data` 에 전체 페이로드 저장 + 자주 쓰는 필드만 정규화 컬럼 (현 028 스키마 재사용 검토)
3. **에러 분류 재정리** — Apify가 주는 에러 → 새 코드 체계
   - `INVALID_URL` 유지
   - `REEL_NOT_SUPPORTED` 유지 (`/reel/` 파서 단계 reject + Apify 응답 `productType=clips` reject)
   - ~~`TOO_OLD`~~ → **삭제** (Apify가 임의 post 가능)
   - `PRIVATE` 유지 (Apify가 `error: "user is private"` 응답)
   - **신규** `APIFY_FAILED` (5분 타임아웃, 402, 네트워크 등)
   - **신규** `POST_NOT_FOUND` (삭제된 포스트, Apify 빈 응답)
4. **searchQuery 단일 아이템 모드 검증** — `queries[]` 길이 1 + 다양성 캡 (브랜드당 max 2, 플랫폼당 max 3) 동작 확인
5. **Vision 프롬프트 슬림화** — archived `analyze.ts` 의 mood/palette/styleNode 응답 그대로 둘지 / 아이템 picker만 필요하니 잘라낼지 (token/latency 절약)
6. **APIFY_TOKEN 회수** — 채팅에 평문 노출되었던 토큰 회수 + Vercel 환경변수에 새로 등록

## 참조

- archived analyze prompt: `src/lib/prompts/analyze.ts`
- archived item picker: `src/app/_archive-qa/_qa/step-confirm.tsx`
- archived AnalyzedItem 타입: `src/app/_archive-qa/_qa/types.ts`
- Apify 동기 API: `https://docs.apify.com/api/v2/act-run-sync-get-dataset-items-post`
- Apify Instagram Post Scraper: `https://apify.com/apify/instagram-post-scraper`
- 현행 메인 플로우 doc: `docs/features/main-flow.md` (v1)
- v5 검색 plan (별도): `docs/plans/26-04-23-embedding-rewrite-plan.md`
