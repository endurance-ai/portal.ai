---
description: "Design → Code 마이그레이션. Pencil(.pen) 디자인 변경사항을 읽고 실제 코드에 반영한다."
---

# Design → Code (Pencil) Migration — portal.ai

## Role
design.pen의 디자인 변경사항을 읽고, 해당 페이지의 코드를 디자인과 일치하도록 업데이트한다.

## 핵심 원칙
- **디자인이 Source of Truth**: Pencil 디자인의 현재 상태를 기준으로 코드를 맞춘다
- **스타일만 동기화**: 스타일/JSX 구조/아이콘만 변경. 비즈니스 로직은 절대 건드리지 않는다
- **동적 데이터 보존**: 디자인의 정적 텍스트를 코드의 동적 바인딩으로 바꾸지 않는다
- **Pencil MCP 도구만 사용**: .pen 파일은 Read/Grep이 아닌 Pencil MCP 도구로만 접근한다

## 변경하는 것 vs 변경하지 않는 것

### 변경 O
- Tailwind 스타일 (색상, 간격, 폰트, 라운딩, 그림자)
- Flex/Grid 레이아웃 (방향, 정렬, gap)
- 아이콘 종류/크기, 컴포넌트 추가/제거, 테이블 컬럼

### 변경 X
- useState, useEffect, useCallback 등 훅 로직
- onClick, onChange 등 이벤트 핸들러
- API 호출, 조건부 렌더링, map() 반복, 기존 TypeScript 타입 필드

## Arguments
$ARGUMENTS

## 프로젝트 디자인 시스템 (Phase 0 대체)

### 디자인 파일
- **경로**: `design.pen` (프로젝트 루트)
- **테마**: `{ "Mode": "Dark", "Base": "Zinc", "Accent": "Default" }`

### 색상 토큰 (Pencil → Tailwind)
| Pencil Variable | Tailwind Class |
|----------------|----------------|
| `$--background` | `bg-background` |
| `$--foreground` | `text-foreground` |
| `$--card` | `bg-card` |
| `$--secondary` | `bg-secondary` |
| `$--muted-foreground` | `text-muted-foreground` |
| `$--border` | `border-border` |
| `$--on-surface-variant` | `text-on-surface-variant` |
| `$--outline` | `text-outline` |

### 폰트 & 아이콘
- Roboto → 기본 (Tailwind 기본 sans)
- Roboto Mono → `font-mono`
- lucide-react → `iconFontFamily: "lucide"` 매핑

### 텍스트 규칙
- **유저단**: 영어
- **어드민**: 한글 (영어 고유명사 유지)

### 파일 경로 패턴
- 유저 메인: `src/app/page.tsx`
- 어드민: `src/app/admin/{page}/page.tsx`
- 컴포넌트: `src/components/{domain}/{name}.tsx`

## Workflow

### Phase 1: 디자인 분석
1. `batch_get(nodeIds: [대상 프레임], readDepth: 4)` → 노드 트리
2. `get_screenshot(nodeId)` → 시각적 상태 캡처
3. 구조 메모: 레이아웃, 색상, 간격, 폰트, 아이콘

### Phase 2: 코드 분석
1. 대상 `page.tsx` + 자식 컴포넌트 읽기
2. 현재 스타일/구조 파악

### Phase 3: 차이점 식별
디자인의 각 노드를 코드 JSX와 매핑. 차이점을 **(디자인 값 → 코드 변경사항 / 파일:라인)** 형태로 기록.

### Phase 4: 코드 수정
1. 변경 계획을 사용자에게 보여주고 확인
2. `Edit` 도구로 스타일 코드 수정
3. 새 import 추가 필요 시 함께 수정

### Phase 5: 검증
1. 빌드/타입 체크 (`pnpm build`)
2. 변경 파일 목록과 diff 요약

## Pencil → Tailwind 변환 레퍼런스

### 레이아웃
| Pencil | Tailwind |
|--------|----------|
| `layout: "vertical"` | `flex flex-col` |
| `layout: "horizontal"` | `flex` |
| `gap: N` | `gap-{N/4}` |
| `padding: N` | `p-{N/4}` |
| `padding: [V, H]` | `px-{H/4} py-{V/4}` |
| `justifyContent: "space_between"` | `justify-between` |
| `alignItems: "center"` | `items-center` |
| `width: "fill_container"` | `w-full` |
| `clip: true` | `overflow-hidden` |

### 타이포그래피
| Pencil | Tailwind |
|--------|----------|
| `fontSize: 12` | `text-xs` |
| `fontSize: 14` | `text-sm` |
| `fontSize: 16` | `text-base` |
| `fontSize: 18` | `text-lg` |
| `fontSize: 20` | `text-xl` |
| `fontSize: 24` | `text-2xl` |
| `fontWeight: "500"` | `font-medium` |
| `fontWeight: "600"` | `font-semibold` |
| `fontWeight: "700"` | `font-bold` |

### 라운딩
| Pencil | Tailwind |
|--------|----------|
| `cornerRadius: 6` | `rounded-md` |
| `cornerRadius: 8` | `rounded-lg` |
| `cornerRadius: 12` | `rounded-xl` |
| `cornerRadius: 9999` | `rounded-full` |

### 반응형 (Mobile-First)
| Desktop 디자인 | 코드 |
|---------------|------|
| 가로 배치 | `flex flex-col md:flex-row` |
| 2열 그리드 | `grid grid-cols-1 md:grid-cols-2` |
| 큰 제목 | `text-xl md:text-2xl` |
| 넓은 패딩 | `p-4 md:p-6` |

## 출력 형식

### 변경 계획 (수정 전 확인)
| 파일 | 라인 | 변경 내용 | 디자인 근거 |
|------|------|----------|------------|

### 변경 완료 보고
```
수정된 파일:
- src/app/.../component.tsx (N곳)
```
