/**
 * 크롤러 공통 타입
 */

// ─── 상품 ─────────────────────────────────────────────

export interface Product {
  brand: string
  name: string
  category: string
  price: number | null
  originalPrice: number | null
  salePrice: number | null
  priceFormatted: string
  imageUrl: string
  productUrl: string
  inStock: boolean
  gender: string[]
  platform: string
  crawledAt: string
  // ── 상세 페이지 데이터 (Phase 2) ──
  description?: string
  color?: string
  material?: string
  subcategory?: string
  images?: string[]
  sizeInfo?: string
  tags?: string[]
  productCode?: string
  // ── 리뷰 데이터 (Phase 3) ──
  reviewCount?: number
  reviews?: Array<{
    text: string
    author: string | null
    date: string | null
    photoUrls: string[]
    body: {
      height: string | null
      weight: string | null
      usualSize: string | null
      purchasedSize: string | null
      bodyType: string | null
    } | null
  }>
}

// ─── 사이트 설정 ──────────────────────────────────────

export type PlatformType = "cafe24" | "shopify"

export interface Cafe24Selectors {
  /** 상품 리스트 컨테이너 (기본: ul.thumbnail) */
  listContainer?: string
  /** 개별 상품 아이템 (기본: li[id^="anchorBoxId"]) */
  productItem?: string
  /** 상품명 (기본: .name) */
  productName?: string
  /** 가격 (기본: .price) */
  productPrice?: string
  /** 이미지 (기본: img.thumb-img, img) */
  productImage?: string
  /** 상품 링크 (기본: a[href*="product"]) */
  productLink?: string
}

export interface Cafe24DetailSelectors {
  /** 상품 설명 영역 (기본: .cont_detail, #prdDetail) */
  description?: string
  /** 색상 옵션 (기본: select[name*="option"] option) */
  colorOptions?: string
  /** 이미지 (기본: .product-detail img) */
  detailImages?: string
  /** 상품 코드 */
  productCode?: string
}

export interface CategoryConfig {
  /** 카테고리 자동 탐색 방식 */
  discovery: "auto" | "manual"
  /**
   * manual일 때: 고정 카테고리 번호 목록
   * auto일 때: 카테고리 링크를 찾을 CSS 셀렉터 (기본: a[href*="cate_no="])
   */
  categories?: { name: string; cateNo: number; gender?: string[] }[]
  /** auto 탐색 시 시작 URL (기본: baseUrl) */
  discoveryUrl?: string
  /** auto 탐색 시 카테고리 링크 셀렉터 */
  discoverySelector?: string
  /** 무시할 카테고리명 패턴 */
  ignorePatterns?: string[]
}

export interface SiteConfig {
  /** 고유 키 (파일명, DB platform 필드에 사용) */
  key: string
  /** 플랫폼 한글명 */
  name: string
  /** 플랫폼 타입 */
  type: PlatformType
  /** 사이트 기본 URL */
  baseUrl: string
  /** 기본 성별 (사이트 전체 적용) */
  defaultGender?: string[]
  /** Cafe24 셀렉터 오버라이드 */
  selectors?: Cafe24Selectors
  /** 카테고리 탐색 설정 */
  category?: CategoryConfig
  /** 가격 파싱 정규식 (기본: /[\d,]+/ — KRW, ₩, 숫자만 등 다양한 포맷 대응) */
  pricePattern?: RegExp
  /** 가격 통화 접두사 (기본: ₩) */
  priceCurrency?: string
  /** 페이지네이션 지원 여부 */
  paginate?: boolean
  /** 최대 페이지 수 (기본: 10) */
  maxPages?: number
  /** 요청 간 딜레이 ms (기본: 2000) */
  crawlDelay?: number
  /** 비활성화 */
  disabled?: boolean
  /** 메모 */
  notes?: string
  /** Cafe24 상세 페이지 셀렉터 오버라이드 */
  detailSelectors?: Cafe24DetailSelectors
  /** 상세 페이지 크롤링 활성화 (기본: false) */
  crawlDetails?: boolean
  /** 리뷰 크롤링 활성화 (기본: false, crawlDetails가 true일 때만 동작) */
  crawlReviews?: boolean
}

// ─── 크롤 결과 ────────────────────────────────────────

export interface CrawlResult {
  platform: string
  products: Product[]
  stats: {
    totalProducts: number
    inStock: number
    outOfStock: number
    uniqueBrands: number
    avgPrice: number
    duration: number
  }
  errors: string[]
}
