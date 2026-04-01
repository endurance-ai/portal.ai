# HANDOFF — Fashion Genome 연동 세션 (2026-03-31)

## 완료된 작업

### 1. Fashion Genome DB 분석
- 동료가 만든 `Fashion_genome_root.xlsx` 전체 파악 완료
- 5개 시트: Platform_DB(41개 플랫폼), Style_DB(15개 노드), Node_Criteria, Brand_DB(1,079개 브랜드), Guide
- 감도 태그 12종, 노드 분포, 플랫폼별 브랜드 수 등 통계 분석

### 2. AI 프롬프트 개편 — 스타일 노드 체계 주입
- `src/lib/fashion-genome.ts` — 15개 노드 + 12개 태그를 TypeScript ENUM으로 정의. `buildNodeReference()`, `buildTagList()` 함수로 프롬프트에 자동 주입
- `src/lib/prompts/analyze.ts` — 프롬프트를 별도 파일로 분리
- `src/app/api/analyze/route.ts` — HTTP 핸들링만 남기고 프롬프트 import
- AI 출력에 `styleNode` (primary/secondary + confidence + reasoning) + `sensitivityTags` 필드 추가

### 3. Supabase 마이그레이션
- `supabase/migrations/003_add_style_node_columns.sql` 작성
- `style_node_primary`, `style_node_secondary`, `style_node_confidence`, `sensitivity_tags` 컬럼 추가
- **⚠️ 아직 Supabase Dashboard에서 실행 필요** — 실행 전까지 insert 에러 발생

### 4. 로깅 시스템 추가 (pino)
- `src/lib/logger.ts` — pino + pino-pretty 설정
- `src/app/api/analyze/route.ts` — 이미지 수신, AI 분석, 스타일 노드, 감도 태그, 아이템, 팔레트 등 전 과정 한글 이모지 로깅
- `src/app/api/search-products/route.ts` — 검색 쿼리, 결과 수, 최종 상품 등 로깅

### 5. 성별 선택 UI (Daydream 스타일)
- `src/components/upload/gender-selector.tsx` — Womens / Mens 필 탭 (framer-motion layoutId 애니메이션)
- `src/app/page.tsx` — 업로드 전 성별 선택 → 상품 검색에 유저 선택값 전달 (AI 추론 대신)

### 6. 기획 문서
- `docs/plans/26-03-31-fashion-genome-integration-roadmap.md` — POC/MVP/운영 3단계 로드맵 (DB 보완, 유저 입력, UI 제안)

### 7. 크롤링 가능성 조사
- **SSENSE**: ❌ 불가 — Cloudflare + PerimeterX 이중 방어, TOS에서 상업적 크롤링 명시 금지. 403 확인 완료. 제휴만 가능
- **샵아모멘토**: ⚠️ 가능 — Cafe24 기반, robots.txt 허용, 봇 감지 없음. 단 JS 렌더링 필요 (Playwright)

## 진행 중인 작업

### 샵아모멘토 크롤러
- `scripts/crawl-shopamomento.ts` 작성 완료 (Playwright + Chromium)
- Women(cate_no=445), Men(cate_no=446) 카테고리 대상
- **아직 실행 안 함** — 다음 세션에서 실행 필요
- 실행: `npx tsx scripts/crawl-shopamomento.ts`
- 출력: `data/shopamomento-products.json`

### Platform_DB URL + 크롤링 가능성 조사
- 다른 에이전트에 위임 예정이었음
- Platform_DB에 URL이 거의 없음 (샵아모멘토, SSENSE 2개만)
- 나머지 40개 플랫폼의 URL 수집 + 크롤링/제휴 가능성 조사 필요
- 결과를 엑셀 Platform_DB 시트에 직접 업데이트

## 다음에 해야 할 것

### 즉시 (이번 주)
2. **크롤러 실행** — 샵아모멘토 상품 수집 테스트
3. **크롤러 셀렉터 튜닝** — Cafe24 구조에 맞게 조정 필요할 수 있음
4. **Platform_DB URL 채우기** — 40개 플랫폼 URL + 크롤링 가능성 notes

### 다음 단계
5. 크롤링된 상품 데이터 → Supabase 테이블에 적재
6. 스타일 노드 기반 매칭 로직 구현 (AI가 뽑은 노드 → Brand_DB → 실제 상품)
7. SerpApi 의존도 줄이기 — 자체 상품 DB에서 검색하도록 전환

## 중요한 결정사항/컨텍스트

### 구글 쇼핑(SerpApi) 사용 중단 예정
- 현재 SerpApi로 Google Shopping 검색 중이지만, 앞으로 사용 안 할 계획
- 자체 상품 DB (크롤링 + 어필리에이트) 기반으로 전환

### DB 매칭 전략
- AI가 이미지에서 스타일 노드(15개) + 감도 태그(12개) 추출
- Brand_DB에서 해당 노드의 브랜드 풀 필터링
- 아이템별 검색 쿼리로 브랜드 풀 내 상품 검색
- 가격대 필터는 나중에 추가 (price_band 데이터 채워진 후)

### 타겟 쇼핑몰
- **무신사/29CM은 안 함** — 대기업 플랫폼은 제외
- **편집샵 중심** — 샵아모멘토, 조하리스토어 등 감도 높은 소규모 편집샵
- **해외** — SSENSE (제휴 필요), 기타 해외 편집샵
- 어필리에이트도 병행 검토 중 (링크프라이스 등)

### 파일 구조 (이번 세션에서 추가/수정)
```
src/lib/fashion-genome.ts        ← NEW: 노드/태그 ENUM
src/lib/prompts/analyze.ts       ← NEW: AI 프롬프트 분리
src/lib/logger.ts                ← NEW: pino 로거
src/components/upload/gender-selector.tsx  ← NEW: 성별 탭
src/app/api/analyze/route.ts     ← MODIFIED: 노드 출력 + 로깅
src/app/api/search-products/route.ts  ← MODIFIED: 로깅
src/app/page.tsx                 ← MODIFIED: 성별 선택 연동
supabase/migrations/003_add_style_node_columns.sql  ← NEW
scripts/crawl-shopamomento.ts    ← NEW: 크롤러
docs/plans/26-03-31-fashion-genome-integration-roadmap.md  ← NEW
```
