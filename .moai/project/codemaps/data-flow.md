---
type: codemap
updated: 2026-05-04
---

# kiko.ai — 데이터 흐름

> **주의**: 이 문서는 모듈 레벨 추상화를 제공합니다. 가중치·RPC 파라미터·에러 코드 등 세부 비즈니스 룰의 정식 진실 원천은 `docs/features/main-flow.md` 및 `docs/features/search-engine.md`입니다.

---

## 메인 플로우 시퀀스 다이어그램

```mermaid
sequenceDiagram
    actor User
    participant FE as Next.js Frontend
    participant IG as /api/instagram/fetch-post
    participant DB as Supabase Postgres
    participant Apify as Apify Scraper
    participant R2 as Cloudflare R2
    participant VA as /api/find/analyze-post
    participant OAI as OpenAI GPT-4o-mini
    participant FS as /api/find/search
    participant AIS as AI Server (Python)
    participant SP as /api/search-products

    User->>FE: Instagram URL 붙여넣기
    FE->>IG: POST /api/instagram/fetch-post

    IG->>DB: shortcode 캐시 조회 (instagram_post_scrapes)
    alt 캐시 HIT
        DB-->>IG: 캐시된 포스트 데이터
    else 캐시 MISS
        IG->>Apify: run-sync 스크래핑 (~5-10s)
        Apify-->>IG: 포스트 메타 + 이미지 URL
        IG->>R2: 이미지 복사 (instagram-posts/ prefix)
        IG->>DB: 스크래핑 결과 저장
    end
    IG-->>FE: 슬라이드 목록 + R2 이미지 URL

    Note over FE: 슬라이드 picker UI
    User->>FE: 슬라이드 1장 선택 (또는 ?img_index=N)

    FE->>VA: POST /api/find/analyze-post (선택 슬라이드)
    VA->>OAI: GPT-4o-mini Vision 분석 (~$0.003/슬라이드)
    OAI-->>VA: 감지 아이템 JSON
    VA-->>FE: items[] + isApparel 결과

    Note over FE: 아이템 picker UI
    User->>FE: 아이템 1개 선택

    FE->>FS: POST /api/find/search (아이템 + tagged_users)
    FS->>AIS: /recommend RPC (v5 임베딩 검색)

    alt AI Server 정상 응답
        AIS-->>FS: 추천 결과
    else 5xx / timeout
        FS->>SP: 인-프로세스 v4 폴백 호출
        SP->>DB: 10-dim 가중합 쿼리 (JOIN + 스코어링)
        DB-->>SP: 스코어 정렬 결과
        SP-->>FS: v4 결과
    end

    Note over FS: 다양성 캡 적용<br/>(브랜드 max 2, 플랫폼 max 3)
    FS-->>FE: strongMatches + general 두 섹션
    FE-->>User: 상품 추천 카드 렌더
```

---

## 폴백 체인

```mermaid
graph LR
    A["FS /api/find/search"] -->|"/recommend 호출"| B["AI Server\nPython FastAPI"]
    B -->|"정상 200"| C["v5 결과 반환"]
    B -->|"5xx / timeout"| D["v4 폴백 진입\n(인-프로세스)"]
    D --> E["/api/search-products\n10-dim 가중합"]
    E --> F["Supabase JOIN\n+ 스코어링"]
    F --> G["v4 결과 반환"]

    style B fill:#6a1b9a,color:#fff
    style D fill:#f57f17,color:#fff
    style E fill:#1565c0,color:#fff
```

AI Server 미설정 (`AI_SERVER_URL` 환경변수 없음) 시에도 자동으로 v4 경로로 진행합니다.

---

## 어드민 데이터 흐름

```mermaid
graph TD
    AdminUser["어드민 브라우저"] -->|"1. 쿠키 세션"| Proxy["src/proxy.ts\n1차 게이트"]
    Proxy -->|"admin_profiles.status 확인"| SB["Supabase\nadmin_profiles 테이블"]
    Proxy -->|"미승인 → redirect"| Pending["/admin/pending"]
    Proxy -->|"승인됨 → 통과"| Layout["admin/layout.tsx\nrequireApprovedAdmin()"]
    Layout -->|"2차 검증"| SB
    Layout --> AdminPage["어드민 페이지\n(genome / eval / products 등)"]
    AdminPage -->|"3차 API 호출"| AdminAPI["/api/admin/*"]
    AdminAPI -->|"requireApprovedAdmin() 호출"| SB
    AdminAPI -->|"RLS 정책 적용"| SB

    style Proxy fill:#c62828,color:#fff
    style Layout fill:#f57f17,color:#fff
    style AdminAPI fill:#f57f17,color:#fff
```

---

## 캐시 흐름

| 캐시 키 | 저장소 | 캐시 대상 | 무효화 |
|---|---|---|---|
| `instagram_post_scrapes.shortcode` | Supabase Postgres | Apify 스크래핑 결과 전체 | 수동 (TTL 없음) |
| R2 `instagram-posts/<shortcode>/` | Cloudflare R2 | 포스트 이미지 원본 복사본 | 수동 삭제 |
| R2 `analyses/<shortcode>/` | Cloudflare R2 | Vision 분석 결과 이미지 | 수동 삭제 |

캐시 HIT 시 Apify 호출 비용($0.0023/포스트)과 스크래핑 대기 시간(5-10s)을 절약합니다.

---

## v4 검색 내부 흐름

```
/api/search-products 입력
  → enums/ 기반 쿼리 파라미터 정규화
  → Supabase products 테이블 JOIN (brands, platform_metadata)
  → 10개 차원 가중합 스코어링
      (색상 / 스타일 / 카테고리 / 브랜드 매치 / 가격대 / 소재 / 핏 / 시즌 / 성별 / 태그)
  → strongMatches 필터 (브랜드 필터 매치 상품)
  → general 풀 (전체 결과)
  → 다양성 캡 (브랜드 max 2, 플랫폼 max 3) 적용
  → 결과 반환
```

---

## 필수 동기화 문서 안내

이 코드맵은 모듈 레벨 추상화를 제공합니다. 아래 3개 문서가 세부 흐름의 **단일 진실 원천**입니다.

| 문서 | 담당 내용 |
|---|---|
| `docs/features/main-flow.md` | API 시퀀스 상세, 에러 코드, 캐시 규칙, picker UX |
| `docs/features/search-engine.md` | v4 가중치 상세, v5 인프라 현황, 검색 알고리즘 |
| `docs/ARCHITECTURE.md` | 외부 서비스 토폴로지, 시스템 경계 |

> 자세히: `docs/features/main-flow.md` (메인 플로우 전체), `docs/features/search-engine.md` (검색 엔진 v4/v5)
