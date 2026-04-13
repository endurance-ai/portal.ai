import {type AnalyzedItem, type LockableAttr} from "./types"

/**
 * 가장 distinctive한 속성을 1개 추천한다.
 * "정체성 점수"의 MVP — 카테고리 분포 통계 없이 휴리스틱으로:
 * 1. pattern이 "solid"가 아니면 → 가장 시각적으로 두드러지는 속성
 * 2. fabric이 가죽/스웨이드/벨벳/실크 같은 특수 소재면 → 강한 정체성
 * 3. colorFamily가 흔하지 않으면 (yellow/purple/pink/orange/red) → 색상이 정체성
 * 4. fallback: subcategory (적어도 카테고리는 lock해야 같은 종류 검색)
 *
 * 분류 기준:
 * - 일반: black, white, gray, navy, beige, brown
 * - 특이: yellow, purple, pink, orange, red, green, burgundy
 */

const COMMON_COLORS = new Set([
  "black",
  "white",
  "gray",
  "grey",
  "navy",
  "beige",
  "brown",
  "tan",
  "cream",
  "ivory",
  "khaki",
  "charcoal",
])

const DISTINCTIVE_FABRICS = new Set([
  "leather",
  "suede",
  "velvet",
  "silk",
  "satin",
  "fur",
  "shearling",
  "lace",
  "mesh",
  "patent-leather",
  "corduroy",
])

function isMeaningful(value?: string | null): value is string {
  return typeof value === "string" && value.length > 0
}

export function recommendLockedAttr(item: AnalyzedItem): LockableAttr | null {
  // 1. pattern이 solid/none이 아니면 가장 distinctive
  if (
    isMeaningful(item.pattern) &&
    !["solid", "none", "plain"].includes(item.pattern.toLowerCase())
  ) {
    return "pattern"
  }

  // 2. 특수 소재
  if (
    isMeaningful(item.fabric) &&
    DISTINCTIVE_FABRICS.has(item.fabric.toLowerCase())
  ) {
    return "fabric"
  }

  // 3. 흔하지 않은 색상
  if (
    isMeaningful(item.colorFamily) &&
    !COMMON_COLORS.has(item.colorFamily.toLowerCase())
  ) {
    return "colorFamily"
  }

  // 4. fallback: subcategory가 있으면 그것
  if (isMeaningful(item.subcategory)) {
    return "subcategory"
  }

  return null
}

/**
 * 빈 결과일 때 풀어볼 lock 1개 추천.
 * 가장 narrow(=결과를 가장 많이 자르는) 속성을 우선:
 * 1. pattern (가장 희귀)
 * 2. fabric (특수 소재일 때 narrow)
 * 3. season (계절 한정)
 * 4. fit (스타일 미세조정)
 * 5. colorFamily
 * 6. subcategory (가장 중요 — 마지막에)
 */
const UNLOCK_PRIORITY: LockableAttr[] = [
  "pattern",
  "fabric",
  "season",
  "fit",
  "colorFamily",
  "subcategory",
]

export function pickUnlockSuggestion(
  locked: LockableAttr[],
): LockableAttr | null {
  for (const attr of UNLOCK_PRIORITY) {
    if (locked.includes(attr)) return attr
  }
  return locked[0] ?? null
}

