# HANDOFF — 2026-04-03

> Fashion Genome DB v2 연동 + 크롤러 확장 + 검색 로직 개선 + 코드 리뷰 반영
> 다음 세션 목표: **데이터 정합성 맞추기 — 엑셀 DB / 크롤링 데이터 / AI 출력 간 매핑 최적화**

---

## 완료된 작업

### DB 스키마 & 데이터

- [x] **마이그레이션 007**: `brand_nodes` v2 스키마 (`brand_name_normalized`, `brand_keywords`, `category_type`, `source_platforms`)
- [x] **마이그레이션 008**: `products.product_url` UNIQUE, `style_node` CHECK 제약, `(category, in_stock)` 복합 인덱스, `brand_name_normalized` NOT NULL
- [x] **import-brand-nodes.ts** v2 엑셀 파서 → 1,066개 브랜드 적재 완료 (에러 0)
- [x] **fashion-genome.ts** 동기화: K노드(영_캐주얼) 추가, SENSITIVITY_TAGS 12종 엑셀 v2에 맞춰 교체

### 검색 로직 (`search-products/route.ts` 전면 개선)

- [x] 감도 부스트: 한국어 sensitivityTags ↔ 브랜드 sensitivity_tags + brand_keywords 매칭 (영어↔한국어 버그 수정)
- [x] 제외 브랜드 필터링 (`category_type = "제외"`)
- [x] 아이콘 이미지 필터 (`icon_`, `logo_`, `badge_` URL 제외)
- [x] `getNodeBrands` 2개 쿼리 `Promise.all` 병렬화
- [x] 스코어 상수 추출 (`SCORE_WEIGHTS`, `TARGET_RESULTS`, `MAX_PER_BRAND`)
- [x] 입력 검증, SerpApi 타입 방어 등

### AI 분석

- [x] `max_tokens` 1500 → 2500 + `finish_reason` 경고 로그
- [x] 프롬프트: `item.id` 중복 방지 ("top_1, top_2"), `style.gender` 필드 제거

### 크롤러 (대폭 개선)

- [x] **3개 플랫폼 신규 활성화**: 8division, sculpstore, fr8ight
- [x] **이미지 셀렉터**: icon/logo/badge 패턴 + 50px 미만 건너뛰기
- [x] **품절 판정 수정**: `[class*="soldout"], .sold` + CSS computed display + 숨겨진 요소 텍스트 폴백 제외
- [x] **상품명 추출**: `displaynone` 건너뛰기 + 쓰레기값 필터링 + `.nm span/a` 셀렉터 추가
- [x] **import-products.ts**: per-file try/catch, 가격 sanitize (1억원 초과 → null)
- [x] **import-brand-nodes.ts**: `.ilike()` 분리 호출 (A.P.C. 등 안전)
- [x] `crawl-shopamomento.ts` 레거시 삭제

### 문서

- [x] `docs/plans/26-03-31-fashion-genome-integration-roadmap.md` 전면 최신화 — v2 품질 점검, 팀원 체크리스트

---

## 크롤링 현황 (JSON 기준, 2026-04-03)

| 플랫폼 | 상품 | 재고 | 브랜드 | 상태 |
|--------|------|------|--------|------|
| shopamomento | 612 | 612 | 45 | ✅ |
| adekuver | 1,792 | 1,622 | 67 | ✅ (가격 이상값 import 시 sanitize) |
| etcseoul | 2,629 | 2,629 | 146 | ✅ |
| visualaid | 161 | 161 | **161** | ⚠️ 브랜드 추출 이상 (브랜드=상품명) |
| iamshop | 204 | 204 | 28 | ✅ |
| sculpstore | 5,819 | 4,644 | **0** | ⚠️ 브랜드 전부 빈 값 (`.b` 셀렉터) |
| fr8ight | 2,551 | 2,223 | 86 | ✅ |
| slowsteadyclub | 1,646 | **0** | 84 | ❌ 재크롤링 필요 |
| 8division | 45 | **0** | 10 | ❌ 재크롤링 필요 |
| **합계** | **15,459** | **12,095** | — | |

### Supabase products 테이블

- **아직 재임포트 안 함** — 기존 v1 데이터 잔존 가능
- `TRUNCATE products;` 후 전체 재임포트 권장

---

## 다음 세션: 즉시 해야 할 것

### 1. 크롤러 브랜드 추출 수정 + 재크롤링

```
sculpstore: 브랜드가 <p class="b">BRAND</p> → cafe24-engine.ts 브랜드 셀렉터에 ".b", "p.b" 추가
visualaid: 브랜드 추출이 상품명 중복 → DOM 구조 확인 필요
slowsteadyclub: 품절 수정 반영 → 재크롤링만
8division: 품절 수정 반영 → 재크롤링만
```

재크롤링 커맨드:
```bash
pnpm exec dotenv -e .env.local -- npx tsx scripts/crawl.ts --site=slowsteadyclub
pnpm exec dotenv -e .env.local -- npx tsx scripts/crawl.ts --site=8division
pnpm exec dotenv -e .env.local -- npx tsx scripts/crawl.ts --site=sculpstore
pnpm exec dotenv -e .env.local -- npx tsx scripts/crawl.ts --site=visualaid
```

