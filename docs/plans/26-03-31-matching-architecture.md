# 상품 매칭 아키텍처

> - **작성일**: 2026-03-31
> - **핵심 질문**: "이미지에서 뭘 뽑아서, 어떻게 상품까지 연결하는가"

---

## 1. 전체 파이프라인

```mermaid
flowchart TD
    subgraph INPUT["유저 입력"]
        IMG["패션 이미지"]
        GEN["성별 선택<br/>(Mens / Womens)"]
    end

    subgraph AI["AI 분석 — GPT-4o-mini Vision"]
        direction TB
        NODE["① 스타일 노드<br/>primary: C (85%)<br/>secondary: D (60%)"]
        TAGS["② 감도 태그<br/>미니멀, 하이엔드"]
        ITEMS["③ 아이템별 키워드<br/>outer: oversized grey wool coat<br/>top: black cotton boxy tee<br/>bottom: wide leg denim"]
    end

    subgraph MATCH["매칭 엔진 — 3단계 검색"]
        direction TB
        S1["1차: 노드 매칭<br/>C 노드 → Lemaire, TOTEME,<br/>Studio Nicholson... (149개)"]
        S2["2차: 인접 노드 확장<br/>D 노드 → Our Legacy,<br/>Séfr, Sunflower..."]
        S3["3차: 전체 검색<br/>노드 무관, 키워드만으로<br/>products 테이블 전체 검색"]
        S1 -->|부족하면| S2 -->|그래도 부족하면| S3
    end

    subgraph RESULT["결과"]
        RES["아이템별 상품 4개<br/>브랜드, 가격, 이미지, 구매 링크"]
    end

    IMG --> AI
    GEN --> MATCH
    AI --> MATCH
    MATCH --> RES

    style INPUT fill:#1a1a2e,stroke:#F59E0B,color:#fff
    style AI fill:#16213e,stroke:#F59E0B,color:#fff
    style MATCH fill:#0f3460,stroke:#F59E0B,color:#fff
    style RESULT fill:#1a1a2e,stroke:#F59E0B,color:#fff
```

---

## 2. AI → DB 매칭 포인트

```mermaid
flowchart LR
    subgraph AI_OUTPUT["AI가 뽑는 것"]
        A1["styleNode.primary: C"]
        A2["styleNode.secondary: D"]
        A3["sensitivityTags:<br/>미니멀, 하이엔드"]
        A4["gender: male<br/>(유저 선택)"]
        A5["searchQuery:<br/>oversized grey<br/>wool coat"]
    end

    subgraph DB["DB에서 매칭하는 것"]
        B1["brand_nodes<br/>style_node = C<br/>→ 브랜드 풀 필터"]
        B2["brand_nodes<br/>style_node = D<br/>→ 2차 브랜드 풀"]
        B3["brand_nodes<br/>sensitivity_tags<br/>→ 향후 2차 필터"]
        B4["products<br/>gender ∋ men<br/>→ 성별 필터"]
        B5["products<br/>name 키워드 매칭<br/>→ 스코어링"]
    end

    A1 -->|1차 검색| B1
    A2 -->|2차 검색| B2
    A3 -.->|향후| B3
    A4 --> B4
    A5 --> B5

    style AI_OUTPUT fill:#1a1a2e,stroke:#F59E0B,color:#fff
    style DB fill:#0f3460,stroke:#F59E0B,color:#fff
```

---

## 3. 테이블 관계 (ERD)

