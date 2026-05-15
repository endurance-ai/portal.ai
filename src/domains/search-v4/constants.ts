// @MX:NOTE: [AUTO] v4 scoring constants — extracted verbatim from search-products/route.ts (SPEC-ARCH-APP-001 REQ-APP-004)
// @MX:REASON: Frozen by src/__characterization__/arch-app-001/v4-scoring.test.ts; values are byte-identical to the pre-extraction inline table.
// @MX:SPEC: SPEC-ARCH-APP-001
import {buildKoreanKeywordsMap} from "@/shared/enums/korean-vocab"

export const TARGET_RESULTS = 7
export const MAX_PER_BRAND = 2
export const MAX_PER_PLATFORM = 3
export const ACTIVE_VERSION = "v1"
export const MIN_VALID_PRICE = 1000 // ₩1,000 미만은 비정상 데이터

export const WEIGHTS = {
  subcategory: 0.25,
  subcategorySimilar: 0.10,
  nameMatch: 0.20,
  keywordsEach: 0.05,
  keywordsMax: 3,
  colorFamily: 0.20,
  colorAdjacent: 0.10,
  stylePrimary: 0.30,
  styleSecondary: 0.15,
  fit: 0.15,
  fabric: 0.15,
  moodTagEach: 0.05,
  moodTagMax: 3,
  season: 0.15,
  pattern: 0.15,
  brandDna: 0.20,
} as const

// 한국어 어휘 매핑에서 빌드한 키워드를 머지
const KOREAN_KEYWORDS_MAP = buildKoreanKeywordsMap()

// 서브카테고리 → 상품명 매칭 키워드 (EN + KO)
export const SUBCATEGORY_NAME_KEYWORDS: Record<string, string[]> = {
  blazer: ["blazer", "블레이저"],
  "denim-jacket": ["denim", "데님"],
  bomber: ["bomber", "봄버", "항공"],
  "field-jacket": ["field", "필드"],
  "leather-jacket": ["leather", "레더", "가죽"],
  overcoat: ["coat", "코트"],
  parka: ["parka", "파카"],
  "rain-jacket": ["rain", "레인"],
  vest: ["vest", "베스트", "조끼"],
  overshirt: ["overshirt", "오버셔츠"],
  cardigan: ["cardigan", "가디건"],
  shirt: ["shirt", "셔츠"],
  "t-shirt": ["t-shirt", "tee", "티셔츠", "반팔"],
  sweater: ["sweater", "knit", "니트", "스웨터"],
  hoodie: ["hoodie", "후디", "후드"],
  sweatshirt: ["sweatshirt", "스웻", "맨투맨"],
  "crop-top": ["crop", "크롭"],
  "tank-top": ["tank", "탱크", "나시", "슬리브리스"],
  polo: ["polo", "폴로"],
  jeans: ["jeans", "jean", "청바지"],
  "wide-pants": ["wide", "와이드"],
  "straight-pants": ["straight", "스트레이트"],
  "tapered-pants": ["taper", "테이퍼"],
  shorts: ["shorts", "short", "반바지", "쇼츠"],
  skirt: ["skirt", "스커트"],
  sneakers: ["sneaker", "스니커즈"],
  boots: ["boots", "boot", "부츠"],
  loafers: ["loafer", "로퍼"],
  sandals: ["sandal", "샌들"],
  heels: ["heel", "힐"],
  mules: ["mule", "뮬"],
  derby: ["derby", "더비"],
  tote: ["tote", "토트"],
  crossbody: ["crossbody", "크로스바디", "숄더"],
  backpack: ["backpack", "백팩"],
  clutch: ["clutch", "클러치"],
  "mini-dress": ["dress", "원피스", "드레스"],
  "midi-dress": ["dress", "원피스", "드레스"],
  "maxi-dress": ["dress", "원피스", "드레스"],
}

// 한국어 어휘 매핑의 키워드를 머지 (누락된 subcategory 키워드 보강)
for (const [sub, koKeywords] of Object.entries(KOREAN_KEYWORDS_MAP)) {
  if (!SUBCATEGORY_NAME_KEYWORDS[sub]) {
    SUBCATEGORY_NAME_KEYWORDS[sub] = koKeywords
  } else {
    for (const kw of koKeywords) {
      if (!SUBCATEGORY_NAME_KEYWORDS[sub].includes(kw)) {
        SUBCATEGORY_NAME_KEYWORDS[sub].push(kw)
      }
    }
  }
}

export const CATEGORY_ALIASES: Record<string, string[]> = {
  "Outer": ["Outer"],
  "Top": ["Top"],
  "Bottom": ["Bottom"],
  "Shoes": ["Shoes"],
  "Footwear": ["Shoes"],
  "Bag": ["Bag"],
  "Accessory": ["Accessories"],
  "Accessories": ["Accessories"],
  "Dress": ["Dress"],
  "Knitwear": ["Top"],
  "Shirts": ["Top"],
  "Socks": ["Accessories"],
}
