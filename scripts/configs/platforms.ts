/**
 * 크롤링 대상 플랫폼 설정
 *
 * 새 사이트 추가: 이 배열에 SiteConfig 객체만 추가하면 됨
 * Cafe24 사이트는 대부분 기본 셀렉터로 동작 — 안 되면 selectors 오버라이드
 */

import type {SiteConfig} from "../lib/types"

export const PLATFORMS: SiteConfig[] = [
  // ─── Manual 설정 완료 (카테고리 구조 깔끔) ─────────

  {
    key: "shopamomento",
    name: "샵아모멘토",
    type: "cafe24",
    baseUrl: "https://shopamomento.com",
    paginate: true,
    maxPages: 20,
    pricePattern: /KRW\s*([\d,]+)/,
    priceCurrency: "₩",
    category: {
      discovery: "manual",
      categories: [
        // Women
        {name: "Outer", cateNo: 450, gender: ["women"]},
        {name: "Top", cateNo: 451, gender: ["women"]},
        {name: "Knitwear", cateNo: 689, gender: ["women"]},
        {name: "Bottom", cateNo: 460, gender: ["women"]},
        {name: "Dress", cateNo: 465, gender: ["women"]},
        {name: "Shoes", cateNo: 466, gender: ["women"]},
        {name: "Bag", cateNo: 467, gender: ["women"]},
        {name: "Accessories", cateNo: 469, gender: ["women"]},
        // Men
        {name: "Outer", cateNo: 490, gender: ["men"]},
        {name: "Top", cateNo: 491, gender: ["men"]},
        {name: "Shirts", cateNo: 493, gender: ["men"]},
        {name: "Knitwear", cateNo: 693, gender: ["men"]},
        {name: "Bottom", cateNo: 501, gender: ["men"]},
        {name: "Shoes", cateNo: 505, gender: ["men"]},
        {name: "Bag", cateNo: 544, gender: ["men"]},
        {name: "Accessories", cateNo: 507, gender: ["men"]},
      ],
    },
    notes: "Women 8 + Men 8 = 16개 카테고리",
  },
  {
    key: "slowsteadyclub",
    name: "슬로우스테디클럽",
    type: "cafe24",
    baseUrl: "https://slowsteadyclub.com",
    paginate: true,
    maxPages: 10,
    category: {
      discovery: "manual",
      categories: [
        {name: "Outer", cateNo: 683, gender: ["unisex"]},
        {name: "Top", cateNo: 742, gender: ["unisex"]},
        {name: "Knitwear", cateNo: 1020, gender: ["unisex"]},
        {name: "Bottom", cateNo: 755, gender: ["unisex"]},
        {name: "Shoes", cateNo: 783, gender: ["unisex"]},
        {name: "Bag", cateNo: 1341, gender: ["unisex"]},
        {name: "Accessories", cateNo: 798, gender: ["unisex"]},
      ],
    },
    notes: "unisex 편집샵. 7개 카테고리",
  },
  {
    key: "adekuver",
    name: "아데쿠베",
    type: "cafe24",
    baseUrl: "https://adekuver.com",
    paginate: true,
    maxPages: 10,
    category: {
      discovery: "manual",
      categories: [
        // Women
        {name: "Outer", cateNo: 121, gender: ["women"]},
        {name: "Top", cateNo: 119, gender: ["women"]},
        {name: "Bottom", cateNo: 118, gender: ["women"]},
        {name: "Dress", cateNo: 123, gender: ["women"]},
        {name: "Bag", cateNo: 117, gender: ["women"]},
        {name: "Shoes", cateNo: 120, gender: ["women"]},
        {name: "Accessories", cateNo: 116, gender: ["women"]},
        // Men
        {name: "Outer", cateNo: 115, gender: ["men"]},
        {name: "Top", cateNo: 113, gender: ["men"]},
        {name: "Bottom", cateNo: 112, gender: ["men"]},
        {name: "Bag", cateNo: 111, gender: ["men"]},
        {name: "Shoes", cateNo: 114, gender: ["men"]},
        {name: "Accessories", cateNo: 110, gender: ["men"]},
      ],
    },
    notes: "도산공원 편집샵. Women 7 + Men 6 = 13개 카테고리",
  },
  {
    key: "etcseoul",
    name: "이티씨서울",
    type: "cafe24",
    baseUrl: "https://etcseoul.com",
    paginate: true,
    maxPages: 10,
    category: {
      discovery: "manual",
      categories: [
        {name: "Outer", cateNo: 446, gender: ["unisex"]},
        {name: "Outer", cateNo: 170, gender: ["unisex"]}, // Jacket
        {name: "Knitwear", cateNo: 450, gender: ["unisex"]},
        {name: "Shirts", cateNo: 169, gender: ["unisex"]},
        {name: "Top", cateNo: 171, gender: ["unisex"]}, // T-Shirts
        {name: "Bottom", cateNo: 103, gender: ["unisex"]},
        {name: "Bottom", cateNo: 1368, gender: ["unisex"]}, // Shorts
        {name: "Shoes", cateNo: 137, gender: ["unisex"]},
        {name: "Accessories", cateNo: 26, gender: ["unisex"]}, // Headwear
        {name: "Accessories", cateNo: 27, gender: ["unisex"]},
      ],
    },
    notes: "unisex. Coat/Jacket 분리, 10개 카테고리",
  },
  {
    key: "visualaid",
    name: "VISUAL AID",
    type: "cafe24",
    baseUrl: "https://visualaid.kr",
    paginate: true,
    maxPages: 10,
    defaultGender: ["women"],
    category: {
      discovery: "manual",
      categories: [
        {name: "Outer", cateNo: 25, gender: ["women"]},
        {name: "Top", cateNo: 26, gender: ["women"]},
        {name: "Bottom", cateNo: 27, gender: ["women"]},
        {name: "Dress", cateNo: 306, gender: ["women"]},
        {name: "Bag", cateNo: 54, gender: ["women"]},
        {name: "Shoes", cateNo: 42, gender: ["women"]},
        {name: "Accessories", cateNo: 28, gender: ["women"]},
        {name: "Accessories", cateNo: 351, gender: ["women"]}, // Headwear
      ],
    },
    notes: "여성 전용. 8개 카테고리",
  },
  {
    key: "iamshop",
    name: "아이엠샵",
    type: "cafe24",
    baseUrl: "https://iamshop-online.com",
    paginate: true,
    maxPages: 10,
    category: {
      discovery: "manual",
      categories: [
        {name: "Outer", cateNo: 6695, gender: ["unisex"]},
        {name: "Top", cateNo: 6803, gender: ["unisex"]},
        {name: "Bottom", cateNo: 6802, gender: ["unisex"]},
        {name: "Shoes", cateNo: 6809, gender: ["unisex"]},
        {name: "Accessories", cateNo: 6815, gender: ["unisex"]},
      ],
    },
    notes: "더현대서울/판교. 5개 카테고리",
  },

  // ─── 구조 복잡 → 나중에 manual 설정 필요 ──────────

  {
    key: "8division",
    name: "8디비전",
    type: "cafe24",
    baseUrl: "https://www.8division.com",
    category: {discovery: "auto"},
    disabled: true,
    notes: "1000+ 카테고리 자동 탐색됨. manual 설정 필요",
  },
  {
    key: "sculpstore",
    name: "스컬프스토어",
    type: "cafe24",
    baseUrl: "https://sculpstore.com",
    category: {discovery: "auto"},
    disabled: true,
    notes: "브랜드 기반 네비게이션. manual 설정 필요",
  },
  {
    key: "fr8ight",
    name: "프레이트",
    type: "cafe24",
    baseUrl: "https://fr8ight.co.kr",
    category: {discovery: "auto"},
    disabled: true,
    notes: "브랜드 기반 (Eastlogue/Unaffected). manual 설정 필요",
  },
  {
    key: "heights-store",
    name: "하이츠스토어",
    type: "cafe24",
    baseUrl: "https://heights-store.com",
    category: {discovery: "auto"},
    disabled: true,
    notes: "JS 렌더링 복잡. manual 설정 필요",
  },
  {
    key: "llud",
    name: "LLUD",
    type: "cafe24",
    baseUrl: "https://llud.co.kr",
    category: {discovery: "auto"},
    selectors: {productItem: ".xans-product li"},
    disabled: true,
    notes: "마켓플레이스 (100+ 셀러). 구조 다름",
  },

  // ─── 카테고리 적음 / 구조 미약 → 보류 ─────────────

  {
    key: "obscura",
    name: "옵스큐라",
    type: "cafe24",
    baseUrl: "https://obscura-store.com",
    category: {discovery: "auto"},
    disabled: true,
    notes: "카테고리 구분 미약. 브랜드 기반",
  },
  {
    key: "samplas",
    name: "샘플라스",
    type: "cafe24",
    baseUrl: "https://samplas.co.kr",
    category: {discovery: "auto"},
    disabled: true,
    notes: "여성 전용. 카테고리 3~4개뿐",
  },
  {
    key: "empty",
    name: "엠프티",
    type: "cafe24",
    baseUrl: "https://empty.seoul.kr",
    category: {discovery: "auto"},
    disabled: true,
    notes: "카테고리 구조 숨김. JS 분석 필요",
  },

  // ─── 기타 비활성 ──────────────────────────────────

  {
    key: "opener",
    name: "오프너",
    type: "cafe24",
    baseUrl: "https://www.opener.co.kr",
    category: {discovery: "auto"},
    disabled: true,
    notes: "cate_no 패턴 없음",
  },
  {
    key: "addicted",
    name: "에딕티드",
    type: "cafe24",
    baseUrl: "https://www.addicted.co.kr",
    category: {discovery: "auto"},
    disabled: true,
    notes: "SSL 인증서 에러",
  },
  {
    key: "the-broken-arm",
    name: "THE BROKEN ARM",
    type: "shopify",
    baseUrl: "https://www.the-broken-arm.com",
    disabled: true,
    notes: "Shopify /products.json 403 차단",
  },
]

/** key로 사이트 설정 조회 */
export function getSiteConfig(key: string): SiteConfig | undefined {
  return PLATFORMS.find((p) => p.key === key)
}

/** 활성화된 사이트만 반환 */
export function getActivePlatforms(): SiteConfig[] {
  return PLATFORMS.filter((p) => !p.disabled)
}

/** 타입별 필터 */
export function getPlatformsByType(type: SiteConfig["type"]): SiteConfig[] {
  return getActivePlatforms().filter((p) => p.type === type)
}
