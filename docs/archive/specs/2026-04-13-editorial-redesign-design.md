# Editorial Redesign — Design Spec

> 작성일: 2026-04-13
> 범위: portal.ai 유저-facing UI 전체 (Admin 제외)
> 레퍼런스: SSENSE, Workroom, Savee, Dribbble, Mediabus, Apartamento, Fantastic Man
> 이번 작업은 **presentation layer only** — 검색 엔진 / API / DB 스키마 전부 무변경

---

## 1. Visual Theme & Atmosphere

Editorial — 패션 잡지 / 출판물 톤. 상품(garment)과 이미지가 주인공, UI는 뒤로 물러남. 크롬 최소, 여백 풍부, 타이포그래피 주도.

- **분위기:** 침착하고 느림. 스펙/수치 자랑 금지
- **스파인:** SSENSE × Mediabus 에디토리얼 (장/절 구조 "I. II. III."로 리듬)
- **금지 패턴:** 이모지, 그라디언트, 보라/네온 액센트, AI 슬롭 (3-col feature grid, blob 장식, rounded pill 남발)

## 2. Color Palette & Roles

| 토큰 | Hex | 역할 |
|------|-----|------|
| `--cream` | `#fafaf7` | 기본 배경 (종이톤) |
| `--ink` | `#111111` | 기본 텍스트, active nav, wordmark, 강조 구분선 |
| `--ink-muted` | `#3a3a3a` | 본문 보조 텍스트 |
| `--stone` | `#7b7468` | 메타 (브랜드 속성, 라벨) |
| `--line` | `#d8d4ca` | 일반 구분선 (아이템/섹션 간) |
| `--line-mute` | `#e0dcd0` | 얕은 구분선 (프로그레스 트랙) |
| `--ink-soft` | `#666666` | inactive nav, 보조 라벨 |
| `--ink-quiet` | `#888888` | placeholder, 희미한 메타 |

**원칙:** 유저 이미지·상품 이미지가 유일한 컬러 소스. UI 자체에 색을 쓰지 않음.

## 3. Typography Rules

**Family:** Pretendard Variable (EN 전용으로 시작 — KR 버전은 후속)

| Role | Size | Weight | Tracking | Line-height |
|------|------|--------|----------|-------------|
| Display (hero) | 76–86px | 500 + 700 mix | -0.045em | 0.96 |
| Section heading | 28px | 500 + 700 mix | -0.035em | 1.1 |
| Body | 15px | 400 / 600 | -0.01em | 1.55 |
| UI label | 13px | 500 / 600 | -0.01em | 1.4 |
| Meta | 12–13px | 500 | -0.01em | 1.5 |
| Wordmark | 16px | 600 | 0.32em (caps) | — |
| Section marker | 14px | 500 / 700 | -0.01em | — |

**규칙:**
- 이탤릭 사용 안 함 (Pretendard 이탤릭 없음, **굵기 대비로 리듬**)
- Display는 `500 + 700` 섞어 쓰기 (예: "The look you love, **piece by piece.**")
- Caps는 워드마크에만 (`PORTAL` tracked 0.32em)
- 섹션 마커는 `I. II. III.` 로마 숫자

## 4. Component Stylings

### 4.1 Wordmark
- `PORTAL` · caps · weight 600 · letter-spacing 0.32em · 16px · `#111`
- 모바일에서 14px로 축소

### 4.2 Navigation (top)
- 우측 정렬, gap 22px
- 13px, weight 500, inactive `#666`, active `#111`, hover `#111`
- EN/KR 토글은 현재 "EN"만 표시 (KR 없음)

### 4.3 Hero input (underline)
- `border-top: 1px solid #111` + `border-bottom: 1px solid #d8d4ca`
- padding 18px 0, font-size 16px, placeholder `#888`
- 우측에 "Begin →" CTA — weight 600, `#111`, `border-left: 1px solid #d8d4ca`, `padding-left 16px`
- 파일 첨부는 placeholder "Describe a mood, or drop a photograph" 내에 포함

### 4.4 Section marker
- 상단 `border-top: 1px solid #111`
- padding-top 18px, margin-bottom 28px
- 3-column: `I.` (weight 700) / title (weight 500) / date/meta (weight 500, `#888`)

