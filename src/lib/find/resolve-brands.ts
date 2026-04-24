import "server-only"
import {supabase} from "@/lib/supabase"

// IG @handle → products.brand 실제 저장값 매칭.
// brand_nodes가 아니라 products.brand DISTINCT를 소스로 써야 search-products의
// `.in("brand", ...)` 하드필터가 실제로 걸림 (대소문자/표기 차이 방지).

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

export interface ResolvedBrand {
  handle: string
  brandName: string // products.brand에 실제 저장된 값 (search-products filter 입력)
  matchKind: "exact" | "normalized" | "prefix"
}

// 모듈 스코프 캐시 — 콜드스타트당 1회 DB 왕복.
// TTL 없음 (인스턴스 수명 동안 유효); 브랜드 추가는 드물어 충분.
let brandCache: Array<{brandName: string; key: string}> | null = null

async function loadProductBrands(): Promise<Array<{brandName: string; key: string}>> {
  if (brandCache) return brandCache

  // products.brand DISTINCT — 실제 상품에 붙어있는 브랜드 표기만 후보.
  const {data, error} = await supabase
    .from("products")
    .select("brand")
    .eq("in_stock", true)
    .not("brand", "is", null)
    .limit(5000) // 697 브랜드 기준 충분한 버퍼

  if (error || !data) return []

  const seen = new Set<string>()
  const catalog: Array<{brandName: string; key: string}> = []
  for (const row of data) {
    const name = (row.brand as string | null)?.trim()
    if (!name) continue
    if (seen.has(name)) continue
    seen.add(name)
    catalog.push({brandName: name, key: normalize(name)})
  }

  brandCache = catalog
  return catalog
}

/**
 * 핸들 배열 → products.brand 매칭 후보 반환.
 * 1) products.brand DISTINCT 전수 로드 (캐시됨)
 * 2) 각 handle 정규화 후 비교:
 *    - exact: normalize(handle) === normalize(brand)
 *    - normalized: 한쪽이 다른쪽을 포함 (길이 차 5 이하, 최소 4자)
 *    - prefix: 더 긴 쪽이 짧은 쪽으로 시작 (최소 4자)
 */
export async function resolveIgHandlesToBrands(
  handles: string[]
): Promise<ResolvedBrand[]> {
  if (handles.length === 0) return []

  const catalog = await loadProductBrands()
  if (catalog.length === 0) return []

  const resolved: ResolvedBrand[] = []
  const seen = new Set<string>()

  for (const raw of handles) {
    const handle = raw.replace(/^@/, "").toLowerCase()
    const h = normalize(handle)
    if (!h) continue

    let match = catalog.find((c) => c.key === h)
    let kind: ResolvedBrand["matchKind"] = "exact"

    if (!match) {
      match = catalog.find(
        (c) =>
          (c.key.includes(h) || h.includes(c.key)) &&
          Math.abs(c.key.length - h.length) <= 5 &&
          Math.min(c.key.length, h.length) >= 4
      )
      if (match) kind = "normalized"
    }

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
