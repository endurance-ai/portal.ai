import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const revalidate = 60

interface NeighborOut {
  id: string
  name: string
  similarity: number
  cluster: string
  skuCount: number
  hasMeta: boolean
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

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const id = request.nextUrl.searchParams.get("id")
  const k = parseInt(request.nextUrl.searchParams.get("k") || "10")
  if (!id) return NextResponse.json({error: "missing id"}, {status: 400})

  // brand_similar 에서 그 brand 의 top-K
  const {data: edges, error: e1} = await supabase
    .from("brand_similar")
    .select("similar_brand_id, similarity")
    .eq("brand_id", id)
    .order("rank")
    .limit(k)
  if (e1) return NextResponse.json({error: e1.message}, {status: 500})
  if (!edges || edges.length === 0) {
    return NextResponse.json({neighbors: []})
  }

  // similar brand 정보 join
  const ids = edges.map((e) => e.similar_brand_id)
  const {data: brands, error: e2} = await supabase
    .from("brand_nodes")
    .select("id, brand_name, sensitivity_tags, brand_keywords, style_node, attributes")
    .in("id", ids)
  if (e2) return NextResponse.json({error: e2.message}, {status: 500})

  // SKU count
  const brandNames = (brands ?? []).map((b) => b.brand_name)
  const {data: skuRows} = await supabase
    .from("brand_sku_counts")
    .select("brand, sku_count")
    .in("brand", brandNames)
  const skuMap = new Map<string, number>()
  for (const r of skuRows ?? []) skuMap.set(r.brand, r.sku_count)

  const brandMap = new Map((brands ?? []).map((b) => [b.id, b]))

  const neighbors: NeighborOut[] = edges
    .map((e) => {
      const b = brandMap.get(e.similar_brand_id)
      if (!b) return null
      const hasMeta =
        !!b.sensitivity_tags?.length ||
        !!b.brand_keywords?.length ||
        !!b.style_node ||
        !!(b.attributes && Object.keys(b.attributes).length)
      return {
        id: b.id,
        name: b.brand_name,
        similarity: Number(e.similarity),
        cluster: hasMeta ? clusterFromSensitivity(b.sensitivity_tags) : "empty",
        skuCount: skuMap.get(b.brand_name) ?? 0,
        hasMeta,
      }
    })
    .filter((n): n is NeighborOut => n !== null)

  return NextResponse.json({neighbors})
}
