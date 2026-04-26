# Eval Page Improvements

품질 평가 페이지 5가지 개선 + UX 보완

## 변경 대상 파일

| 파일 | 변경 |
|------|------|
| `src/components/admin/eval-queue.tsx` | 피드백 스택, 카드 고정 UI, turquoise 확인, verdict 필터 드롭다운 |
| `src/components/admin/eval-review-detail.tsx` | 중복 버그 수정, 핀을 카드 단위로 변경 |
| `src/app/admin/eval/page.tsx` | verdict 필터 state, 고정 카드 상단 표시 |
| `src/app/api/admin/eval/route.ts` | 복수 리뷰 반환, verdict 필터 파라미터, 고정 정렬 |
| `src/app/api/admin/eval/[analysisId]/route.ts` | 카드 고정 PATCH, POST 응답에 새 리뷰 반환 |
| `src/components/admin/eval-metrics.tsx` | verdict 분포 카운트 표시 |
| `supabase/migrations/016_analyses_pin.sql` | analyses.is_pinned 컬럼 추가 |

## 1. Pass turquoise 스타일 복원

현재 `VERDICT_CONFIG.pass`에 `text-turquoise`, `border-l-turquoise/60`, `bg-turquoise/10` 정의됨.
Tailwind 4 빌드에서 동적 클래스가 purge되거나, 투명도가 낮아 다크 배경에서 안 보일 가능성.

- 투명도 조정: `border-l-turquoise/60` -> `/80`, `bg-turquoise/10` -> `/15`
- safelist 또는 실제 렌더링 확인 후 조정

## 2. 카드에 피드백 스택 표시

### API 변경 (`/api/admin/eval` GET)
- `reviewMap`: analysis당 첫 번째만 -> **모든 리뷰 배열** 반환
- 응답 필드: `reviews: [{ verdict, comment, reviewer_email, created_at }]`
- 카드 상태 뱃지: 최신 리뷰 verdict 기준

### UI 변경 (`eval-queue.tsx`)
- 카드 하단에 피드백 스택 영역
- 최신순 정렬, 최대 3개 표시
- 각 행: reviewer (@ 앞만) + verdict 아이콘 + comment truncate
- 3개 초과 시 "+N개 더" 링크

## 3. 카드(분석) 단위 고정

### DB
- `analyses` 테이블에 `is_pinned BOOLEAN DEFAULT FALSE` 추가
- `eval_reviews.is_pinned`는 미사용 처리 (하위호환 유지, 삭제 안 함)

### API
- 리스트 GET: 완료 필터에서 `is_pinned = true` 항목 먼저 정렬
- 카드 고정 토글: `/api/admin/eval` PATCH (새 엔드포인트, analysisId + is_pinned)

### UI
- 카드에 고정 버튼 (Pin 아이콘), 완료 필터에서만 표시
- 고정 카드 상단 섹션: `border-turquoise/30` + Pin 아이콘
- 일반 카드와 구분선 ("고정됨 N개" 레이블)
- 상세 페이지: 리뷰 단위 핀 -> 카드 단위 핀으로 교체

## 4. 피드백 작성 시 중복 버그 수정

### 원인
`eval-review-detail.tsx:248`에서 `router.refresh()` 호출 -> 서버 컴포넌트 리렌더 -> `initialReviews` 갱신 + 클라이언트 `reviews` state 유지 -> 겹침

### 수정
- `router.refresh()` 제거
- POST 응답에서 새 리뷰 데이터 반환 (`{ success: true, review: { id, verdict, comment, ... } }`)
- 클라이언트에서 `setReviews(prev => [newReview, ...prev])` 로 직접 추가

## 5. 완료 탭 verdict 멀티셀렉트 필터

### UI (`eval/page.tsx`)
- "완료" 필터 선택 시 우측에 멀티셀렉트 드롭다운 등장
- 옵션: Pass / Fail / Partial (체크박스), 기본 전체 선택
- 선택 상태를 칩으로 표시

### API
- `verdicts` 쿼리 파라미터 추가 (쉼표 구분: `verdicts=pass,fail`)
- 완료 필터 + verdict 교차 필터링

## 6. UX 추가 개선

### 메트릭스 카드 verdict 분포
- 기존 Pass율 카드에 Fail/Partial 카운트 소수점 표시 추가
- 또는 4번째 카드를 분포 바 차트로 교체

### 피드백 작성자 구분
- 이메일 @ 앞 부분만 표시 (축약)

## NOT in scope

- eval_reviews.is_pinned 컬럼 삭제 (하위호환 유지)
- 골든셋 탭 변경
- 피드백 알림 시스템
- 리뷰 권한 분리 (누가 수정/삭제 가능한지)
