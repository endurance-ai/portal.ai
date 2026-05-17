/**
 * 색상 인접 매핑 — 정확 매칭 실패 시 유사 색상 폴백
 *
 * 검색엔진에서:
 * - 1차: 정확한 color_family 매칭 (full weight)
 * - 2차: 인접 색상 매칭 (half weight)
 */

import type {ColorFamily} from "./product-enums"

/** 인접 색상 맵 (유사도 순) */
export const COLOR_ADJACENCY: Record<ColorFamily, ColorFamily[]> = {
  BLACK:  ["GREY", "NAVY"],
  WHITE:  ["CREAM", "BEIGE"],
  GREY:   ["BLACK", "NAVY"],
  NAVY:   ["BLUE", "BLACK", "GREY"],
  BLUE:   ["NAVY", "GREY"],
  BEIGE:  ["CREAM", "BROWN", "KHAKI"],
  BROWN:  ["BEIGE", "KHAKI"],
  GREEN:  ["KHAKI", "BROWN"],
  RED:    ["PINK", "ORANGE"],
  PINK:   ["RED", "PURPLE", "CREAM"],
  PURPLE: ["PINK", "NAVY"],
  ORANGE: ["RED", "BROWN", "YELLOW"],
  YELLOW: ["CREAM", "ORANGE", "BEIGE"],
  CREAM:  ["BEIGE", "WHITE", "YELLOW"],
  KHAKI:  ["GREEN", "BEIGE", "BROWN"],
  MULTI:  [],  // MULTI는 인접 없음 — 그 자체가 복합
}

/** 주어진 색상의 인접 색상 목록 반환 */
export function getAdjacentColors(color: string): string[] {
  return COLOR_ADJACENCY[color as ColorFamily] ?? []
}

/** 두 색상이 인접한지 확인 */
export function isAdjacentColor(requested: string, actual: string): boolean {
  const adjacents = COLOR_ADJACENCY[requested as ColorFamily]
  return adjacents?.includes(actual as ColorFamily) ?? false
}
