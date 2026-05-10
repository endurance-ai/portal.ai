---
type: project
updated: 2026-05-04
---

# kiko.ai — 제품 개요

## 한 줄 설명

"Paste any Instagram post. We'll tell you where to buy the fit."
Instagram 포스트 URL 하나로 룩을 분해하고, 한국 패션 자사몰 32개 ~81k SKU에서 매칭 상품을 추천한다.

## 핵심 가치 제안

패션 인플루언서의 룩을 따라 사고 싶을 때 사용자는 브랜드를 모르거나, 알더라도 상품 검색에 시간이 걸린다. kiko.ai는 Instagram 포스트 URL 한 장을 입력받아 Vision AI로 아이템을 감지하고, v4 가중합 검색(10개 차원)으로 실제 구매 가능한 상품 링크까지 연결한다. 별도 앱 설치 없이 웹에서 즉시 사용할 수 있다.

## 타겟 사용자

| 사용자 그룹 | 설명 |
|---|---|
| 메인 — 패션 소비자 | Instagram 카루셀 포스트를 보고 비슷한 상품을 찾고 싶은 사용자 |
| 어드민 — 내부 운영자 | 브랜드 Genome 관리, 검색 품질 평가(Eval), 크롤 커버리지 확인, 어드민 대시보드 사용자 |

## 현재 마일스톤

| 우선순위 | 작업 | 상태 |
|---|---|---|
| Priority High | 검색엔진 v6 고도화 (v5 임베딩 풀배치 + dense/sparse 통합 쿼리) | 진행 중 |
| Priority High | 어드민 자체평가 시스템 구축 (골든셋 + NDCG + LLM-as-judge) | 미구축 |
| Priority Medium | FashionSigLIP 81k SKU 풀배치 실행 | 인프라 완료, 미실행 |
| Priority Medium | LiteLLM 프록시 재가동 | 현재 OFF |

## 메인 사용자 플로우

```
사용자 입력: Instagram 포스트 URL
       ↓
[Step 1] /api/instagram/fetch-post
  - shortcode 추출 → DB 캐시 조회 (instagram_post_scrapes)
  - 캐시 MISS → Apify instagram-post-scraper 호출 (~5-10s, $0.0023/post)
  - 이미지 → Cloudflare R2 복사
       ↓
[Step 2] 슬라이드 picker UI
  - ?img_index=N 파라미터 → 직접 슬라이드 지정
  - 없으면 카루셀 전체 표시 → 사용자가 1장 선택
       ↓
[Step 3] /api/find/analyze-post
  - 선택된 단일 슬라이드 → GPT-4o-mini Vision 분석 (~$0.003/슬라이드)
  - items[] 추출 + isApparel 게이트
       ↓
[Step 4] 아이템 picker UI
  - 감지된 아이템 목록 표시 → 사용자가 1개 선택
       ↓
[Step 5] /api/find/search
  - 선택 아이템 + tagged_users → brandFilter 빌드
  - AI 서버(Python FastAPI) /recommend 호출 → 5xx/timeout 시 v4 폴백
  - v4: /api/search-products (10-dim 가중합 검색)
       ↓
결과: strongMatches (브랜드 필터) + general (전체) 두 섹션
```

상세 비즈니스 룰(가중치·RPC·폴백)은 `docs/features/main-flow.md` 및 `docs/features/search-engine.md` 참조.

## 어드민 시나리오

1. 브랜드 Genome 관리 — 브랜드 메타데이터, 태그, DNA 편집
2. 검색 품질 평가 — Eval 모듈에서 golden-set 레이블링
3. Search Debugger — v4/v5 검색 쿼리 인스펙트
4. 크롤 커버리지 확인 — 32 플랫폼 파싱 상태 모니터링
5. Products CRUD — 상품 조회·수정·일괄 내보내기
6. Pipeline Health — 배치 파이프라인 상태

어드민 가드 구조: `src/proxy.ts` → `admin/layout.tsx` → `/api/admin/*` 3중 검증.

## Non-Goals (현재 범위 외)

- 검색 품질 자동 평가 인프라 — 골든셋, NDCG, LLM-as-judge 미구축 (v6 마일스톤)
- v5 임베딩 검색 분기 — 인프라 완료, 실제 검색 쿼리 미작성
- 다중 슬라이드 동시 Vision 분석 — 비용 통제로 단일 슬라이드만 분석
- 모바일 앱 — 웹 전용
- 해외 패션 플랫폼 커버리지 — 현재 한국 자사몰 32개 한정

> 최신 플로우 상세: `docs/features/main-flow.md` 참조
