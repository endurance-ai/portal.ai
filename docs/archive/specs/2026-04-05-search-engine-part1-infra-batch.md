# Part 1: 인프라 + 상품 이미지 배치 분석 파이프라인

> **목표**: 15,000개 상품 이미지를 AI로 분석하여 정규화된 enum 태그를 부여하고, 이를 검색 매칭의 기반 데이터로 활용한다.
>
> **Part 2** (검색 엔진 리팩토링 + Eval): 별도 문서에서 다룸.

---

## 배경 및 문제

### 현재 검색 플로우
```
유저 이미지/프롬프트
  → GPT-4o-mini → searchQueryKo ("오버사이즈 차콜 그레이 울 코트 남성")
  → products 테이블에서 텍스트 키워드 매칭
  → 노드 부스트 + attr 부스트 → 상위 5개 반환
```

### 핵심 문제
1. **상품 데이터 빈약**: products 테이블의 `description`, `color`, `material` 대부분 비어있음 (detail 크롤러 시간 문제)
2. **텍스트 매칭 한계**: "차콜" vs "그레이" vs "dark grey" — 동의어/다국어 매칭 불가
3. **구조적 불일치**: 프론트(유저) 분석은 enum 기반인데, 상품 쪽은 자유 텍스트 → 매칭률 저조

### 해결 방향
상품 이미지를 AI로 분석하여 **프론트와 동일한 enum 체계**로 정규화 → enum 대 enum 매칭으로 전환

---

## 아키텍처 개요

```
┌─────────────────── 유저 플로우 (기존 유지) ─────────────────┐
│  유저 프롬프트/이미지                                        │
│       ↓                                                    │
│  Vercel (Next.js) → LiteLLM Gateway → GPT-4o-mini          │
│       ↓                                                    │
│  analysis_items (enum 정규화된 아이템)                        │
│       ↓                                                    │
│  Search Engine v2 (enum 매칭 + 가중치) ← Part 2에서 설계     │
│       ↓                                                    │
│  product_ai_analysis JOIN products → 결과                    │
└────────────────────────────────────────────────────────────┘

┌─────────────────── 배치 플로우 (이 문서의 범위) ──────────────┐
│  로컬 스크립트 (scripts/analyze-products.ts)                  │
│       ↓                                                     │
│  Supabase products 테이블 → image_url 목록 조회               │
│       ↓                                                     │
│  LiteLLM Gateway (EC2) → Bedrock Nova Lite Vision            │
│       ↓                                                     │
│  정규화된 enum 결과 → product_ai_analysis 테이블 INSERT       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────── 인프라 ──────────────────────────────────┐
│  새 AWS 계정 (크레딧 $1,000 / ~2026-06-30)                   │
│  ├── EC2: t4g.small (ARM Graviton, ap-northeast-2)           │
│  │   └── Docker                                              │
│  │       └── LiteLLM (port 4000, HTTPS)                      │
│  │           ├── model: bedrock/nova-lite (배치용)             │
│  │           └── model: openai/gpt-4o-mini (프론트용)          │
│  ├── Bedrock: Nova Lite Vision 활성화                         │
│  └── IAM: EC2 Role → BedrockInvokeModel                      │
└────────────────────────────────────────────────────────────┘
```

---

## 1. AWS 인프라 구성

### 1.1 EC2 인스턴스

| 항목 | 값 |
|------|-----|
| 타입 | t4g.small (2 vCPU, 2GB RAM, ARM) |
| AMI | Amazon Linux 2023 (ARM) |
| 리전 | ap-northeast-2 (서울) |
| 스토리지 | gp3 20GB |
| 보안 그룹 | 인바운드: 443 (HTTPS), 22 (SSH, 본인 IP만) |

### 1.2 Docker + LiteLLM

**docker-compose.yml**:
```yaml
version: "3.8"
services:
  litellm:
    image: ghcr.io/berriai/litellm:main-stable
    container_name: litellm
    restart: unless-stopped
    ports:
      - "4000:4000"
    volumes:
      - ./config/litellm.yaml:/app/config.yaml
    environment:
      - LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
      - AWS_REGION_NAME=ap-northeast-1
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    command: ["--config", "/app/config.yaml", "--port", "4000"]
```

