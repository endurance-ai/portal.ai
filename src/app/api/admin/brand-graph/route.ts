import {NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const revalidate = 60

interface NodeData {
  id: string
  name: string
  hasMeta: boolean
  cluster: string
  skuCount: number
  x: number | null
  y: number | null
}

function clusterFromSensitivity(tags: string[] | null): string {
  if (!tags || tags.length === 0) return "unknown"
  const first = tags[0]
  if (first.startsWith("minimalist") || first.includes("미니멀")) return "minimalist"
  if (first.startsWith("contemporary") || first.includes("컨템포러리")) return "contemporary"
  if (first.startsWith("classic")) return "classic"
  if (first.startsWith("vintage")) return "vintage"
  if (first.startsWith("chic")) return "chic"
  if (first.startsWith("casual")) return "casual"
  if (first.startsWith("luxury") || first.includes("럭셔리") || first.includes("하이엔드")) return "luxury"
  if (first.startsWith("avantgarde")) return "avantgarde"
  if (first.startsWith("feminine")) return "feminine"
  if (first.startsWith("streetwear")) return "streetwear"
  return "other"
}

async function loadAll<T>(query: () => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = []
  let from = 0
  while (true) {
    const {data, error} = await query().range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

export async function GET() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  // 노드 + SKU 카운트만 (엣지는 별도 endpoint)
  const [brands, skuRows] = await Promise.all([
    loadAll<{
      id: string
      brand_name: string
      sensitivity_tags: string[] | null
      brand_keywords: string[] | null
      style_node: string | null
      attributes: Record<string, unknown> | null
      x_umap: number | null
      y_umap: number | null
    }>(() =>
      supabase
        .from("brand_nodes")
        .select("id, brand_name, sensitivity_tags, brand_keywords, style_node, attributes, x_umap, y_umap")
        .not("embedding", "is", null)
        .order("brand_name")
    ),
    loadAll<{brand: string; sku_count: number}>(() =>
      supabase.from("brand_sku_counts").select("brand, sku_count")
    ),
  ])

  const skuCount = new Map<string, number>()
  for (const r of skuRows) skuCount.set(r.brand, r.sku_count)

  const nodes: NodeData[] = brands.map((b) => {
    const hasMeta =
      !!b.sensitivity_tags?.length ||
      !!b.brand_keywords?.length ||
      !!b.style_node ||
      !!(b.attributes && Object.keys(b.attributes).length)
    return {
      id: b.id,
      name: b.brand_name,
      hasMeta,
      cluster: hasMeta ? clusterFromSensitivity(b.sensitivity_tags) : "empty",
      skuCount: skuCount.get(b.brand_name) ?? 0,
      x: b.x_umap,
      y: b.y_umap,
    }
  })

  return NextResponse.json({
    nodes,
    stats: {
      totalNodes: nodes.length,
      withMeta: nodes.filter((n) => n.hasMeta).length,
      withoutMeta: nodes.filter((n) => !n.hasMeta).length,
    },
  })
}
