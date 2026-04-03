# Admin Dashboard Design Spec

> Fashion Genome 어드민 — 브랜드 DB 관리 + 분석 로그 + AI 품질 평가 허브

## Overview

portal.ai의 내부 운영 도구. 팀원 2~3명이 Fashion Genome DB를 관리하고, AI 분석 품질을 측정/개선하는 eval flywheel을 운영하기 위한 어드민 대시보드.

## Users

- 개발자 (나) + 기획자/데이터 담당자 1~2명
- 향후 유저 참여 확장 가능성 있으나 이번 스코프 아님

## Pages

### 1. `/admin/genome` — Fashion Genome DB

브랜드/노드 데이터를 조회, 검색, 필터링, 인라인 수정하는 테이블 UI.

**기능:**
- 노드 칩 필터 (A-1, A-2, ... K, ALL) — DB distinct 값 기반
- 브랜드명 텍스트 검색
- 카테고리/성별/가격대 드롭다운 필터
- 테이블: brand, node, attributes, gender, price band
- 인라인 수정: 셀 클릭 → 드롭다운/칩 선택 → 자동 저장
- 행 클릭 → 슬라이드 패널 (브랜드 상세 편집: attributes, 플랫폼, 메모)
- 엑셀 추출: 현재 필터 기준 xlsx 다운로드
- 브랜드 추가/삭제
- 하단 통계: 총 브랜드 수, 노드별 분포

**데이터 소스:** `brand_nodes` 테이블

### 2. `/admin/analytics` — 분석 로그 + 유저 활동

탭 2개로 구성.

**탭 Analyses:**
- 분석 이력 테이블: 시간, 썸네일, 노드, 아이템 수, DB hit rate, 소요시간
- 기간/노드/성별 필터
- 행 클릭 → `/admin/eval/[analysisId]`로 이동 (리뷰 가능)

**탭 Activity:**
- 집계 차트: 일별 분석 수 (bar), 성별 분포 (pie), 노드 분포 (bar)
- API 호출 로그 테이블: IP, User-Agent, endpoint, timestamp

**데이터 소스:** `analyses`, `api_access_logs` 테이블

### 3. `/admin/eval` — 품질 허브

Eval flywheel의 중심.

**상단: 자동 지표 카드**
- DB Hit Rate (자체 DB로 충족된 검색 비율)
- Precision@5 (리뷰된 결과 중 relevant 비율)
- Schema Valid Rate (JSON 구조 유효율)
- 리뷰 대기 건수

**하단: 리뷰 큐**
- 미리뷰/전체 필터, 최신순/오래된순 정렬
- 분석 결과 리스트: 썸네일, 시간, 노드(confidence), 아이템 수, 리뷰 버튼

**개별 리뷰 (`/admin/eval/[analysisId]`):**
- 좌: 업로드 이미지
- 우: AI 분석 결과 상세 (노드, 태그, 아이템별 검색 결과 + DB/SerpApi 구분)
- 평가: Pass / Fail / Partial (3단계)
- 코멘트 텍스트 필드
- Golden Set 추가 체크박스
- 저장 → `eval_reviews` 테이블

**데이터 소스:** `analyses`, `eval_reviews`, `eval_golden_set` 테이블

## Authentication

- Supabase Auth (이메일/비밀번호)
- 가입 → 로그인 → JWT session → middleware에서 검증
- 리프레시 토큰: Supabase `onAuthStateChange` 자동 처리
- 미인증 시 `/admin/login`으로 리다이렉트

## Tech Stack

- Next.js 16 App Router (`/admin/*` route group)
- Supabase Auth + supabase-ssr
- shadcn/ui 컴포넌트 적극 활용 (Table, Dialog, Sheet, Tabs, Badge, DropdownMenu)
- Tailwind 4 + 기존 B&W 디자인 토큰
- 차트: recharts (lightweight)
- 엑셀 추출: xlsx (이미 devDependencies에 있음)
- PWA: manifest.json + 메타태그 (홈화면 추가 + 풀스크린)

## Design

- 기존 portal.ai B&W Minimal과 동일 톤
- 다크모드 디폴트, 라이트모드 토글
- 모바일 반응형 필수 (사이드바 → 하단 탭바)
- Vercel 대시보드 스타일 레퍼런스

## DB Changes (New)

### 새 컬럼
- `brand_nodes.attributes` — JSONB, brand_attributes 구조

### 새 테이블
- `eval_reviews`: id, analysis_id (FK→analyses), reviewer_id, verdict (pass/fail/partial), comment, created_at
- `eval_golden_set`: id, image_url, expected_node_primary, expected_node_secondary, expected_items (JSONB), created_at, added_by
- `api_access_logs`: id, ip, user_agent, endpoint, method, status_code, duration_ms, created_at, analysis_id (nullable FK)

### brand_attributes 구조 (JSONB)
```json
{
  "silhouette": ["structured", "tailored"],
  "palette": ["monochrome"],
  "material": ["technical"],
  "detail": ["layered"],
  "vibe": ["japanese"]
}
```

Enum 값은 `data/enums.json`에 정의, 어드민 UI에서 칩 선택으로 편집.

## NOT in scope

- 유저 대면 기능 (어드민 전용)
- OAuth / 소셜 로그인
- 오프라인 캐싱 / 푸시 알림
- GA/Clarity 데이터 통합 조회
- 크롤러 관리 UI
- 상품(products) 테이블 CRUD (이번엔 읽기만)
- brand_attributes AI 배치 채우기 (별도 스크립트로 진행)
