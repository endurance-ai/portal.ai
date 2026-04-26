# PORTAL — Design System

> 단일 디자인 시스템 문서. 새 페이지/컴포넌트 빌드 시 **반드시 이 문서를 먼저 읽고** 토큰과 규칙을 따른다.
> 참조 원본 스펙: `docs/archive/specs/2026-04-13-editorial-redesign-design.md`

---

## 1. Visual Theme & Atmosphere

Editorial — 패션 잡지 / 출판물 톤. 상품(garment)과 이미지가 주인공, UI는 뒤로 물러난다. 크롬 최소, 여백 풍부, 타이포그래피 주도.

- 참조: SSENSE × Mediabus × Apartamento × Fantastic Man
- 금지: 이모지, 그라디언트, 보라/네온 액센트, AI 슬롭 (3-col feature grid, blob 장식, rounded pill 남발)

## 2. Color Palette & Roles

| Token | Hex | Role |
|-------|-----|------|
| `--cream` | `#fafaf7` | 기본 배경 (종이톤) |
| `--ink` | `#111111` | 기본 텍스트, active nav, 워드마크, 강조 구분선 |
| `--ink-muted` | `#3a3a3a` | 본문 보조 텍스트 |
| `--stone` | `#7b7468` | 메타 (브랜드 속성, 라벨) |
| `--line` | `#d8d4ca` | 일반 구분선 |
| `--line-mute` | `#e0dcd0` | 얕은 구분선 (프로그레스 트랙) |
| `--ink-soft` | `#666666` | inactive nav, 보조 라벨 |
| `--ink-quiet` | `#888888` | placeholder, 희미한 메타 |

**원칙:** 유저 이미지·상품 이미지가 유일한 컬러 소스. UI 자체에는 색을 쓰지 않는다.

## 3. Typography Rules

**Family:** `Pretendard Variable` (EN 전용 · weight 400/500/600/700)

| Role | Size | Weight | Tracking | Line-height |
|------|------|--------|----------|-------------|
| Display (hero) | 76–86px | 500 + 700 mix | -0.045em | 0.96 |
| Section heading | 28px | 500 + 700 mix | -0.035em | 1.1 |
| Body | 15px | 400 / 600 | -0.01em | 1.55 |
| UI label | 13px | 500 / 600 | -0.01em | 1.4 |
| Meta | 12–13px | 500 | -0.01em | 1.5 |
| Wordmark | 16px | 600 | **0.32em (caps)** | — |
| Section marker | 14px | 500 / 700 | -0.01em | — |

**규칙:**
- 이탤릭 없음 (Pretendard는 이탤릭 미제공 → **굵기 대비**로 리듬)
- Display는 `500 + 700` 섞어 쓰기 (예: "The look you love, **piece by piece.**")
- Caps는 워드마크에만 (`PORTAL` tracked 0.32em)
- 섹션 마커는 로마 숫자 `I. II. III.`

## 4. Component Stylings

### 4.1 Wordmark
`PORTAL` · caps · weight 600 · letter-spacing 0.32em · 16px · `#111` (모바일 14px)

### 4.2 Navigation (top)
우측 정렬, gap 22px. 13px weight 500. Inactive `#666` · Active/Hover `#111`.

### 4.3 Hero input (underline)
`border-top: 1px solid #111` + `border-bottom: 1px solid #d8d4ca` · padding 18px 0 · placeholder `#888` · CTA "Begin →" 우측 weight 600 `#111`, `border-left: 1px solid #d8d4ca; padding-left: 16px`.

### 4.4 Section marker
`border-top: 1px solid #111` · padding-top 18px · margin-bottom 28px. 3-column: `I.` (w700) / title (w500) / date (w500, `#888`).

### 4.5 Product card
이미지 aspect 4:5. 하단: 브랜드 (w600/14) · 가격 (w500/13) **만**. 그 외 메타 hover에서만. Hover 시 매칭 이유 칩 상단 오버레이 + "View →" CTA 하단. 락된 카드: 좌상단 `LOCK` 뱃지 (cream bg, `#111`, 5px, 1px 3px).

### 4.6 Refine bar (sticky)
Pill (`border-radius: 999px`) · `border: 1px solid #111` · bg `#fafaf7` · padding 8px 12px. 하단 "TURN 02 / 05" 카운터 (6px, letter-spacing 0.05em, `#999`).

### 4.7 Feedback flow
업/다운 버튼: 유니코드 화살표 `↑` / `↓` (이모지 금지) · 28×28 사각 · border 1px `#d8d4ca` · 선택 시 bg `#111` color `#fafaf7`. 태그 2-col grid, 각 chip 사각 border 1px `#d8d4ca`, 선택 시 fill `#111`.

