# 분석 품질 평가 파이프라인 가이드

> - 작성일: 2026-04-07
> - 대상: 팀 전체
> - 목적: 프롬프트 수정 → 자동 평가 → 품질 추적까지의 전체 흐름 공유

---

## 1. 한눈에 보는 파이프라인

```
프롬프트 수정 → 테스트 케이스 실행 → 채점 → 베이스라인 비교 → 회귀 감지 → 반복
```

### 서비스별 역할

```mermaid
graph LR
    Cases["📋 테스트 케이스<br/>(JSON 30개)"]
    Eval["⚙️ eval-prompt-v2.ts<br/>평가 오케스트레이터"]
    API["🌐 /api/analyze<br/>(Next.js)"]
    LLM["🧠 GPT-4o-mini<br/>(LiteLLM / OpenAI)"]
    Score["📊 채점 엔진<br/>(가중치 스코어링)"]
    Baseline["📁 베이스라인<br/>(JSON 스냅샷)"]

    Cases --> Eval
    Eval -->|"POST FormData"| API
    API -->|"프롬프트 전달"| LLM
    LLM -->|"구조화 JSON"| API
    API -->|"분석 결과"| Eval
    Eval --> Score
    Score --> Baseline

    style Eval fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style LLM fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    style Score fill:#e1f5fe,stroke:#0288d1,stroke-width:2px
    style Baseline fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
```

> **eval-prompt-v2.ts가 오케스트레이터** — 테스트 케이스 로드, API 호출, 채점, 비교를 전부 순서대로 처리한다.

---

## 2. 개선 루프 (Eval-Driven Development)

```mermaid
flowchart TB
    A["1️⃣ 프롬프트 수정<br/>(prompt-search.ts)"] --> B["2️⃣ 기본 케이스 실행<br/>(15개)"]
    B --> C{"평균 ≥ 95점?"}
    C -->|No| D["3️⃣ 실패 패턴 분석"]
    D --> E["4️⃣ 프롬프트 수정"]
    E --> B
    C -->|Yes| F["5️⃣ 하드 케이스 실행<br/>(15개)"]
    F --> G{"평균 ≥ 90점?"}
    G -->|No| D
    G -->|Yes| H["6️⃣ 일관성 테스트<br/>(3회 반복)"]
    H --> I{"일관성 ≥ 90%?"}
    I -->|No| J["temperature/seed<br/>조정 검토"]
    J --> E
    I -->|Yes| K["7️⃣ 베이스라인 저장<br/>+ 커밋"]

    style A fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    style K fill:#e1f5fe,stroke:#0288d1,stroke-width:2px
    style D fill:#fff3e0,stroke:#f57c00,stroke-width:2px
```

### 목표 기준

| 단계 | 대상 | 목표 |
|------|------|------|
| 기본 테스트 | 15개 일반 케이스 | 평균 ≥ 95, FAIL 0 |
| 하드 테스트 | 15개 edge case | 평균 ≥ 90, FAIL 0 |
| 일관성 | 3회 반복 실행 | 일관성 ≥ 90% (spread ≤ 10점) |

---

## 3. 전체 흐름 (Sequence Diagram)

```mermaid
sequenceDiagram
    actor Dev as 개발자
    participant Eval as eval-prompt-v2.ts
    participant API as /api/analyze
    participant LLM as GPT-4o-mini
    participant Score as 채점 엔진
    participant FS as 파일시스템

    Note over Dev,FS: Phase 1 — 프롬프트 수정

    Dev->>Dev: prompt-search.ts 수정
    Dev->>Eval: npx tsx scripts/eval-prompt-v2.ts

    Note over Dev,FS: Phase 2 — 테스트 실행

    Eval->>FS: 테스트 케이스 JSON 로드
    loop 15개 케이스
        Eval->>API: POST /api/analyze (FormData)
        API->>LLM: 프롬프트 + 시스템 프롬프트
        LLM-->>API: 구조화 JSON 응답
        API-->>Eval: 분석 결과 + _logId
        Eval->>Score: expected vs actual 비교
        Score-->>Eval: 점수 + 상세 breakdown
    end

    Note over Dev,FS: Phase 3 — 리포트

    Eval->>Eval: 집계 (평균, pass/fail, 지연시간)
    Eval-->>Dev: 콘솔 리포트
    Eval->>FS: JSON 결과 저장 (--save)

    Note over Dev,FS: Phase 4 — 회귀 비교 (선택)

    Dev->>Eval: --baseline <prev.json>
    Eval->>FS: 이전 결과 로드
    Eval->>Eval: 케이스별 점수 diff + 회귀 감지
    Eval-->>Dev: 비교 리포트
```

