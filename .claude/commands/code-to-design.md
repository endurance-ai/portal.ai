---
description: "Code → Design 마이그레이션. 코드를 읽고 Pencil(.pen) 디자인을 현재 UI와 일치하도록 업데이트한다."
---

# Code → Design (Pencil) Migration — portal.ai

## Role
코드를 읽고, design.pen의 해당 페이지 프레임을 코드의 현재 UI 상태와 정확히 일치하도록 업데이트한다.

## 핵심 원칙
- **코드가 Source of Truth**: 항상 코드의 현재 상태를 기준으로 디자인을 맞춘다
- **추측 금지**: 반드시 코드를 읽고 스타일 코드, 컴포넌트 구조를 확인한 뒤 작업한다
- **최소 변경**: 이미 일치하는 부분은 건드리지 않는다. 차이점만 수정한다
- **Pencil MCP 도구만 사용**: .pen 파일은 Read/Grep이 아닌 Pencil MCP 도구로만 접근한다

## Arguments
$ARGUMENTS

## 프로젝트 디자인 시스템 (Phase 0 대체)

> 아래 정보가 이미 확정된 상태이므로 `get_variables()`, `get_style_guide_tags()`, `package.json` 확인 등을 스킵한다.

### 디자인 파일
- **경로**: `design.pen` (프로젝트 루트)
- **테마**: `{ "Mode": "Dark", "Base": "Zinc", "Accent": "Default" }`

### 색상 토큰 (Pencil 변수 → CSS → Tailwind)
| Pencil Variable | Hex (Dark/Zinc) | Tailwind Class |
|----------------|-----------------|----------------|
| `$--background` | `#09090B` | `bg-background` |
| `$--foreground` | `#FAFAFA` | `text-foreground` |
| `$--card` | `#18181B` | `bg-card` |
| `$--secondary` | `#27272A` | `bg-secondary` |
| `$--muted` | `#27272A` | `bg-muted` |
| `$--muted-foreground` | `#A1A1AA` | `text-muted-foreground` |
| `$--border` | `#27272A` | `border-border` |
| `$--on-surface-variant` | `#52525B` | `text-on-surface-variant` |
| `$--outline` | `#71717A` | `text-outline` |
| `$--primary-dim` | `#FFFFFF60` | `text-primary-dim` |
| `$--primary-container` | `#FFFFFF12` | `bg-primary-container` |
| `$--surface-dim` | `#0f0f12` | `bg-surface-dim` |

### 재사용 컴포넌트 ID
| 컴포넌트 | Pencil ID | 용도 |
|----------|-----------|------|
| Admin Sidebar | `540dt` | 어드민 사이드바 (7개 네비) |
| Admin Header | `fzm9X` | 어드민 헤더 바 |
| Metric Card | `yI1nR` | 숫자 카드 (label + value) |
| Product Card | `KK63K` | 상품 카드 (image + info) |
| Mood Badge | `UJ9ak` | 무드 태그 배지 |
| Status Badge | `jHbeW` | 상태 배지 (Pass 등) |
| Attribute Chip | `MkC2A` | 속성 칩 (Oversized Fit 등) |
| Color Swatch | `1Vthv` | 컬러 팔레트 원 |
| Filter Select | `3snHn` | 필터 드롭다운 |
| Filter Search | `KqA7Z` | 검색 인풋 |
| Terminal Line | `Vw6Qz` | 터미널 리드아웃 행 |
| Hotspot Dot | `qc2ZQ` | 이미지 핫스팟 번호 |

### 폰트 & 아이콘
- **Font**: Roboto (본문), Roboto Mono (숫자/코드)
- **Icons**: lucide-react (Pencil에서 `iconFontFamily: "lucide"`)
- **UI Library**: shadcn/ui + Tailwind v4

### 텍스트 규칙
- **유저단**: 영어 (해외 사이트 느낌)
- **어드민**: 한글 (영어 고유명사 유지)

