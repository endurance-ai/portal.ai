# Ximilar Fashion API 분석 & MOODFIT 개선 방향

> 작성일: 2026-04-01
> 목적: Ximilar Fashion API 조사 → 현재 MOODFIT 파이프라인과 비교 → 차용 가능한 아이디어 정리

---

## 목차

1. [Ximilar API 개요](#1-ximilar-api-개요)
2. [가격 비교](#2-가격-비교)
3. [MOODFIT 현재 파이프라인과 비교](#3-moodfit-현재-파이프라인과-비교)
4. [직접 도입이 어려운 이유](#4-직접-도입이-어려운-이유)
5. [차용할 아이디어 3가지](#5-차용할-아이디어-3가지)
6. [개선 액션 플랜](#6-개선-액션-플랜)

---

## 1. Ximilar API 개요

### 1.1 핵심 기능

| 기능 | 설명 |
|------|------|
| **Fashion Tagging** | 이미지 → 카테고리, 색상, 소재, 핏, 길이, 스타일 자동 분류 (~100개 모델) |
| **Visual Similarity Search** | 자체 인덱싱한 상품 DB에서 시각적으로 유사한 상품 검색 |
| **Text-to-Image Search** | 다국어 자연어 쿼리 → 매칭 상품 이미지 검색 |
| **Dominant Color Extraction** | Hex + Pantone 코드 + 커버리지 % 추출 |

### 1.2 Tagging 분류 체계 (Taxonomy)

**Top Categories**: Clothing, Footwear, Jewellery, Bags, Accessories, Underwear, Watch

**태그 차원 (9+)**:

| 차원 | 값 예시 |
|------|---------|
| Category | Clothing > Jackets/Coats > Overcoat |
| Subcategory | baby clothes, dresses, jackets/coats, pants, skirts, upper garments |
| Color | hex + pantone + 커버리지% |
| Style | casual, formal, sporty |
| Material | linen, cotton, leather, denim |
| Fit | straight, slim, oversized |
| Length | short, midi, long, cropped |
| Gender | men, women, unisex |
| Design/Pattern | melange, striped, solid, floral |

### 1.3 API 스펙

**인증**: `Authorization: Token YOUR_API_TOKEN` + `collection-id` 헤더

**주요 엔드포인트**:

| 엔드포인트 | 용도 | 크레딧 |
|-----------|------|--------|
| `/v2/detect_tags` | 가장 큰 아이템 1개 태깅 | 15 |
| `/v2/detect_tags_all` | 이미지 내 모든 아이템 태깅 | 60 |
| `/v2/meta` | 배경/씬/인물 메타데이터 | - |
| `.../v2/insert` | 상품 이미지 인덱싱 (Visual Search용) | - |
| `.../v2/visualKNN` | 시각 유사도 검색 | 1-10 |
| `.../text/.../v2/text` | 텍스트 → 이미지 검색 | - |

**요청 형식**: POST, JSON. `_url` 또는 `_base64`로 이미지 전달. 배치 최대 10건.

**응답 구조**:
- `_objects[]` — bounding box(px), confidence, area
- `_tags` — 계층적 태그 (확률 포함)
- `_tags_map` — key-value 단순화
- `_tags_simple` — 평면 태그 리스트

**SDK**: Python 공식 (`pip install ximilar-client`), JS/Node.js SDK 없음 (REST 직접 호출)

---

## 2. 가격 비교

### 2.1 Ximilar 플랜

| 플랜 | 월 비용 | 크레딧 | 태깅 호출 수 (15cr/건) |
|------|---------|--------|----------------------|
| Free | €0 | 1,000 | ~66회 |
| Business 100K | €59 | 100,000 | ~6,600회 |
| Business 300K | €175 | 300,000 | ~20,000회 |
| Professional | €499+ | 1M+ | ~66,000회+ |

### 2.2 GPT-4o-mini Vision (현재 사용 중)

| 상품 수 | 비용 (건당 ~$0.003) | 비고 |
|---------|---------------------|------|
| 1,000개 | $3 (~4,000원) | |
| 10,000개 | $30 (~40,000원) | |
| 50,000개 | $150 (~200,000원) | |

### 2.3 비용 비교 요약

| 10,000건 기준 | Ximilar | GPT-4o-mini |
|--------------|---------|-------------|
| 비용 | €175/월 (300K 플랜 필요) | **$30 (일회성)** |
| 무드/스타일노드 | 불가 | 가능 |
| 분류 체계 커스텀 | 불가 (고정 taxonomy) | **자유 정의** |
| 추가 API 키 | 필요 | 이미 보유 |

---

## 3. MOODFIT 현재 파이프라인과 비교

### 3.1 사용자 이미지 분석 (실시간)

| | Ximilar | MOODFIT (GPT-4o-mini) |
|---|---------|----------------------|
| 카테고리 분류 | Clothing > Jackets > Overcoat | Outer, Top, Bottom, Shoes, Bag 등 |
| 색상 | Hex + Pantone + 커버리지% | Hex + 색상명 |
| 소재 | cotton, leather, wool 등 | 자유 서술 ("washed denim") |
| 핏 | straight, slim, oversized | oversized, relaxed, regular, slim |
| **무드/바이브** | **불가** | tags + score + vibe + season + occasion |
| **Fashion Genome** | **불가** | 14개 스타일 노드 (A-1 ~ I) 분류 |
| **검색 쿼리 생성** | **불가** | 아이템별 searchQuery 자동 생성 |
| **위치 좌표** | bounding box (px) | position % (핫스팟 UI용) |

**결론**: 사용자 이미지 분석은 GPT가 Ximilar보다 **우리 유스케이스에 더 적합**.

### 3.2 상품 검색

| | Ximilar Visual Search | MOODFIT (Tier 1-4) |
|---|----------------------|-------------------|
| 방식 | 이미지 임베딩 유사도 | 키워드 substring 매칭 → SerpApi 폴백 |
| 정확도 | **높음** (시각적 유사도) | 낮음 (키워드 불일치 시 실패) |
| 전제 조건 | **자체 상품 인덱스 필수** | 상품 DB + SerpApi |
| 검색 속도 | 빠름 | Tier 4(SerpApi) 시 느림 |

**결론**: 상품 검색은 Ximilar의 Visual Search가 우수하나, **자체 상품 인덱스 구축이 전제**. 현재 POC 단계에서는 상품 수가 적어 도입 시기상조.

---

## 4. 직접 도입이 어려운 이유

| 이유 | 상세 |
|------|------|
| **무드/바이브 분석 불가** | 우리 서비스의 핵심 차별점인 감성 분석을 Ximilar는 제공하지 않음 |
| **Fashion Genome 미지원** | 14개 스타일 노드 기반 분류는 우리 고유 체계 — Ximilar taxonomy와 호환 불가 |
| **Visual Search = 자체 DB 필수** | 상품 이미지를 직접 인덱싱해야 함. 현재 상품 수로는 의미 없음 |
| **이중 API 비용** | GPT(분석) + Ximilar(태깅/검색) = 불필요한 비용 증가 |
| **JS SDK 없음** | Next.js 서버에서 REST 직접 호출 필요 — 유지보수 부담 |

---

## 5. 차용할 아이디어 3가지

### 5.1 표준화된 태깅 분류 체계 (Taxonomy)

**Ximilar의 강점**: 카테고리/핏/소재/색상 등이 **고정된 enum 값**으로 분류됨. 일관성 보장.

**현재 MOODFIT 문제**: GPT가 자유 형식으로 반환 → 같은 옷도 "Oversized Wool Coat" / "Relaxed Woolen Overcoat" 등 들쭉날쭉 → 키워드 매칭 실패.

**개선 방향**: GPT 프롬프트에 표준 enum 제약 추가

```
현재: "detail": "Relaxed single-breasted wool overcoat"  (자유 서술)
개선: "fit": "oversized",  (enum: oversized|relaxed|regular|slim|skinny)
      "fabric": "wool",    (enum: wool|cotton|denim|leather|nylon|polyester|...)
      "subcategory": "overcoat"  (enum: overcoat|bomber|blazer|parka|...)
```

**효과**: 상품 DB에도 같은 enum으로 태깅되어 있으면, 자유 텍스트 매칭 대신 **구조화된 필터링** 가능.

### 5.2 색상 Hex 기반 유사도 매칭

**Ximilar의 강점**: Hex + Pantone + 커버리지%로 정량적 색상 분석.

**현재 MOODFIT 문제**: 색상을 "charcoal grey" 같은 텍스트로만 처리 → "dark grey"와 매칭 실패.

**개선 방향**:
- GPT가 각 아이템의 대표 색상을 **Hex 코드**로 반환 (이미 `palette`에서 하고 있음)
- 상품 DB에도 대표 색상 Hex 저장
- 검색 시 **색상 거리(ΔE)** 기반 필터링 추가

```typescript
// 색상 유사도 계산 (간단 버전)
function colorDistance(hex1: string, hex2: string): number {
  const [r1,g1,b1] = hexToRgb(hex1)
  const [r2,g2,b2] = hexToRgb(hex2)
  return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2)
}
// ΔE < 50 이면 "유사한 색상"으로 판정
```

### 5.3 상품 자동 태깅 파이프라인 (향후)

**Ximilar의 모델**: 상품 이미지 인덱싱 시 자동으로 태그 부여 → 검색 정확도 향상.

**MOODFIT 적용 (상품 DB 확장 시)**:
- 크롤링한 상품 이미지를 GPT-4o-mini Vision으로 자동 태깅
- 5.1의 표준 enum 체계로 분류
- Supabase `products` 테이블에 구조화된 태그 저장
- 비용: 10,000개 기준 $30 (일회성)

> **현재 결정**: 당장 실행하지 않음. 상품 DB 확장 시점에 재검토.

---

## 6. 개선 액션 플랜

### 즉시 적용 가능 (코드 변경만으로)

| # | 액션 | 변경 대상 | 효과 | 난이도 |
|---|------|----------|------|--------|
| 1 | GPT 프롬프트에 **표준 enum 제약** 추가 | `api/analyze/route.ts` 프롬프트 | 태깅 일관성 ↑, 검색 매칭률 ↑ | 낮음 |
| 2 | 아이템별 **색상 Hex** 반환 강제 | `api/analyze/route.ts` 프롬프트 | 색상 기반 필터링 기반 마련 | 낮음 |
| 3 | `searchQuery` 생성 시 **enum 값 활용** | `api/analyze/route.ts` 프롬프트 | 검색 쿼리 품질 ↑ | 낮음 |

### 상품 DB 확장 시 적용

| # | 액션 | 전제 조건 | 효과 | 난이도 |
|---|------|----------|------|--------|
| 4 | 상품 테이블에 **구조화 태그 컬럼** 추가 | DB 마이그레이션 | 필터 검색 가능 | 중간 |
| 5 | **색상 Hex 유사도** 기반 상품 필터링 | 상품에 color_hex 존재 | 색상 매칭 정확도 ↑ | 중간 |
| 6 | **GPT 자동 태깅** 배치 스크립트 | 크롤링 파이프라인 구축 | 수동 분류 제거 | 중간 |

### 장기 (MVP 이후)

| # | 액션 | 전제 조건 | 효과 | 난이도 |
|---|------|----------|------|--------|
| 7 | **pgvector 임베딩** 기반 시각 유사도 검색 | 충분한 상품 DB | Ximilar Visual Search와 동등 | 높음 |
| 8 | 사용자 클릭/구매 **피드백 루프** | 로깅 인프라 (이미 준비됨) | 추천 정확도 지속 개선 | 높음 |

---

## 참고 자료

- [Ximilar Fashion Search Docs](https://docs.ximilar.com/visual-search/fashion)
- [Ximilar Fashion Tagging Docs](https://docs.ximilar.com/tagging/fashion)
- [Ximilar Pricing](https://www.ximilar.com/pricing/)
- [Ximilar Python SDK](https://pypi.org/project/ximilar-client/)
- 내부: `docs/research/26-03-27-product-database-construction-research.md` (상품 DB 구축 리서치)