---

## 4. 채점 체계

### 가중치 구조

```mermaid
pie title 채점 가중치 (100점 만점)
    "category (30)" : 30
    "subcategory (20)" : 20
    "colorFamily (20)" : 20
    "styleNode (20)" : 20
    "fit/fabric (10)" : 10
```

### 채점 로직

```mermaid
flowchart LR
    A["기대 아이템"] --> B{실제에 존재?}
    B -->|Yes| C{subcategory 매치?}
    B -->|No| D["category 감점"]
    C -->|정확| E["20점"]
    C -->|불일치| F["0점 + 상세 로그"]
    
    G["기대 styleNode"] --> H{정확 매치?}
    H -->|Yes| I["20점"]
    H -->|No| J{인접 노드?}
    J -->|Yes| K["12점"]
    J -->|No| L{시스템 인접?}
    L -->|Yes| M["8점"]
    L -->|No| N["0점"]
```

### styleNode 인접 관계

```mermaid
graph TD
    A1["A-1<br/>트레일 아웃도어"] --- G["G<br/>테크니컬 고프코어"]
    A1 --- C["C<br/>미니멀 컨템퍼러리"]
    
    A2["A-2<br/>하이엔드 럭셔리"] --- B["B<br/>얼터너티브 딥"]
    A2 --- H["H<br/>스트릿 캐주얼"]
    
    A3["A-3<br/>헤리티지 빈티지"] --- D["D<br/>컨템퍼러리 캐주얼"]
    A3 --- I["I<br/>재패니즈 워크웨어"]
    
    B --- B2["B-2<br/>얼터너티브 캐주얼"]
    B --- E["E<br/>해체주의"]
    
    C --- D
    C --- B2
    
    D --- H
    D --- A3
    
    F["F<br/>미니멀 페미닌"] --- F2["F-2<br/>로맨틱 페미닌"]
    F --- F3["F-3<br/>럭셔리 센슈얼"]
    F --- D
    
    H --- K["K<br/>영캐주얼"]
    K --- F2

    style D fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    style C fill:#e1f5fe,stroke:#0288d1,stroke-width:2px
```

---

## 5. 테스트 케이스 분류

### 기본 세트 (일반 난이도)

```mermaid
graph LR
    subgraph mood["무드/감성"]
        P01["P-01 꾸안꾸"]
        P14["P-14 비 오는 날"]
    end
    subgraph condition["복합 조건"]
        P02["P-02 린넨+와이드"]
        P13["P-13 셔츠+샌들+토트"]
    end
    subgraph culture["문화/트렌드"]
        P03["P-03 그런지"]
        P10["P-10 고프코어"]
        P11["P-11 아미/프렌치"]
    end
    subgraph tpo["TPO/상황"]
        P05["P-05 미술관"]
        P08["P-08 출근룩"]
    end
    subgraph special["특수 처리"]
        P04["P-04 하의 매칭"]
        P07["P-07 레이어드"]
        P09["P-09 올 블랙"]
        P12["P-12 부정형"]
    end
```

### 하드 세트 (edge case)