### 2. 전체 임포트

```bash
# products 테이블 초기화 (Supabase SQL Editor)
TRUNCATE products;

# 전체 임포트
pnpm exec dotenv -e .env.local -- npx tsx scripts/import-products.ts
```

### 3. 커밋

11개 파일 수정, +645 -472 미커밋 상태.

---

## 다음 단계: 데이터 정합성 맞추기

### 데이터 흐름 3개 레이어

```
[레이어 1] 엑셀 DB (Fashion Genome v2) — 팀원 관리
    1,079개 브랜드 × {노드, 태그, 키워드, 성별, 가격대, 소스 플랫폼}
         ↓ import-brand-nodes.ts
[레이어 2] Supabase brand_nodes — 자동 적재
         ↓ brand_name으로 products와 조인
[레이어 3] Supabase products — 크롤러 수집
    ~15,000개 상품 × {브랜드, 이름, 가격, 이미지, 카테고리, 성별}
         ↓ AI 분석 결과와 매칭
[레이어 4] AI 분석 출력 — GPT-4o-mini Vision
    {styleNode, sensitivityTags, items[].searchQuery}
```

### 현재 매칭 병목 (우선순위 순)

| 구간 | 문제 | 영향 | 해결 방향 |
|------|------|------|-----------|
| **[4]→[3]** AI searchQuery(영어) ↔ 상품명 | 한국어 상품명 28% 매칭 불가 | 높음 | 상품 이미지 AI 매핑 or 임베딩 |
| **[3]→[2]** products.brand ↔ brand_nodes | 브랜드 빈 값 38% (sculpstore) | 높음 | 크롤러 브랜드 셀렉터 수정 |
| **[1]→[3]** 엑셀 브랜드 ↔ 크롤링 브랜드 | 대소문자/표기 불일치 | 중간 | lower() 매칭 + 정규화 맵 |
| **[4]→[2]** AI 태그 ↔ 브랜드 태그 | ~~영어↔한국어~~ | 해결됨 | — |

### 팀원에게 공유할 엑셀 DB 이슈

로드맵 문서 부록에 체크리스트로 정리됨 (`docs/plans/26-03-31-fashion-genome-integration-roadmap.md`):

- [ ] source_platforms 빈 값 27개 — 크롤링 대상 편집샵에 입점 확인
- [ ] 보류 아이웨어 13개 — 노드 배정 or 제외 결정
- [ ] 저가대(~10만) 브랜드 2개뿐 — 의도적 제외인지 확인
- [ ] brand_keywords 스팟체크 — 노드별 샘플 50개
- [ ] 인접 노드 관계 검토

### 상품 이미지 AI 무드 매핑 (검토 완료, 실행 대기)

- **비용**: ~$36 (12,000개 × $0.003)
- **효과**: 상품 레벨 노드/태그 → 한국어 상품명 문제 해결, 브랜드 없는 상품도 매칭 가능
- **권장**: 50개 샘플 테스트 먼저 → 품질 확인 후 전체 실행
- **주의**: 상품 이미지 품질 편차 (모델컷 vs 제품컷 vs 행거컷)

---

## 코드 리뷰 잔여 (미반영)

3개 서브에이전트 리뷰에서 이번에 처리 못 한 항목:

**아키텍처**
- [ ] `search-products` → `lib/product-search/` 분리
- [ ] 크롤러 플랫폼 디스패치 → 엔진 레지스트리 패턴
- [ ] `platforms.ts` → 디렉토리 구조

**DB**
- [ ] `brand_nodes ↔ products` FK 또는 lower() 정합성 검증
- [ ] `analyses` JSONB 컬럼 정리
- [ ] 미사용 컬럼 (`gender_appended`, `search_query_sent`)

**크롤러**
- [ ] `page.evaluate` 내 `new Date()` → Node 타임스탬프 전달
- [ ] 빈 페이지 시 에러 로깅 (현재 silent break)

---

## 파일 변경 (미커밋)

```
수정 11개 파일, +645 -472:
  docs/plans/26-03-31-fashion-genome-integration-roadmap.md
  next.config.ts
  scripts/configs/platforms.ts
  scripts/import-brand-nodes.ts
  scripts/import-products.ts
  scripts/lib/cafe24-engine.ts
  src/app/api/analyze/route.ts
  src/app/api/search-products/route.ts
  src/lib/fashion-genome.ts
  src/lib/prompts/analyze.ts

삭제:
  scripts/crawl-shopamomento.ts

신규:
  supabase/migrations/007_upgrade_brand_nodes_v2.sql
  supabase/migrations/008_add_constraints_and_indexes.sql
  data/Fashion_genome_root_source_platforms_final.xlsx
```

## 엑셀 DB 파일 위치

- 기존: `/Users/hansangho/Desktop/스타트업/DB/Fashion_genome_root.xlsx`
- **신규 (v2)**: `/Users/hansangho/Desktop/스타트업/DB/Fashion_genome_root_source_platforms_final.xlsx`
- 프로젝트 복사본: `data/Fashion_genome_root_source_platforms_final.xlsx`