**config/litellm.yaml**:
```yaml
model_list:
  # 배치 분석용 — Bedrock Nova Lite (Vision 지원, 최저가)
  - model_name: nova-lite
    litellm_params:
      model: bedrock/amazon.nova-lite-v1:0
      aws_region_name: ap-northeast-1   # Tokyo (Nova Lite 가용)

  # 프론트 분석용 — OpenAI GPT-4o-mini (기존 유지)
  - model_name: gpt-4o-mini
    litellm_params:
      model: openai/gpt-4o-mini

litellm_settings:
  request_timeout: 120
  num_retries: 2

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
```

> **참고**: Nova Lite의 Bedrock 가용 리전을 배포 전 확인할 것. ap-northeast-1 (Tokyo)에서 사용 가능한 것으로 확인됨. ap-northeast-2 (Seoul)도 확인 필요.

### 1.3 HTTPS 설정

Caddy를 리버스 프록시로 사용 (Let's Encrypt 자동 인증서):

```yaml
  caddy:
    image: caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./config/Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
```

**Caddyfile**:
```
{domain}.{tld} {
    reverse_proxy litellm:4000
}
```

> 도메인이 없으면 IP + 자체 서명 인증서로 시작해도 됨. 이 경우 Next.js에서 `NODE_TLS_REJECT_UNAUTHORIZED=0` 필요.

### 1.4 IAM 구성

```
EC2 Instance Role: fashion-ai-ec2-role
├── Policy: BedrockInvokeAccess
│   └── Action: bedrock:InvokeModel
│   └── Resource: arn:aws:bedrock:ap-northeast-1::foundation-model/amazon.nova-lite-v1:0
└── Trust: ec2.amazonaws.com
```

LiteLLM은 EC2 IAM Role을 자동 감지하므로 별도 AWS 키 불필요.

### 1.5 비용 추정

| 항목 | 월 비용 | 비고 |
|------|---------|------|
| EC2 t4g.small | ~$15/월 | 온디맨드 |
| Bedrock Nova Lite | ~$2-4 (1회) | 15,000개 분석 시 |
| EBS 20GB gp3 | ~$1.6/월 | |
| 데이터 전송 | ~$1/월 | |
| **합계** | **~$20/월 + 분석비** | 크레딧 $1,000 내 여유 |

---

## 2. product_ai_analysis 테이블

### 2.1 스키마

```sql
-- 012_create_product_ai_analysis.sql

CREATE TABLE product_ai_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- 버전 관리
  version TEXT NOT NULL DEFAULT 'v1',       -- 분석 버전 ("v1", "v2", ...)
  model_id TEXT NOT NULL,                   -- "nova-lite", "haiku", "gpt-4o-mini"
  prompt_hash TEXT,                         -- 프롬프트 변경 추적 (SHA-256 앞 8자)

  -- 정규화된 enum 필드 (프론트 analysis_items와 동일 체계)
  category TEXT NOT NULL,                   -- enum: Outer, Top, Bottom, Shoes, Bag, Dress, Accessories
  subcategory TEXT,                         -- enum: overcoat, t-shirt, jeans, sneakers, ...
  fit TEXT,                                 -- enum: oversized, relaxed, regular, slim, skinny, boxy, cropped, longline
  fabric TEXT,                              -- enum: cotton, wool, denim, leather, ...
  color_family TEXT,                        -- enum: BLACK, WHITE, GREY, NAVY, BLUE, BEIGE, BROWN, GREEN, RED, PINK, PURPLE, ORANGE, YELLOW, CREAM, KHAKI, MULTI
  color_detail TEXT,                        -- AI 원본 컬러명: "charcoal grey", "dusty pink"

  -- 스타일 분류
  style_node TEXT,                          -- enum: A-1, A-2, ..., K (15개 노드)
  mood_tags TEXT[],                         -- 감도 태그: {"미니멀", "하이엔드"}
  keywords_ko TEXT[],                       -- 한국어 키워드: {"오버사이즈", "울", "코트"}
  keywords_en TEXT[],                       -- 영어 키워드: {"oversized", "wool", "coat"}

  -- 메타
  confidence NUMERIC(3,2),                  -- AI 분석 신뢰도 0.00-1.00
  raw_response JSONB,                       -- AI 원본 응답 (디버깅/재분석용)
  error TEXT,                               -- 분석 실패 시 에러 메시지

  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- 같은 상품 + 같은 버전은 하나만
  UNIQUE (product_id, version)
);

-- 검색용 인덱스
CREATE INDEX idx_pai_version ON product_ai_analysis (version);
CREATE INDEX idx_pai_product_version ON product_ai_analysis (product_id, version);
CREATE INDEX idx_pai_category ON product_ai_analysis (version, category);
CREATE INDEX idx_pai_subcategory ON product_ai_analysis (version, subcategory);
CREATE INDEX idx_pai_style_node ON product_ai_analysis (version, style_node);
CREATE INDEX idx_pai_color_family ON product_ai_analysis (version, color_family);
CREATE INDEX idx_pai_fit ON product_ai_analysis (version, fit);
CREATE INDEX idx_pai_fabric ON product_ai_analysis (version, fabric);
CREATE INDEX idx_pai_mood_tags ON product_ai_analysis USING gin (mood_tags);
CREATE INDEX idx_pai_keywords_ko ON product_ai_analysis USING gin (keywords_ko);
CREATE INDEX idx_pai_keywords_en ON product_ai_analysis USING gin (keywords_en);

COMMENT ON TABLE product_ai_analysis IS '상품 이미지 AI 분석 결과. products와 1:N (버전별). 검색 매칭의 핵심 데이터.';
```

### 2.2 Enum 정의 (프론트와 공유)

아래 enum은 프론트 분석 프롬프트(`src/lib/prompts/analyze.ts`)에 이미 정의된 것과 **동일**하게 사용한다. 코드에서는 `src/lib/enums/product-enums.ts`로 분리하여 프론트/배치 양쪽에서 import.

#### category (7개)
```
Outer, Top, Bottom, Shoes, Bag, Dress, Accessories
```

#### subcategory (카테고리별)
```
Outer: overcoat, trench-coat, parka, bomber, blazer, cardigan, vest, anorak,
       leather-jacket, denim-jacket, fleece, windbreaker, cape, poncho,
       shearling, down-jacket, field-jacket, chore-jacket, overshirt, hoodie

Top:   t-shirt, shirt, blouse, polo, sweater, knit-top, tank-top, crop-top,
       henley, turtleneck, sweatshirt, rugby-shirt, camisole

Bottom: jeans, trousers, chinos, shorts, skirt, joggers, cargo-pants,
        wide-pants, leggings, culottes, sweatpants

Shoes: sneakers, boots, loafers, derby, oxford, sandals, mules, heels,
       flats, slides, chelsea-boots, combat-boots, running-shoes

Bag:   tote, crossbody, backpack, clutch, shoulder-bag, belt-bag,
       messenger, bucket-bag, briefcase

Dress: mini-dress, midi-dress, maxi-dress, shirt-dress, wrap-dress,
       slip-dress, knit-dress

Accessories: hat, cap, scarf, belt, sunglasses, watch, necklace, bracelet,
             ring, earrings, tie, gloves, socks
```

#### fit (8개)
```
oversized, relaxed, regular, slim, skinny, boxy, cropped, longline
```

#### fabric (22개)
```
cotton, wool, linen, silk, denim, leather, suede, nylon, polyester,
cashmere, corduroy, fleece, tweed, jersey, knit, mesh, satin, chiffon,
velvet, canvas, gore-tex, ripstop
```

#### color_family (16개) — 신규 정의
```
BLACK, WHITE, GREY, NAVY, BLUE, BEIGE, BROWN, GREEN,
RED, PINK, PURPLE, ORANGE, YELLOW, CREAM, KHAKI, MULTI
```

매핑 예시:
- "charcoal grey", "dark grey", "slate" → GREY
- "navy blue", "midnight" → NAVY
- "burgundy", "wine", "maroon" → RED
- "olive", "forest", "sage" → GREEN
- "camel", "tan", "sand" → BEIGE
- "ivory", "off-white", "ecru" → CREAM
- 패턴/멀티컬러 → MULTI

#### style_node (15개) — 기존 Fashion Genome
```
A-1, A-2, A-3, B, B-2, C, D, E, F, F-2, F-3, G, H, I, K
```

#### mood_tags (12개) — 기존 감도 태그
```
미니멀, 컨템포러리, 캐주얼, 스트릿, 하이엔드, 센슈얼,
로맨틱, 테크니컬, 헤리티지, 실험적, 아웃도어, 고프코어
```

---

## 3. 배치 분석 스크립트

### 3.1 파일 위치 및 구조

```
scripts/
├── analyze-products.ts          # 메인 배치 스크립트
├── lib/
│   └── product-analyzer.ts      # AI 호출 + 응답 파싱 로직
└── configs/
    └── analyze-prompt.ts        # 상품 이미지 분석 프롬프트
```

### 3.2 CLI 인터페이스

```bash
# 전체 분석 (v1)
npx tsx scripts/analyze-products.ts --version v1

# 특정 브랜드만
npx tsx scripts/analyze-products.ts --version v1 --brand "AURALEE"

# 특정 카테고리만
npx tsx scripts/analyze-products.ts --version v1 --category "Outer"

# 개수 제한 (테스트용)
npx tsx scripts/analyze-products.ts --version v1 --limit 50

# 드라이런 (API 호출 없이 대상 확인만)
npx tsx scripts/analyze-products.ts --version v1 --dry-run

# 실패 건만 재시도
npx tsx scripts/analyze-products.ts --version v1 --retry-failed
```

### 3.3 실행 플로우

```
1. CLI 인자 파싱 (version, brand, category, limit, dry-run)
2. Supabase에서 대상 products 조회
   - WHERE in_stock = true
   - AND image_url LIKE 'http%'
   - AND NOT EXISTS (product_ai_analysis WHERE version = $version)
   - [선택] AND brand = $brand / category = $category
3. 대상 수 출력, dry-run이면 여기서 종료
4. 동시 10개씩 배치 처리 (p-limit 또는 직접 구현)
   a. LiteLLM 엔드포인트로 Nova Lite Vision 호출
      - 이미지: product.image_url
      - 프롬프트: 상품 분석 전용 (아래 3.4절)
   b. JSON 응답 파싱 + enum 유효성 검증
   c. product_ai_analysis에 INSERT (성공) 또는 error 기록 (실패)
5. 100개마다 진행률 로깅: "[150/15000] 1.0% — 성공 148 / 실패 2"
6. 완료 시 요약: 총 N개, 성공 M개, 실패 K개, 소요시간
7. 실패 목록 → scripts/output/failed-{version}-{timestamp}.json
```

### 3.4 상품 이미지 분석 프롬프트

```
시스템 프롬프트:
"You are a fashion product image analyst. Given a single product image,
extract structured attributes for product search matching.

=== OUTPUT FORMAT (JSON, no markdown) ===
{
  "category": "Outer",
  "subcategory": "overcoat",
  "fit": "oversized",
  "fabric": "wool",
  "color_family": "GREY",
  "color_detail": "charcoal grey",
  "style_node": "C",
  "mood_tags": ["미니멀", "하이엔드"],
  "keywords_ko": ["오버사이즈", "차콜", "울", "코트", "미니멀"],
  "keywords_en": ["oversized", "charcoal", "wool", "coat", "minimal"],
  "confidence": 0.85
}

=== ENUM 제약 (반드시 아래 목록에서만 선택) ===
category: Outer, Top, Bottom, Shoes, Bag, Dress, Accessories
subcategory: [전체 목록 — 위 enum 정의 참조]
fit: oversized, relaxed, regular, slim, skinny, boxy, cropped, longline
fabric: cotton, wool, linen, silk, denim, leather, suede, nylon, polyester,
        cashmere, corduroy, fleece, tweed, jersey, knit, mesh, satin,
        chiffon, velvet, canvas, gore-tex, ripstop
color_family: BLACK, WHITE, GREY, NAVY, BLUE, BEIGE, BROWN, GREEN,
              RED, PINK, PURPLE, ORANGE, YELLOW, CREAM, KHAKI, MULTI
style_node: A-1, A-2, A-3, B, B-2, C, D, E, F, F-2, F-3, G, H, I, K
mood_tags: 미니멀, 컨템포러리, 캐주얼, 스트릿, 하이엔드, 센슈얼,
           로맨틱, 테크니컬, 헤리티지, 실험적, 아웃도어, 고프코어

=== STYLE NODE TAXONOMY (분류 기준) ===
{buildNodeReference() 출력 — fashion-genome.ts에서 생성}

=== RULES ===
- 이미지에 보이는 단일 상품만 분석 (모델 착용 사진이면 해당 상품에 집중)
- category와 subcategory는 반드시 enum 값으로
- color_family는 대문자 enum, color_detail은 구체적 색상명
- keywords_ko: 한국어 패션 검색 키워드 3-7개
- keywords_en: 영어 패션 검색 키워드 3-7개
- mood_tags: 1-3개, 감도 태그 목록에서만
- confidence: 이미지 품질/명확도 기반 신뢰도 (0.0-1.0)
- 이미지가 불명확하면 confidence를 낮추고 가장 가까운 enum 값 선택
"

유저 프롬프트:
"Analyze this product image."

+ 이미지 (product.image_url을 base64 또는 URL로 전달)
```

### 3.5 응답 파싱 + 유효성 검증

```typescript
// 파싱 후 검증 항목
const VALID_CATEGORIES = ["Outer", "Top", "Bottom", "Shoes", "Bag", "Dress", "Accessories"]
const VALID_FITS = ["oversized", "relaxed", "regular", "slim", "skinny", "boxy", "cropped", "longline"]
const VALID_COLOR_FAMILIES = ["BLACK", "WHITE", "GREY", "NAVY", "BLUE", "BEIGE", "BROWN", "GREEN", "RED", "PINK", "PURPLE", "ORANGE", "YELLOW", "CREAM", "KHAKI", "MULTI"]
// ... 기타 enum

// 검증 실패 시: error 필드에 기록하고 raw_response는 저장 (나중에 수동 보정 가능)
```

### 3.6 환경 변수

```env
# scripts/.env.analyze (로컬 실행용)
LITELLM_BASE_URL=https://{ec2-domain-or-ip}
LITELLM_API_KEY={master-key}
LITELLM_MODEL=nova-lite          # 배치용 모델명

SUPABASE_URL={기존}
SUPABASE_SERVICE_ROLE_KEY={기존}

ANALYZE_VERSION=v1               # 현재 분석 버전
CONCURRENCY=10                   # 동시 요청 수
```

### 3.7 에러 처리 + 재시도

| 상황 | 처리 |
|------|------|
| API 타임아웃 | 3회 재시도 (exponential backoff: 2s, 4s, 8s) |
| JSON 파싱 실패 | error 기록 + raw_response 저장 |
| enum 유효성 실패 | error 기록 + raw_response 저장 (수동 보정 가능) |
| 이미지 URL 404 | error="image_not_found" 기록, 스킵 |
| Rate limit | 30초 대기 후 재시도 |
| 3회 연속 실패 | 해당 상품 스킵, 실패 목록에 추가 |

---

## 4. LiteLLM 게이트웨이 상세

### 4.1 엔드포인트

| 용도 | 모델명 | 실제 모델 | 호출처 |
|------|--------|----------|--------|
| 배치 분석 | `nova-lite` | Bedrock Nova Lite | 로컬 스크립트 |
| 프론트 분석 (이미지) | `gpt-4o-mini` | OpenAI GPT-4o-mini | Vercel Next.js |
| 프론트 분석 (텍스트) | `gpt-4o-mini` | OpenAI GPT-4o-mini | Vercel Next.js |

### 4.2 프론트 연동 변경

현재 `src/app/api/analyze/route.ts`에서 OpenAI SDK 직접 호출 → LiteLLM OpenAI-compatible 엔드포인트로 변경:

```typescript
// Before
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// After
const openai = new OpenAI({
  apiKey: process.env.LITELLM_API_KEY,
  baseURL: process.env.LITELLM_BASE_URL + "/v1",
})
```

모델명은 그대로 `gpt-4o-mini` — LiteLLM이 OpenAI로 라우팅.

### 4.3 보안

- Master key로 모든 요청 인증 (`Authorization: Bearer {key}`)
- 보안 그룹: 443 포트만 오픈
- 선택: IP 화이트리스트 (Vercel Edge IP 범위 + 로컬 IP)

---

## 5. 디렉토리 구조 변경

```
src/lib/
├── enums/
│   └── product-enums.ts         # [신규] 공유 enum 정의
│                                 #   CATEGORIES, SUBCATEGORIES, FITS,
│                                 #   FABRICS, COLOR_FAMILIES, STYLE_NODES,
│                                 #   MOOD_TAGS + 유효성 검증 함수

scripts/
├── analyze-products.ts          # [신규] 배치 분석 메인
├── lib/
│   └── product-analyzer.ts      # [신규] AI 호출 + 파싱
├── configs/
│   └── analyze-prompt.ts        # [신규] 분석 프롬프트
├── output/                      # [신규] 실행 결과 (gitignore)
│   └── failed-v1-*.json
└── .env.analyze                 # [신규] 배치 환경변수 (gitignore)

supabase/migrations/
└── 012_create_product_ai_analysis.sql  # [신규]

infra/                           # [신규] AWS 인프라 설정
├── docker-compose.yml
├── config/
│   ├── litellm.yaml
│   └── Caddyfile
└── scripts/
    └── setup.sh                 # EC2 초기 설정 스크립트
```

---

## 6. 기존 프롬프트와의 enum 정렬

배치 분석 프롬프트의 enum은 기존 `src/lib/prompts/analyze.ts`의 enum과 **완전히 동일**해야 한다.

| enum | 기존 (analyze.ts) | 배치 (analyze-prompt.ts) | 공유 소스 |
|------|-------------------|------------------------|-----------|
| category | 7개 | 동일 | `product-enums.ts` |
| subcategory | 카테고리별 목록 | 동일 | `product-enums.ts` |
| fit | 8개 | 동일 | `product-enums.ts` |
| fabric | 22개 | 동일 | `product-enums.ts` |
| color_family | 없음 (신규) | 16개 | `product-enums.ts` |
| style_node | 15개 | 동일 | `fashion-genome.ts` |
| mood_tags | 12개 | 동일 | `fashion-genome.ts` |

**중요**: `color_family`는 신규 enum. 프론트 분석 프롬프트(`analyze.ts`)에도 추가하여 양쪽이 동일한 color_family를 사용하도록 한다. 이 작업은 Part 2 (검색 엔진 리팩토링)에서 함께 진행.

---

## 7. 실행 계획

### Phase 1: 인프라 (1일)
1. AWS EC2 t4g.small 생성 + 보안 그룹
2. Docker + LiteLLM 설치 및 설정
3. Bedrock Nova Lite 모델 접근 활성화
4. IAM Role 설정
5. HTTPS (Caddy) 설정
6. 헬스체크 확인: `curl https://{domain}/health`

### Phase 2: DB + Enum (0.5일)
1. `012_create_product_ai_analysis.sql` 마이그레이션 실행
2. `src/lib/enums/product-enums.ts` 작성
3. 기존 프롬프트에서 enum import 변경

### Phase 3: 배치 스크립트 (1일)
1. `scripts/analyze-products.ts` 구현
2. `scripts/lib/product-analyzer.ts` 구현
3. `scripts/configs/analyze-prompt.ts` 구현
4. 소규모 테스트: `--limit 10 --dry-run` → `--limit 10`
5. 결과 확인 + 프롬프트 튜닝

### Phase 4: 전체 실행 + 검증 (0.5일)
1. 전체 15,000개 실행: `--version v1`
2. 결과 통계 확인 (성공/실패, 카테고리별 분포)
3. 샘플링 검증: 랜덤 50개 수동 확인
4. 실패 건 재시도: `--retry-failed`

### Phase 5: 프론트 연동 (0.5일)
1. Next.js analyze API → LiteLLM 엔드포인트 변경
2. 기존 OpenAI 직접 호출과 동일 동작 확인
3. 응답 속도/품질 비교 테스트

---

## NOT in scope (이번에 안 하는 것)

- 검색 엔진 로직 변경 (Part 2)
- Eval 파이프라인 구축 (Part 2)
- 어드민 대시보드 연동 (Part 2)
- 벡터 DB (Qdrant) 세팅 (장기 목표)
- CI/CD 파이프라인 (수동 배포로 시작)
- 모니터링/알림 (Datadog 등 — 추후)
- 프론트 분석 모델을 Nova Lite로 전환 (게이트웨이만 구성, 전환은 추후)