```mermaid
graph LR
    subgraph negative["부정/제약"]
        H01["H-01 이중 부정"]
        H05["H-05 모순 요청"]
    end
    subgraph minimal["정보 부족"]
        H06["H-06 3단어"]
        H07["H-07 감성만"]
    end
    subgraph specific["정밀 요청"]
        H02["H-02 이중 레이어"]
        H04["H-04 3아이템"]
        H08["H-08 니트 셋업"]
    end
    subgraph slang["슬랭/은어"]
        H03["H-03 Y2K"]
        H13["H-13 놈코어"]
    end
    subgraph occasion["드레스코드"]
        H12["H-12 웨딩 게스트"]
        H15["H-15 사계절 아우터"]
    end
```

---

## 6. v2 실행 명령어

```bash
# 기본 실행
npx tsx scripts/eval-prompt-v2.ts

# 하드 케이스
npx tsx scripts/eval-prompt-v2.ts --hard

# 결과 저장
npx tsx scripts/eval-prompt-v2.ts --save

# 3회 반복 일관성 테스트
npx tsx scripts/eval-prompt-v2.ts --repeat 3

# 베이스라인 비교 (회귀 감지)
npx tsx scripts/eval-prompt-v2.ts --baseline scripts/output/eval-prompt-v2-2026-04-07T03-28.json

# 풀 테스트: 하드 + 3회 반복 + 저장 + 베이스라인 비교
npx tsx scripts/eval-prompt-v2.ts --hard --repeat 3 --save --baseline scripts/output/prev.json
```

---

## 7. v1 vs v2 비교

| 기능 | v1 | v2 |
|------|----|----|
| 기본 채점 | ✅ | ✅ |
| 하드 케이스 | ✅ (--hard) | ✅ (--hard) |
| 지연시간 추적 | ❌ | ✅ (케이스별 ms) |
| 구조 준수율 | ❌ | ✅ (JSON 파싱/필드 검증) |
| 일관성 테스트 | ❌ | ✅ (--repeat N) |
| 베이스라인 비교 | ❌ | ✅ (--baseline) |
| 회귀 감지 | ❌ | ✅ (>5점 하락 경고) |
| 항목별 diff | ❌ | ✅ |

---

## 8. 파일 구조

```
scripts/
├── eval-prompt.ts              # v1 평가 스크립트
├── eval-prompt-v2.ts           # v2 평가 스크립트 (추천)
├── eval-prompt-cases.json      # 기본 테스트 15개
├── eval-prompt-cases-hard.json # 하드 테스트 15개
└── output/
    ├── eval-prompt-2026-04-07T03-17.json  # Round 1 결과
    ├── eval-prompt-2026-04-07T03-21.json  # Round 2 결과
    ├── eval-prompt-2026-04-07T03-25.json  # Round 3 결과
    ├── eval-prompt-2026-04-07T03-28.json  # Round 4 결과 (베이스라인)
    ├── eval-prompt-2026-04-07T03-31.json  # Round 5 결과 (안정성)
    └── eval-prompt-2026-04-07T03-35.json  # Round 6 결과 (하드)

src/lib/prompts/
├── prompt-search.ts    # 프롬프트 전용 시스템 프롬프트 (개선 대상)
└── analyze.ts          # 이미지 분석 시스템 프롬프트

docs/eval/
├── 26-04-07-test-cases-v1.md            # 원본 테스트 설계 (이미지 포함)
├── 26-04-07-prompt-eval-report.md       # 라운드별 개선 리포트
└── 26-04-07-eval-pipeline-architecture.md  # 이 문서
```

---

## 9. 향후 확장 방향

| 확장 | 설명 | 우선순위 |
|------|------|---------|
| 이미지 분석 eval | 로컬 이미지 → FormData 업로드 → 채점 | 높음 |
| 검색 결과 eval | 분석 → 검색까지 end-to-end 채점 | 높음 |
| LLM-as-Judge | 주관적 품질 (검색 결과가 "어울리는지") 채점 | 중간 |
| CI 통합 | PR마다 eval 실행, 점수 하락 시 차단 | 중간 |
| A/B 프롬프트 테스트 | 여러 프롬프트 버전 매트릭스 실행 | 낮음 |
| Supabase 골든셋 연동 | DB에서 케이스 로드, 결과 저장 | 낮음 |