### 4.5 Product card (default)
- 이미지 aspect-ratio 4:5
- 이미지 아래: 브랜드 (weight 600, 14px) · 가격 (weight 500, 13px)
- **그 외 메타는 기본 숨김**
- Hover: 매칭 이유 칩 1–2개 상단 오버레이, "View →" CTA 하단, 이미지 scale(1.02)
- 선택된/락 카드: 좌상단 `LOCK` 뱃지 (cream bg, #111 text, 5px font-size, 1px 3px padding)

### 4.6 Refine bar (sticky)
- pill shape: `border-radius: 999px`
- `border: 1px solid #111`, bg `#fafaf7`
- padding 8px 12px, 7px font-size placeholder `#888` → submit `→` ink
- 하단 "TURN 02 / 05" 카운터 (6px, letter-spacing 0.05em, `#999`)

### 4.7 Feedback flow
- 업/다운 버튼: `↑` / `↓` 유니코드 화살표 (이모지 금지). 각 28×28 사각, border 1px `#d8d4ca`, font-size 13px
- 선택: bg `#111`, color `#fafaf7`
- 태그: 2-col grid, 각 chip 사각(border 1px `#d8d4ca`), 선택 시 fill `#111`
- 텍스트 입력: 섹션 마커 II. 아래 inline, border-top 1px `#111`

### 4.8 Agent progress
- 4개 bar (height 1.5px), gap 3px
- 완료: `#111`, 미완료: `#d8d4ca`
- 양끝 "01" / "04" 숫자 (weight 500, 6px, `#888`)

## 5. Layout Principles

- **Page padding (desktop):** 48–56px 좌우, 48px 상하
- **Hero grid:** `1.2fr 1fr` asymmetric, 64px gap. 헤드라인 왼쪽, 캡션+입력 오른쪽.
- **Result grid:** `0.9fr 1.1fr`, 56px gap. 이미지 왼쪽(sticky), 리스트 오른쪽.
- **Agent step container:** max-width 640px 중앙, 수직 flow.
- **Item list gutter:** 16px 상하 padding, 1px `#d8d4ca` 구분선.
- **Max content width:** 1280px (hero는 1440px까지 허용).

## 6. Depth & Elevation

**그림자 없음. 블러 없음. 오버레이 그라디언트 없음.**

- 레이어 분리는 `border-top` 1px만 (일반 `#d8d4ca`, 강조 `#111`)
- Hover 변화는 `border-color` 또는 `background` 0 → `#111` 전환 (duration 150ms, ease)

## 7. Do's and Don'ts

### ✅ Do
- 여백 풍부하게. 한 화면에 중요한 1–2개만.
- 영문 타이포그래피 주도 (KR은 후속).
- 번호 섹션 마커 ("I. A look, broken") 적극 사용.
- 상품 카드는 **브랜드 + 가격만** 기본 노출.
- 매칭 이유 / 스코어는 hover/click에서만 드러내기.

### ❌ Don't
- 통계 노출 ("26,000+ items"), 플랫폼 로고 나열.
- 이탤릭, 세리프 (현재 패밀리는 Pretendard 하나).
- 그라디언트, 블러, 드롭섀도우.
- 3-col feature grid, blob 장식, 이모지.
- 데이터가 있다고 전부 노출 — 상품이 우선.
- 한글 병기 (EN 빌드 완료 후 별도 KR 트랙).

## 8. Responsive Behavior

**Breakpoints:**
- **Mobile < 768px:** 1-column stack. Hero 52px, 캡션/입력 아래로. Hero grid 해제.
- **Tablet 768–1024px:** asymmetric 유지, 폰트 -20%, hero 62px.
- **Desktop > 1024px:** 본 스펙.

**Touch targets:** 44×44 최소 (chip/btn). Inline 링크 제외.

## 9. Screen Inventory

| # | Screen | Route | Replaces | Key behavior |
|---|--------|-------|----------|--------------|
| A1 | Home | `/` | 기존 hero | PORTAL wordmark · headline H1 · underline input. 통계 바/로고 나열 제거. |
| A2 | Analyzing | `/` (state) | Portal Warp 파티클 | 크게 "47" 퍼센트 + 얇은 progress line. "Reading the look — fabric, cut, proportion." |
| A3 | Result | `/result/[id]` | `LookBreakdown` (아코디언+hotspot+가로스크롤) | 2-col: sticky photo + 번호 리스트 5개. Hover에서만 상세. |
| B1 | Agent 1/4 | `/agent` | 기존 step-input | "Show us a look." + SearchBar 재사용. |
| B2 | Agent 2/4 | `/agent` | 기존 step-attributes | 파싱 item 2×2 grid, 1개 선택, 속성 칩 1–2개 락. |
| B3 | Agent 3/4 | `/agent` | 기존 step-refine | Tolerance 슬라이더 · 가격 min/max · 이유 4 chips. |
| B4 | Agent 4/4 | `/agent` | 기존 step-results | 3-col 상품 그리드, LOCK 칩 하나. 재탐색 버튼. |
| C1 | Empty results | `/result/[id]` | 기존 `empty-results` | 크게 "Nothing matched — yet." + 3 suggestion chips. |
| C5 | Refine bar | 공통 | 기존 `sticky-refine-bar` | pill 입력 + turn counter. |
| C6 | Feedback flow | `/result/[id]` | 기존 `feedback-flow` | ↑/↓ → 태그 grid → 선택적 text. |
| D3 | About | `/about` (신규) | — | 1-column 에세이, 섹션 번호. |
| D4 | Archive | `/archive` (신규) | — | 과거 분석 리스트 (번호+썸네일+제목+날짜). |

## 10. Root DESIGN.md (Stitch 포맷 동기 산출물)

이 스펙 확정 후 루트 `DESIGN.md`를 [Google Stitch 9-section 포맷](https://stitch.withgoogle.com/docs/design-md/format/)으로 작성. AI 에이전트가 "read DESIGN.md and follow"로 새 페이지 빌드 시 참조. 섹션 1–8은 본 스펙에서 추출, 섹션 9 (Agent Prompt Guide)는 별도 작성:

```md
# DESIGN.md
1. Visual Theme & Atmosphere — (§1 발췌)
2. Color Palette & Roles — (§2 table)
3. Typography Rules — (§3 table)
4. Component Stylings — (§4 8개 컴포넌트)
5. Layout Principles — (§5)
6. Depth & Elevation — (§6)
7. Do's and Don'ts — (§7)
8. Responsive Behavior — (§8)
9. Agent Prompt Guide — "새 페이지 만들 때: (a) cream bg + Pretendard, (b) hero는 asymmetric 1.2fr:1fr + 86px display mixed weight, (c) section은 roman numeral marker로 시작, (d) 상품 카드는 브랜드+가격만 기본, (e) 통계/이모지/그라디언트 금지"
```

기존 `docs/DESIGN.md` (Digital Atelier, legacy)는 `docs/DESIGN.legacy.md`로 archive.

## 11. NOT in scope

의도적으로 포함하지 않음:

1. **Admin (`/admin/*`)** — 별도 디자인 시스템. 한글+데이터 밀도 그대로.
2. **KR locale** — EN 먼저. KR 폰트·조판 별도 검토 후.
3. **Login / Signup / Payment** — 현재 서비스에 없음.
4. **로직 변경** — 검색 엔진 / API / DB 스키마 모두 무변경.
5. **shadcn/ui 전면 재작성** — 스타일 토큰 교체로 해결.
6. **고급 모션** — 기본 전환(150ms border/bg)만. framer-motion 활용도는 차기 스프린트.
7. **hotspot 인터랙션** — A3 번호 리스트로 전환 시 이미지 hotspot 제거 (복원이 필요하면 별도).
8. **서버 폰트 셀프호스트** — 이번은 jsdelivr CDN (Pretendard). `@next/font/local` 이관은 별도.

## 12. Open Questions (구현 플랜에서 확정)

1. **A3 hotspot 제거 확정?** 번호 리스트 전환 시 이미지 좌표 기반 hotspot 기능은 사라짐. 확정 필요.
2. **A2 percent 소스** — 현재 simulated ticker. 유지하는 것으로 가정.
3. **D3 / D4 라우트 추가 시 nav 업데이트** — Index · Archive · About · EN 4-항목 구조로.
4. **About 본문 copy** — 현재 mockup의 "PORTAL takes a single image..." 초안으로 가는지 별도 카피 작업할지.
5. **Archive 데이터 소스** — `analyses` 테이블 전체 vs 유저별 (인증 없으면 익명 전체? 또는 로컬스토리지 최근 20개?).
6. **Pretendard 서브셋 전략** — EN 전용이면 subset 경량화. 또는 KR 대비 풀셋 유지.
7. **framer-motion 잔존량** — 기존 hero/result에 있는 motion.div 진입 애니메이션 유지 vs 정적으로.

## 13. Success Criteria

구현 완료 후 검증:

- [ ] 12개 화면 모두 cream/ink 토큰 + Pretendard + tracked caps wordmark 일관 적용
- [ ] 홈에 통계/로고 나열 없음 (이전의 "26,000+ items" 같은 수치 삭제)
- [ ] 상품 카드 기본 상태에 브랜드+가격 외 메타 없음 (hover 시 드러남)
- [ ] A2 Portal Warp 파티클 제거, 숫자+line 방식으로 교체
- [ ] A3 아코디언/hotspot 제거, 번호 리스트로 전환
- [ ] Agent 4-step progress bar + "01/04" 숫자 표시
- [ ] About / Archive 라우트 신규 추가 및 nav 연결
- [ ] 기존 검색 / API / DB 동작 무손상 (smoke test)
- [ ] `DESIGN.md` (root) 9섹션 작성 완료
- [ ] `docs/DESIGN.md` → `docs/DESIGN.legacy.md` archive
- [ ] 모바일 (< 768px) 1-column stack 동작 확인
- [ ] lint 통과
