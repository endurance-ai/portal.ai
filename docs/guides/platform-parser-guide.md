# 플랫폼 파서 생성 가이드

새로운 Cafe24 플랫폼의 상세/리뷰 파서를 만드는 워크플로우.

## 1. 테스트 크롤링 (3개 상품)

### 1-1. 상품 URL 확보

```bash
python3 -c "
import json
d = json.load(open('data/{platform}-products.json'))
for p in d[:3]:
    print(p.get('productUrl', 'N/A'))
"
```

### 1-2. 페이지 구조 탐색

테스트 스크립트(`scripts/test-detail-crawl.ts`)로 아래 항목 확인:

| 확인 항목 | 탐색 방법 |
|-----------|-----------|
| **Description** | `.xans-product-additional`, `#prdDetail`, `.ec-base-tab`, `li[data-name]` 등 셀렉터 후보 |
| **Material** | body text에서 `소재`, `혼용률`, `Material`, `OUTSHELL`, `겉감` 등 키워드 매칭 |
| **Color/Options** | `select[name*="option"] option` |
| **Product Code** | `.product_code`, body text에서 `CODE` 패턴 |
| **Review** | `a[href*="board"]` 개수, body text에서 `리뷰(N)` 패턴 |

### 1-3. 판정 기준

| 결과 | 액션 |
|------|------|
| 텍스트로 description/material 추출 가능 | 커스텀 파서 생성 |
| 100% 이미지 기반 (텍스트 없음) | `disabled: true` 처리 후 스킵 |
| base parser 셀렉터로 이미 추출됨 | 커스텀 파서 불필요 (base 사용) |

## 2. 파서 생성

### 2-1. Detail 파서

`scripts/lib/parsers/detail/{platform}-parser.ts` 생성:

```typescript
import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

export class {Platform}DetailParser implements IDetailParser {
  async parse(page: Page, productUrl: string): Promise<DetailData> {
    const result: DetailData = {
      description: null,
      color: null,
      material: null,
      productCode: null,
    }

    try {
      await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
      await page.waitForTimeout(800)

      // 플랫폼별 추출 로직
      // - $eval: 단일 요소 텍스트
      // - $$eval: 복수 요소 (옵션 등)
      // - page.evaluate: body text 패턴 매칭
    } catch (err) {
      console.warn(`   ⚠️ 상세 파싱 실패: ${productUrl} — ${(err as Error).message}`)
    }

    return result
  }
}
```

**DetailData 스펙:**

| 필드 | 타입 | 설명 | 제한 |
|------|------|------|------|
| `description` | `string \| null` | 상품 설명 | 2000자 |
| `color` | `string \| null` | 컬러/옵션 (쉼표 구분) | 20개, 500자 |
| `material` | `string \| null` | 소재 조성 | 500자 |
| `productCode` | `string \| null` | 상품 코드/SKU | — |

### 2-2. Review 파서

- **리뷰 없음** → `NoopReviewParser` 사용 (별도 파서 불필요)
- **리뷰 있음** → `CompositeReviewParser`(기본값) 또는 커스텀 파서

## 3. 레지스트리 등록

### `scripts/lib/parsers/detail/index.ts`

```typescript
// 3곳에 추가:
export { {Platform}DetailParser } from "./{platform}-parser"       // export
import {{Platform}DetailParser} from "./{platform}-parser"         // import
  {platform}: () => new {Platform}DetailParser(),                  // DETAIL_PARSERS
```

### `scripts/lib/parsers/review/index.ts`

```typescript
// 리뷰 없는 경우:
  {platform}: () => new NoopReviewParser(),                        // REVIEW_PARSERS
```

## 4. 크롤링 실행

```bash
# 상세만
npx tsx scripts/crawl.ts --site={platform} --detail

# 상세 + 리뷰
npx tsx scripts/crawl.ts --site={platform} --detail --reviews
```

## 5. 플랫폼별 구조 패턴 레퍼런스

지금까지 발견된 Cafe24 사이트 구조 유형:

| 패턴 | 설명 | 대표 사이트 |
|------|------|-------------|
| **data-name 탭** | `li[data-name="details/material/size"] > div` | swallowlounge |
| **xans-product-additional 정형** | 시즌정보 → 소재 → 사이즈 → 상세설명 순서 | slowsteadyclub |
| **body text 키워드** | `[MATERIAL]`, `혼용률:`, `OUTSHELL :` 등 패턴 매칭 | etcseoul, sculpstore, havati |
| **ec-base-tab** | Cafe24 기본 탭 (상품결제정보 탭 내 설명) | anotheroffice |
| **상품간략설명 테이블** | `.xans-product-detaildesign tr` 에서 상품간략설명 행 | sculpstore |
| **하단 구조화 정보** | `소재 - ...`, `색상 - ...`, `제조국 - ...` 패턴 | etcseoul |
| **100% 이미지** | 텍스트 추출 불가 → disabled 처리 | beslow |

## 6. 주의사항

- `page.evaluate()` 안에서 `function` 키워드 사용 시 tsx가 `__name` 헬퍼를 주입해 에러 발생 → `$eval` / `$$eval` 사용 권장
- 이미지 차단(`page.route`)으로 크롤 속도 향상 가능하나, 일부 사이트는 이미지 로드 후 JS 실행되므로 주의
- `waitForTimeout(800)` 은 최소값 — JS가 무거운 사이트는 1500~2000ms 필요