### 4.8 Agent progress (4-step)
bar 4개 · height 1.5px · gap 3px. 완료 `#111` · 미완료 `#d8d4ca`. 양끝 "01" / "04" (6px, w500, `#888`).

## 5. Layout Principles

- **Page padding (desktop):** 48–56px 좌우, 48px 상하
- **Hero grid:** `1.2fr 1fr` asymmetric · gap 64px · 헤드라인 왼쪽 / 캡션+입력 오른쪽
- **Result grid:** `0.9fr 1.1fr` · gap 56px · 이미지 왼쪽 (sticky) / 리스트 오른쪽
- **Agent step container:** max-width 640px 중앙, 수직 flow
- **Item list:** 상하 padding 16px, 구분선 1px `#d8d4ca`
- **Max content width:** 1280px (hero 1440px까지)

## 6. Depth & Elevation

**그림자 없음 · 블러 없음 · 오버레이 그라디언트 없음.**

레이어 분리는 `border-top` 1px만 (일반 `#d8d4ca`, 강조 `#111`).
Hover 변화는 `border-color` / `background` 전환 (150ms ease).

## 7. Do's and Don'ts

### ✅ Do
- 여백 풍부하게 · 한 화면에 중요한 1–2개만
- 영문 타이포그래피 주도 (KR은 후속)
- 번호 섹션 마커 ("I. A look, broken") 적극 사용
- 상품 카드는 **브랜드 + 가격만** 기본 노출
- 매칭 이유 · 스코어는 hover/click에서만 드러내기

### ❌ Don't
- 통계 노출 ("26,000+ items"), 플랫폼 로고 나열
- 이탤릭 · 세리프 (현재 패밀리는 Pretendard 하나)
- 그라디언트 · 블러 · 드롭섀도우
- 3-col feature grid · blob 장식 · 이모지
- 데이터가 있다고 전부 노출 — 상품이 우선
- 한글 병기 (EN 빌드 완료 후 별도 KR 트랙)

## 8. Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| Mobile `< 768px` | 1-column stack · hero 52px · 캡션/입력 아래로 이동 · hero grid 해제 |
| Tablet `768–1024px` | asymmetric 유지 · 폰트 -20% · hero 62px |
| Desktop `> 1024px` | 본 스펙 그대로 |

**Touch targets:** 44×44 최소 (chip/btn). Inline 링크 제외.

## 9. Agent Prompt Guide

새 페이지 / 컴포넌트를 만들 때 다음 규칙을 따른다.

### Quick reference
- **배경:** cream `#fafaf7`
- **텍스트:** ink `#111` (본문) · stone `#7b7468` (메타) · `#888` (quiet)
- **구분선:** 1px · 일반 `#d8d4ca` · 강조 `#111`
- **폰트:** `Pretendard Variable`, `-0.01 ~ -0.045em` letter-spacing
- **굵기 대비:** 500 (기본) ↔ 700 (강조) — 이탤릭 X
- **워드마크:** `PORTAL` caps tracked 0.32em

### Page scaffolding prompt
> "cream bg + Pretendard. 상단에 PORTAL wordmark (tracked caps) + 우측 nav. Hero는 `1.2fr 1fr` asymmetric grid · 86px display로 `500 + 700` 섞어 쓰기. 섹션 시작은 `I.` 로마 숫자 마커 + `border-top: 1px solid #111`. 상품 카드는 브랜드+가격만 기본 노출, 매칭 이유는 hover에서만. 통계/이모지/그라디언트/이탤릭 전부 금지."

### Component checklist
새 컴포넌트 작성 시 체크:
- [ ] 배경 `#fafaf7` · 텍스트 `#111` 쓰고 있는가?
- [ ] Pretendard 단일 패밀리만 쓰고 있는가?
- [ ] letter-spacing 음수 값 쓰고 있는가?
- [ ] border 1px solid 만으로 레이어 분리하고 있는가? (그림자 X)
- [ ] 호버 상태는 색 전환만 하고 있는가?
- [ ] 필요 이상의 메타/데이터가 노출되고 있지는 않은가?

### Anti-pattern (즉시 거부)
- `bg-gradient-*`, `drop-shadow-*`, `backdrop-blur-*`
- `font-italic`, `font-serif`
- 이모지 🔥 🚀 ✨ (텍스트 화살표 `→` `↑` `↓`는 허용)
- 3-column 카드 피처 그리드 with 아이콘 + 제목 + 설명 패턴
- "전부 가운데 정렬" 레이아웃 (비대칭 선호)

---

## References
- 원본 스펙 (상세): `docs/archive/specs/2026-04-13-editorial-redesign-design.md`
- Legacy (Digital Atelier): `docs/archive/DESIGN.legacy.md`
- Stitch design system 포맷: https://stitch.withgoogle.com/docs/design-md/format/