```mermaid
erDiagram
    FASHION_GENOME_EXCEL ||--o{ brand_nodes : "import"
    CRAWLING ||--o{ products : "import"
    brand_nodes ||--o{ products : "brand_name 조인"

    brand_nodes {
        uuid id PK
        text brand_name UK
        text platform
        text style_node "C, B-2, A-1..."
        text[] sensitivity_tags "미니멀, 하이엔드..."
        text[] gender_scope "men, women"
        text price_band "mid, high, luxury"
    }

    products {
        uuid id PK
        text brand FK
        text name
        integer price "KRW"
        text image_url
        text product_url UK
        boolean in_stock
        text platform "shopamomento"
        text[] gender "men, women"
        text style_node "비정규화 — 빠른 필터용"
        timestamptz crawled_at
    }

    analyses {
        uuid id PK
        text style_node_primary "AI가 분류한 노드"
        text style_node_secondary
        numeric style_node_confidence
        jsonb sensitivity_tags
        jsonb items "아이템별 키워드"
    }

    analyses ||--o{ analysis_items : "has"
    analysis_items {
        uuid id PK
        uuid analysis_id FK
        text category "Outer, Top, Bottom..."
        text search_query_original
    }
```

---

## 4. 스코어링 로직

```mermaid
flowchart TD
    Q["AI searchQuery:<br/>oversized grey wool coat"]
    Q --> KW["키워드 분리:<br/>oversized, grey, wool, coat"]

    KW --> PA["상품 A: Lemaire Grey Wool Oversized Coat<br/>4/4 매칭 → score 1.0"]
    KW --> PB["상품 B: Lemaire Black Cotton Blazer<br/>0/4 매칭 → score 0.0"]
    KW --> PC["상품 C: Studio Nicholson Grey Wool Cardigan<br/>2/4 매칭 → score 0.5"]

    PA --> SORT["정렬: score ↓ → 가격 ↑"]
    PC --> SORT
    PB --> SORT

    SORT --> TOP["상위 4개 선택"]

    style PA fill:#065f46,stroke:#10b981,color:#fff
    style PB fill:#7f1d1d,stroke:#ef4444,color:#fff
    style PC fill:#78350f,stroke:#f59e0b,color:#fff
```

---

## 5. 데이터 소스 & 적재 흐름

```mermaid
flowchart LR
    subgraph SOURCE["데이터 소스"]
        EXCEL["Fashion Genome<br/>엑셀 (Brand_DB)"]
        CRAWL["크롤러<br/>(Playwright)"]
    end

    subgraph SCRIPT["스크립트"]
        IMP1["import-brand-nodes.ts<br/>(TODO)"]
        IMP2["import-products.ts"]
    end

    subgraph SUPABASE["Supabase"]
        BN["brand_nodes<br/>1,079개 브랜드 × 노드"]
        PR["products<br/>크롤링 상품"]
    end

    EXCEL -->|"수동 실행"| IMP1 --> BN
    CRAWL -->|"JSON 출력"| IMP2 --> PR
    BN ---|"brand_name 조인"| PR

    subgraph SHOPS["크롤링 대상"]
        SA["샵아모멘토 ✅"]
        SS["SSENSE ❌<br/>(제휴 필요)"]
        ETC["기타 편집샵<br/>(조사 중)"]
    end

    SHOPS --> CRAWL

    style SOURCE fill:#1a1a2e,stroke:#F59E0B,color:#fff
    style SUPABASE fill:#0f3460,stroke:#F59E0B,color:#fff
    style SHOPS fill:#1e1b4b,stroke:#818cf8,color:#fff
```

---

## 6. 현재 한계 & 다음 단계

| 한계 | 해결 방향 | 시기 |
|------|-----------|------|
| 샵아모멘토만 크롤링 (상품 수 적음) | 다른 편집샵 추가 + 어필리에이트 | MVP |
| 키워드 매칭이 단순 (문자열 포함) | 임베딩 기반 유사도 검색 (벡터 DB) | MVP |
| brand_nodes 수동 import 필요 | 엑셀 → Supabase 자동 동기화 스크립트 | POC |
| 가격 필터 없음 | price_band 채운 후 필터 추가 | MVP |
| 카테고리 매칭 없음 (코트 검색에 바지 나올 수 있음) | 아이템 카테고리 태깅 추가 | MVP |
