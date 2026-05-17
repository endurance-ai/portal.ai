/**
 * Enum 값 → 한국어 디스플레이 매핑 (UI 표시용)
 * 검색/로직에는 영어 enum 그대로 사용, 화면에만 한글 표시
 */

export const COLOR_FAMILY_KO: Record<string, string> = {
  BLACK: "블랙",
  WHITE: "화이트",
  GREY: "그레이",
  NAVY: "네이비",
  BLUE: "블루",
  BEIGE: "베이지",
  BROWN: "브라운",
  GREEN: "그린",
  RED: "레드",
  PINK: "핑크",
  PURPLE: "퍼플",
  ORANGE: "오렌지",
  YELLOW: "옐로우",
  CREAM: "크림",
  KHAKI: "카키",
  MULTI: "멀티",
}

export const FIT_KO: Record<string, string> = {
  oversized: "오버사이즈",
  relaxed: "릴렉스드",
  regular: "레귤러",
  slim: "슬림",
  skinny: "스키니",
  boxy: "박시",
  cropped: "크롭",
  longline: "롱라인",
}

export const FABRIC_KO: Record<string, string> = {
  cotton: "코튼",
  wool: "울",
  linen: "린넨",
  silk: "실크",
  denim: "데님",
  leather: "레더",
  suede: "스웨이드",
  nylon: "나일론",
  polyester: "폴리에스터",
  cashmere: "캐시미어",
  corduroy: "코듀로이",
  fleece: "플리스",
  tweed: "트위드",
  jersey: "저지",
  knit: "니트",
  mesh: "메쉬",
  satin: "새틴",
  chiffon: "쉬폰",
  velvet: "벨벳",
  canvas: "캔버스",
  "gore-tex": "고어텍스",
  ripstop: "립스탑",
  rubber: "러버",
}

export const SEASON_KO: Record<string, string> = {
  spring: "봄",
  summer: "여름",
  fall: "가을",
  winter: "겨울",
  "all-season": "사계절",
}

export const PATTERN_KO: Record<string, string> = {
  solid: "솔리드",
  stripe: "스트라이프",
  check: "체크",
  floral: "플로럴",
  graphic: "그래픽",
  camo: "카모",
  dot: "도트",
  paisley: "페이즐리",
  animal: "애니멀",
  abstract: "추상",
}

const ALL_KO: Record<string, string> = {
  ...COLOR_FAMILY_KO,
  ...FIT_KO,
  ...FABRIC_KO,
  ...SEASON_KO,
  ...PATTERN_KO,
}

/** enum 값을 한국어로 변환. 매핑 없으면 원본 반환. */
export function toKo(value: string): string {
  return ALL_KO[value] ?? value
}
