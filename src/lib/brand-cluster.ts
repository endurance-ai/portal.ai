/**
 * sensitivity_tags[0] 의 prefix 기반으로 브랜드를 11개 클러스터 중 하나로 매핑.
 * brand-graph 시각화 + brand-proposals 검수큐 + UI 색상 코딩에 공통 사용.
 */
export function clusterFromSensitivity(tags: string[] | null): string {
  if (!tags || tags.length === 0) return "unknown"
  const first = tags[0]
  if (first.startsWith("minimalist") || first.includes("미니멀")) return "minimalist"
  if (first.startsWith("contemporary") || first.includes("컨템포러리")) return "contemporary"
  if (first.startsWith("classic")) return "classic"
  if (first.startsWith("vintage")) return "vintage"
  if (first.startsWith("chic")) return "chic"
  if (first.startsWith("casual")) return "casual"
  if (first.startsWith("luxury") || first.includes("럭셔리") || first.includes("하이엔드"))
    return "luxury"
  if (first.startsWith("avantgarde")) return "avantgarde"
  if (first.startsWith("feminine")) return "feminine"
  if (first.startsWith("streetwear")) return "streetwear"
  return "other"
}
