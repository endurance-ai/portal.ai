---
description: "기존 페이지 코드에 모바일 반응형을 추가/개선한다. Mobile-First Tailwind 패턴 적용."
---

# Make Responsive — portal.ai

## Role
기존 페이지 코드를 분석하고, Tailwind Mobile-First 반응형을 적용한다.
이미 반응형이 있는 부분은 건드리지 않고, 부족한 부분만 보완한다.

## 핵심 원칙
- **Mobile-First**: 기본 스타일 = 모바일, `md:` `lg:` = 확장
- **최소 변경**: 비즈니스 로직, 이벤트 핸들러, API 호출 절대 건드리지 않는다
- **기존 반응형 유지**: 이미 `md:`, `lg:` 적용된 부분은 수정하지 않는다

## Arguments
$ARGUMENTS

## 프로젝트 컨텍스트

- **Framework**: Next.js 16 (App Router), React 19, Tailwind v4
- **Font**: Roboto + Roboto Mono
- **유저단**: 영어 텍스트
- **어드민**: 한글 텍스트, 사이드바(md+) + 모바일 바텀탭(md 미만)

### 브레이크포인트
| 접두사 | 크기 | 대상 |
|--------|------|------|
| (없음) | 0px~ | 모바일 |
| `sm:` | 640px~ | 큰 폰 |
| `md:` | 768px~ | 태블릿 |
| `lg:` | 1024px~ | 노트북 |
| `xl:` | 1280px~ | 데스크탑 |

## Workflow

### Phase 1: 코드 분석
1. 대상 페이지 + 자식 컴포넌트 읽기
2. 현재 반응형 클래스 사용 현황 파악
3. 반응형이 없는 요소 식별:

| 요소 | 현재 클래스 | 필요한 변환 |
|------|-----------|-----------|
| ... | ... | ... |

### Phase 2: 변환 규칙 적용

#### 레이아웃
```
flex (가로)           → flex flex-col md:flex-row
grid grid-cols-{n}    → grid grid-cols-1 md:grid-cols-{n}
```

#### 크기/간격
```
text-2xl+ (제목)      → text-xl md:text-2xl
p-6+                  → p-4 md:p-6
gap-6+                → gap-4 md:gap-6
고정 너비             → w-full md:w-[값]
```

#### 표시/숨기기
```
테이블 보조 컬럼       → hidden md:table-cell
데스크탑 전용          → hidden md:block
모바일 전용            → md:hidden
긴 텍스트             → line-clamp-2 md:line-clamp-none
```

#### 테이블
```
넓은 테이블            → overflow-x-auto 래퍼
```

### Phase 3: 코드 수정
1. 변경 계획 → 사용자 확인
2. `Edit`으로 Tailwind 클래스만 수정

### Phase 4: 검증
1. 변경 파일 목록 + diff
2. 브레이크포인트별 예상:
   - 모바일 (< 768px): ...
   - 태블릿 (768px~): ...
   - 데스크탑 (1024px~): ...

## 변경하지 않는 것
- 비즈니스 로직, API 호출, 조건부 렌더링
- TypeScript 타입
- 이미 반응형이 적용된 클래스
- 모달/다이얼로그 내부
- 아이콘 크기 16px 이하

## 출력 형식

### 변경 계획
| 파일 | 요소 | 현재 | 변경 후 | 이유 |
|------|------|------|---------|------|

### 완료 보고
```
수정된 파일:
- src/app/.../component.tsx (N곳)

브레이크포인트별 예상:
- 모바일: ...
- 태블릿: ...
- 데스크탑: 변경 없음
```