### 파일 경로 패턴
- 유저 메인: `src/app/page.tsx`
- 어드민: `src/app/admin/{page}/page.tsx`
- 컴포넌트: `src/components/{domain}/{name}.tsx`
- 어드민 컴포넌트: `src/components/admin/{name}.tsx`

## Workflow

### Phase 1: 코드 분석
1. 대상 페이지의 `page.tsx` → 레이아웃 구조 파악
2. 자식 컴포넌트 → 실제 렌더링 확인
3. 스타일 코드(Tailwind 클래스)를 하나하나 읽고 시각적 속성 파악

### Phase 2: 디자인 현황 파악
1. `batch_get(nodeIds: [대상 프레임], readDepth: 3-4)` → 현재 디자인 노드 트리
2. `get_screenshot(nodeId)` → 현재 디자인 시각적 상태 캡처
3. 필요 시 하위 노드를 추가 `batch_get`으로 읽기

### Phase 3: 차이점 식별
체계적 비교:
- 레이아웃 구조 (flex 방향, gap, padding, justify, align)
- 텍스트 콘텐츠 (라벨, 플레이스홀더, 버튼 텍스트)
- 스타일링 (색상, 폰트 크기, 라운딩)
- 컴포넌트 형태 (배지, 아이콘, 카드)

각 차이점을 **(변경 전 / 변경 후 / 코드 근거)** 형태로 기록.

### Phase 4: 디자인 업데이트
1. `U(프레임ID, {placeholder: true})` → 작업 시작
2. `batch_design`으로 변경 적용 (최대 25 ops/call)
3. `U(프레임ID, {placeholder: false})` → 작업 완료

### Phase 5: 검증
1. `get_screenshot(프레임ID)` → 확인
2. 문제 발견 시 Phase 4로 돌아가 수정

## Tailwind → Pencil 변환 레퍼런스

### 레이아웃
| Tailwind | Pencil |
|----------|--------|
| `flex flex-col` | `layout: "vertical"` |
| `flex` / `flex-row` | `layout: "horizontal"` |
| `gap-{n}` | `gap: n*4` (gap-3=12, gap-4=16, gap-6=24) |
| `p-{n}` | `padding: n*4` |
| `px-{n} py-{m}` | `padding: [m*4, n*4]` |
| `justify-between` | `justifyContent: "space_between"` |
| `justify-center` | `justifyContent: "center"` |
| `items-center` | `alignItems: "center"` |
| `w-full` (flex child) | `width: "fill_container"` |
| `w-fit` | `width: "fit_content"` |
| `overflow-hidden` | `clip: true` |

### 타이포그래피
| Tailwind | Pencil |
|----------|--------|
| `text-[10px]` | `fontSize: 10` |
| `text-[11px]` | `fontSize: 11` |
| `text-xs` | `fontSize: 12` |
| `text-sm` | `fontSize: 14` |
| `text-base` | `fontSize: 16` |
| `text-lg` | `fontSize: 18` |
| `text-xl` | `fontSize: 20` |
| `text-2xl` | `fontSize: 24` |
| `font-medium` | `fontWeight: "500"` |
| `font-semibold` | `fontWeight: "600"` |
| `font-bold` | `fontWeight: "700"` |
| `font-extrabold` | `fontWeight: "800"` |
| `font-mono` | `fontFamily: "Roboto Mono"` |

### 라운딩
| Tailwind | Pencil |
|----------|--------|
| `rounded` | `cornerRadius: 4` |
| `rounded-md` | `cornerRadius: 6` |
| `rounded-lg` | `cornerRadius: 8` |
| `rounded-xl` | `cornerRadius: 12` |
| `rounded-2xl` | `cornerRadius: 16` |
| `rounded-full` | `cornerRadius: 9999` |

## 출력 형식

### 변경 내역
| 요소 | 변경 전 | 변경 후 | 코드 근거 |
|------|---------|---------|----------|
| {요소명} | {이전 상태} | {새 상태} | `파일:라인` |

### 확인된 일치 항목 (변경 불필요)
- {항목} ✓
