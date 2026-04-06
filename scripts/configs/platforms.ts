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
    paginate: true,
    maxPages: 20,
    category: {
      discovery: "manual",
      categories: [
        // 온라인샵 (unisex 편집샵 — 성별 구분 없음)
        {name: "Top", cateNo: 218, gender: ["unisex"]}, // 상의
        {name: "Outer", cateNo: 220, gender: ["unisex"]}, // 아우터
        {name: "Bottom", cateNo: 219, gender: ["unisex"]}, // 하의
        {name: "Shoes", cateNo: 223, gender: ["unisex"]}, // 신발
        {name: "Bag", cateNo: 222, gender: ["unisex"]}, // 가방
        {name: "Accessories", cateNo: 229, gender: ["unisex"]}, // 악세사리
        {name: "Accessories", cateNo: 224, gender: ["unisex"]}, // 모자
        {name: "Accessories", cateNo: 221, gender: ["unisex"]}, // 벨트
        {name: "Accessories", cateNo: 1078, gender: ["unisex"]}, // 주얼리
      ],
    },
    notes: "unisex 편집샵. 700+ cate_no 중 의류 카테고리 9개만 사용. 브랜드(Needles, EG 등) 카테고리 제외",
  },
  {
    key: "sculpstore",
    name: "스컬프스토어",
    type: "cafe24",
    baseUrl: "https://sculpstore.com",
    paginate: true,
    maxPages: 15,
    category: {
      discovery: "manual",
      categories: [
        // 카테고리 (unisex — 성별 구분 없음)
        {name: "Top", cateNo: 77, gender: ["unisex"]}, // 티셔츠
        {name: "Shirts", cateNo: 74, gender: ["unisex"]}, // 셔츠
        {name: "Top", cateNo: 76, gender: ["unisex"]}, // 스웻
        {name: "Knitwear", cateNo: 71, gender: ["unisex"]}, // 니트
        {name: "Top", cateNo: 78, gender: ["unisex"]}, // 베스트
        {name: "Outer", cateNo: 70, gender: ["unisex"]}, // 자켓
        {name: "Outer", cateNo: 64, gender: ["unisex"]}, // 코트
        {name: "Outer", cateNo: 66, gender: ["unisex"]}, // 다운파카
        {name: "Bottom", cateNo: 72, gender: ["unisex"]}, // 긴바지
        {name: "Bottom", cateNo: 73, gender: ["unisex"]}, // 반바지
        {name: "Bottom", cateNo: 65, gender: ["unisex"]}, // 데님
        {name: "Bottom", cateNo: 75, gender: ["unisex"]}, // 스커트
        {name: "Shoes", cateNo: 68, gender: ["unisex"]}, // 신발
        {name: "Shoes", cateNo: 390, gender: ["unisex"]}, // 샌들
        {name: "Accessories", cateNo: 69, gender: ["unisex"]}, // 모자
        {name: "Bag", cateNo: 52, gender: ["unisex"]}, // 가방 & 지갑
        {name: "Accessories", cateNo: 51, gender: ["unisex"]}, // 액세서리
      ],
    },
    notes: "unisex 편집샵 (Eastlogue, EG, Kapital 등). 브랜드 카테고리 제외, 의류 17개 카테고리",
  },
  {
    key: "fr8ight",
    name: "프레이트",
    type: "cafe24",
    baseUrl: "https://fr8ight.co.kr",
    paginate: true,
    maxPages: 15,
    category: {
      discovery: "manual",
      categories: [
        // 일반 카테고리 (unisex)
        {name: "Top", cateNo: 47, gender: ["unisex"]}, // t-shirts
        {name: "Top", cateNo: 522, gender: ["unisex"]}, // sweats
        {name: "Shirts", cateNo: 48, gender: ["unisex"]}, // shirts
        {name: "Top", cateNo: 49, gender: ["unisex"]}, // vests
        {name: "Knitwear", cateNo: 50, gender: ["unisex"]}, // knitwear
        {name: "Outer", cateNo: 393, gender: ["unisex"]}, // jackets
        {name: "Outer", cateNo: 525, gender: ["unisex"]}, // leather
        {name: "Outer", cateNo: 394, gender: ["unisex"]}, // coats
        {name: "Bottom", cateNo: 52, gender: ["unisex"]}, // pants
        {name: "Bottom", cateNo: 1574, gender: ["unisex"]}, // skirt
        {name: "Bottom", cateNo: 53, gender: ["unisex"]}, // shorts
        {name: "Shoes", cateNo: 55, gender: ["unisex"]}, // shoes
        {name: "Accessories", cateNo: 523, gender: ["unisex"]}, // headwear
        {name: "Accessories", cateNo: 54, gender: ["unisex"]}, // accessories
      ],
    },
    notes: "Eastlogue/Unaffected 자사 브랜드 + 편집샵. 브랜드 페이지(list_b) 제외, 카테고리 14개",
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

  // ─── 3차 확장: 디자이너 브랜드몰 ─────────────────

  {
    key: "eastlogue",
    name: "이스트로그",
    type: "cafe24",
    baseUrl: "https://eastlogue.com",
    paginate: true,
    maxPages: 15,
    category: {
      discovery: "manual",
      categories: [
        // Men
        {name: "Top", cateNo: 226, gender: ["men"]},       // t-shirts
        {name: "Top", cateNo: 227, gender: ["men"]},       // sweats
        {name: "Shirts", cateNo: 228, gender: ["men"]},
        {name: "Top", cateNo: 229, gender: ["men"]},       // vests
        {name: "Knitwear", cateNo: 230, gender: ["men"]},
        {name: "Outer", cateNo: 231, gender: ["men"]},     // jackets
        {name: "Outer", cateNo: 232, gender: ["men"]},     // leather
        {name: "Outer", cateNo: 233, gender: ["men"]},     // coats
        {name: "Outer", cateNo: 234, gender: ["men"]},     // down jackets
        {name: "Bottom", cateNo: 235, gender: ["men"]},    // pants
        {name: "Bottom", cateNo: 236, gender: ["men"]},    // shorts
        {name: "Shoes", cateNo: 241, gender: ["men"]},
        {name: "Accessories", cateNo: 237, gender: ["men"]}, // headwear
        {name: "Accessories", cateNo: 238, gender: ["men"]},
        // Women
        {name: "Top", cateNo: 207, gender: ["women"]},     // t-shirts
        {name: "Top", cateNo: 208, gender: ["women"]},     // sweats
        {name: "Shirts", cateNo: 209, gender: ["women"]},
      ],
    },
    notes: "밀리터리/아웃도어 자사 브랜드. Men 14 + Women 3 = 17개 카테고리. 10~40만원대",
  },
  {
    key: "sienneboutique",
    name: "시엔느",
    type: "cafe24",
    baseUrl: "https://sienneboutique.com",
    paginate: true,
    maxPages: 10,
    defaultGender: ["women"],
    category: {
      discovery: "manual",
      categories: [
        {name: "Outer", cateNo: 54, gender: ["women"]},
        {name: "Top", cateNo: 44, gender: ["women"]},
        {name: "Knitwear", cateNo: 78, gender: ["women"]},
        {name: "Bottom", cateNo: 49, gender: ["women"]},
        {name: "Dress", cateNo: 55, gender: ["women"]},
        {name: "Bag", cateNo: 183, gender: ["women"]},
        {name: "Accessories", cateNo: 56, gender: ["women"]},
      ],
    },
    notes: "리파인드 빈티지 컨템포러리 여성복. 7개 카테고리. 10~50만원대",
  },
  {
    key: "mardimercredi",
    name: "마르디메크르디",
    type: "cafe24",
    baseUrl: "https://mardimercredi.com",
    paginate: true,
    maxPages: 15,
    defaultGender: ["women"],
    category: {
      discovery: "manual",
      categories: [
        {name: "Top", cateNo: 519, gender: ["women"]},      // TSHIRT
        {name: "Top", cateNo: 520, gender: ["women"]},      // TOPS
        {name: "Shirts", cateNo: 522, gender: ["women"]},
        {name: "Top", cateNo: 521, gender: ["women"]},      // SWEATSHIRT
        {name: "Bottom", cateNo: 525, gender: ["women"]},
        {name: "Dress", cateNo: 526, gender: ["women"]},
        {name: "Knitwear", cateNo: 523, gender: ["women"]},
        {name: "Outer", cateNo: 524, gender: ["women"]},
        {name: "Accessories", cateNo: 527, gender: ["women"]},
        {name: "Bag", cateNo: 528, gender: ["women"]},
        {name: "Shoes", cateNo: 553, gender: ["women"]},
      ],
    },
    notes: "프렌치 데일리 캐주얼 여성복. WOMEN 11개 카테고리 (KIDS/PET 제외). 5~25만원대",
  },

  // ─── 캐주얼/스트릿 편집샵 (2차 확장) ──────────────

  {
    key: "triplestore",
    name: "트리플스토어",
    type: "cafe24",
    baseUrl: "https://triplestore.co.kr",
    paginate: true,
    maxPages: 15,
    category: {
      discovery: "manual",
      categories: [
        // Men
        {name: "Outer", cateNo: 1500, gender: ["men"]},
        {name: "Knitwear", cateNo: 1546, gender: ["men"]},
        {name: "Top", cateNo: 1547, gender: ["men"]},       // Sweatshirt
        {name: "Shirts", cateNo: 1556, gender: ["men"]},
        {name: "Top", cateNo: 1574, gender: ["men"]},       // T-Shirt
        {name: "Bottom", cateNo: 1499, gender: ["men"]},
        {name: "Bottom", cateNo: 1577, gender: ["men"]},    // Shorts
        {name: "Bag", cateNo: 1548, gender: ["men"]},
        {name: "Shoes", cateNo: 1776, gender: ["men"]},
        {name: "Accessories", cateNo: 1501, gender: ["men"]}, // Headgear
        // Women
        {name: "Outer", cateNo: 1508, gender: ["women"]},
        {name: "Knitwear", cateNo: 1568, gender: ["women"]},
        {name: "Top", cateNo: 1569, gender: ["women"]},     // Sweatshirt
        {name: "Top", cateNo: 1593, gender: ["women"]},
        {name: "Dress", cateNo: 1725, gender: ["women"]},
        {name: "Bottom", cateNo: 1507, gender: ["women"]},
        {name: "Bag", cateNo: 1558, gender: ["women"]},
        {name: "Shoes", cateNo: 1778, gender: ["women"]},
        {name: "Accessories", cateNo: 1505, gender: ["women"]}, // Headgear
      ],
    },
    notes: "제주 기반 편집샵. Men 10 + Women 9 = 19개 카테고리. 5~40만원대",
  },
  {
    key: "noclaim",
    name: "노클레임",
    type: "cafe24",
    baseUrl: "https://noclaim.co.kr",
    paginate: true,
    maxPages: 15,
    category: { discovery: "auto" },
    defaultGender: ["unisex"],
    disabled: true,
    notes: "부산 기반 편집샵. 브랜드 기반 구조라 의류 카테고리 없음. 수동 설정 필요",
  },
  {
    key: "swallowlounge",
    name: "스왈로우라운지",
    type: "cafe24",
    baseUrl: "https://swallowlounge.co.kr",
    paginate: true,
    maxPages: 15,
    category: { discovery: "auto" },
    defaultGender: ["unisex"],
    notes: "성수동 편집샵. Crepuscule, Toga, Blurhms, Aton 등 50+ 브랜드. 10~50만원대",
  },
  {
    key: "takeastreet",
    name: "테이크어스트릿",
    type: "cafe24",
    baseUrl: "https://takeastreet.com",
    paginate: true,
    maxPages: 10,
    category: {
      discovery: "manual",
      categories: [
        {name: "Outer", cateNo: 137, gender: ["unisex"]},
        {name: "Top", cateNo: 135, gender: ["unisex"]},
        {name: "Bottom", cateNo: 136, gender: ["unisex"]},
        {name: "Bag", cateNo: 138, gender: ["unisex"]},
        {name: "Accessories", cateNo: 139, gender: ["unisex"]}, // 모자
        {name: "Accessories", cateNo: 141, gender: ["unisex"]},
        {name: "Shoes", cateNo: 1111, gender: ["unisex"]},
      ],
    },
    notes: "합정 편집샵. 7개 카테고리. 3~20만원대",
  },
  {
    key: "chanceclothing",
    name: "찬스클로딩",
    type: "cafe24",
    baseUrl: "https://chanceclothing.co.kr",
    paginate: true,
    maxPages: 10,
    category: {
      discovery: "manual",
      categories: [
        {name: "Outer", cateNo: 29, gender: ["unisex"]},
        {name: "Top", cateNo: 30, gender: ["unisex"]},
        {name: "Bottom", cateNo: 31, gender: ["unisex"]},
        {name: "Shoes", cateNo: 42, gender: ["unisex"]},
        {name: "Bag", cateNo: 43, gender: ["unisex"]},
        {name: "Accessories", cateNo: 44, gender: ["unisex"]}, // Hats
        {name: "Accessories", cateNo: 45, gender: ["unisex"]},
      ],
    },
    notes: "국내외 브랜드 편집샵. 7개 카테고리. 5~30만원대",
  },
  {
    key: "havati",
    name: "하바티",
    type: "cafe24",
    baseUrl: "https://havatishop.com",
    paginate: true,
    maxPages: 10,
    category: {
      discovery: "manual",
      categories: [
        // Outer 하위
        {name: "Outer", cateNo: 131, gender: ["unisex"]},  // Jacket/Blouson
        {name: "Outer", cateNo: 132, gender: ["unisex"]},  // Jumper/Parka
        {name: "Outer", cateNo: 323, gender: ["unisex"]},  // Leather
        {name: "Outer", cateNo: 133, gender: ["unisex"]},  // Coat
        {name: "Outer", cateNo: 135, gender: ["unisex"]},  // Vest
        {name: "Outer", cateNo: 136, gender: ["unisex"]},  // Padding
        {name: "Knitwear", cateNo: 137, gender: ["unisex"]}, // Cardigan
        // Tops 하위
        {name: "Top", cateNo: 32, gender: ["unisex"]},     // Tee
        {name: "Shirts", cateNo: 33, gender: ["unisex"]},   // Shirt
        {name: "Top", cateNo: 125, gender: ["unisex"]},    // Sweatshirt
        {name: "Knitwear", cateNo: 126, gender: ["unisex"]}, // Knitwear
        // Bottoms 하위
        {name: "Bottom", cateNo: 138, gender: ["unisex"]},  // Denim
        {name: "Bottom", cateNo: 280, gender: ["unisex"]},  // Chino
        {name: "Bottom", cateNo: 281, gender: ["unisex"]},  // Trousers
        {name: "Bottom", cateNo: 282, gender: ["unisex"]},  // Easy Pants
        {name: "Bottom", cateNo: 283, gender: ["unisex"]},  // Work Pants
        {name: "Bottom", cateNo: 284, gender: ["unisex"]},  // Shorts
        // 나머지
        {name: "Shoes", cateNo: 28, gender: ["unisex"]},
        {name: "Bag", cateNo: 80, gender: ["unisex"]},
        {name: "Accessories", cateNo: 79, gender: ["unisex"]}, // Hats
        {name: "Accessories", cateNo: 42, gender: ["unisex"]},
      ],
    },
    notes: "캐주얼 편집샵. 하위 카테고리 21개",
  },

  // ─── 캐주얼 자사 브랜드몰 (2차 확장) ────────────────

  {
    key: "pottery",
    name: "포터리",
    type: "cafe24",
    baseUrl: "https://www.ptry.co.kr",
    paginate: true,
    maxPages: 10,
    category: { discovery: "auto" },
    defaultGender: ["unisex"],
    disabled: true,
    notes: "컨템포러리 캐주얼. 커스텀 셀렉터 필요 (기본 셀렉터로 상품 못 찾음). 5~30만원대",
  },
  {
    key: "beslow",
    name: "비슬로우",
    type: "cafe24",
    baseUrl: "https://beslow.co.kr",
    paginate: true,
    maxPages: 20,
    category: {
      discovery: "manual",
      categories: [
        {name: "Beslow", cateNo: 126, gender: ["men"]},          // 자사 메인 (6p)
        {name: "Beslow Purple", cateNo: 76, gender: ["men"]},    // 퍼플 라인 (2p)
        {name: "Slowboy", cateNo: 133, gender: ["men"]},         // 슬로우보이 (1p)
        {name: "Selected Brands", cateNo: 127, gender: ["men"]}, // 셀렉 브랜드 (16p)
      ],
    },
    notes: "미니멀 클래식 남성복. 브랜드 기반 카테고리 4개. 5~30만원대",
  },
  {
    key: "anotheroffice",
    name: "어나더오피스",
    type: "cafe24",
    baseUrl: "https://anotheroffice.co.kr",
    paginate: true,
    maxPages: 10,
    category: {
      discovery: "manual",
      categories: [
        // Men
        {name: "Outer", cateNo: 44, gender: ["men"]},
        {name: "Top", cateNo: 45, gender: ["men"]},
        {name: "Bottom", cateNo: 46, gender: ["men"]},
        {name: "Accessories", cateNo: 47, gender: ["men"]},
        // Women
        {name: "Top", cateNo: 80, gender: ["women"]},
        {name: "Bottom", cateNo: 81, gender: ["women"]},
        {name: "Dress", cateNo: 95, gender: ["women"]},
        {name: "Accessories", cateNo: 82, gender: ["women"]},
      ],
    },
    notes: "컨템포러리 캐주얼, 테일러드 베이직. Men 4 + Women 4 = 8개 카테고리. 7~38만원대",
  },
  {
    key: "bastong",
    name: "바스통",
    type: "cafe24",
    baseUrl: "https://bastong.co.kr",
    paginate: true,
    maxPages: 10,
    category: {
      discovery: "manual",
      categories: [
        {name: "All", cateNo: 64, gender: ["men"]}, // SHOPNOW (전체 상품 — 단일 카테고리)
      ],
    },
    notes: "클래식 남성복. 단일 카테고리 (379개). 7~50만원대",
  },
  {
    key: "roughside",
    name: "러프사이드",
    type: "cafe24",
    baseUrl: "https://roughside.co.kr",
    paginate: true,
    maxPages: 10,
    category: {
      discovery: "manual",
      categories: [
        // Men
        {name: "Outer", cateNo: 62, gender: ["men"]},
        {name: "Outer", cateNo: 63, gender: ["men"]},       // 재킷
        {name: "Bottom", cateNo: 27, gender: ["men"]},
        {name: "Shirts", cateNo: 64, gender: ["men"]},
        {name: "Knitwear", cateNo: 65, gender: ["men"]},
        {name: "Top", cateNo: 66, gender: ["men"]},         // 컷앤소운
        {name: "Accessories", cateNo: 53, gender: ["men"]},
        // Women
        {name: "Outer", cateNo: 81, gender: ["women"]},
        {name: "Top", cateNo: 86, gender: ["women"]},
        {name: "Bottom", cateNo: 83, gender: ["women"]},
        {name: "Knitwear", cateNo: 85, gender: ["women"]},
        {name: "Dress", cateNo: 84, gender: ["women"]},
        {name: "Accessories", cateNo: 87, gender: ["women"]},
      ],
    },
    notes: "컨템포러리 캐주얼. Men 7 + Women 6 = 13개 카테고리. 5~25만원대",
  },
  {
    key: "blankroom",
    name: "블랭크룸",
    type: "cafe24",
    baseUrl: "https://blankroom.house",
    paginate: true,
    maxPages: 10,
    category: {
      discovery: "manual",
      categories: [
        {name: "Outer", cateNo: 87, gender: ["unisex"]},
        {name: "Knitwear", cateNo: 51, gender: ["unisex"]},
        {name: "Shirts", cateNo: 80, gender: ["unisex"]},
        {name: "Top", cateNo: 30, gender: ["unisex"]},
        {name: "Bottom", cateNo: 31, gender: ["unisex"]},
        {name: "Bottom", cateNo: 188, gender: ["unisex"]}, // Denim
      ],
    },
    notes: "미니멀 라이프스타일. 6개 카테고리 (Home 제외)",
  },
  {
    key: "steadyeverywear",
    name: "스테디에브리웨어",
    type: "cafe24",
    baseUrl: "https://steadyeverywear.com",
    disabled: true,
    paginate: true,
    maxPages: 10,
    category: { discovery: "auto" },
    defaultGender: ["unisex"],
    notes: "데일리 캐주얼. JS 렌더링 심해서 카테고리 구조 파악 불가",
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
