import "server-only"
import {supabase} from "@/lib/supabase"

// IG @handle과 우리 DB의 products.brand / brand_nodes.brand_name_normalized를 매칭.
// brand_nodes에 ig_handle 컬럼이 없어서 문자열 정규화 후 prefix/포함 매칭으로 fallback.

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

export interface ResolvedBrand {
  handle: string
  brandName: string // products.brand에 매칭되는 원본 표기
  matchKind: "exact" | "normalized" | "prefix"
}

/**
 * 핸들 배열 → products.brand 매칭 후보 반환.
 * 1) brand_nodes.brand_name_normalized 전수 스캔
 * 2) 각 handle 정규화 값과 비교:
 *    - exact: normalize(handle) === normalize(brand_name_normalized)
 *    - normalized: 한쪽이 다른쪽을 포함 (길이 차 5 이하)
 *    - prefix: 더 긴 쪽이 짧은 쪽으로 시작
 * 3) 매칭된 brand_name 반환 (products 조회 시 hard filter)
 */
export async function resolveIgHandlesToBrands(
  handles: string[]
): Promise<ResolvedBrand[]> {
  if (handles.length === 0) return []

  const {data, error} = await supabase
    .from("brand_nodes")
    .select("brand_name, brand_name_normalized")
    .limit(1000)

  if (error || !data) return []

  const catalog = data.map((r) => ({
    brandName: r.brand_name as string,
    normalized: r.brand_name_normalized as string,
    key: normalize(r.brand_name_normalized as string),
  }))

  const resolved: ResolvedBrand[] = []
  const seen = new Set<string>()

  for (const raw of handles) {
    const handle = raw.replace(/^@/, "").toLowerCase()
    const h = normalize(handle)
    if (!h) continue

    // 1) exact
    let match = catalog.find((c) => c.key === h)
    let kind: ResolvedBrand["matchKind"] = "exact"

    // 2) 포함 (길이차 5 이하)
    if (!match) {
      match = catalog.find(
        (c) =>
          (c.key.includes(h) || h.includes(c.key)) &&
          Math.abs(c.key.length - h.length) <= 5 &&
          Math.min(c.key.length, h.length) >= 4
      )
      if (match) kind = "normalized"
    }

    // 3) prefix (긴 쪽이 짧은 쪽으로 시작)
    if (!match) {
      match = catalog.find((c) => {
        const [short, long] = c.key.length < h.length ? [c.key, h] : [h, c.key]
        return short.length >= 4 && long.startsWith(short)
      })
      if (match) kind = "prefix"
    }

    if (match && !seen.has(match.brandName)) {
      seen.add(match.brandName)
      resolved.push({
        handle,
        brandName: match.brandName,
        matchKind: kind,
      })
    }
  }

  return resolved
}
