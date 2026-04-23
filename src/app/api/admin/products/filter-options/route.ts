import {NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

// 브라우저는 캐시하지 않고 CDN/서버 수준에서만 10분 캐시
export const revalidate = 600

interface FilterCountRow {
  dimension: string
  value: string
  count: number
}

export interface FilterOptionsResponse {
  platforms: {value: string; count: number}[]
  categories: {value: string; count: number}[]
  subcategories: Record<string, {value: string; count: number}[]>
  styleNodes: {value: string; count: number}[]
  colorFamilies: {value: string; count: number}[]
  fits: {value: string; count: number}[]
  fabrics: {value: string; count: number}[]
}

export async function GET() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {data, error} = await supabase.rpc("get_product_filter_counts")
  if (error) {
    return NextResponse.json(
      {error: error.message, code: "RPC_FAILED"},
      {status: 500}
    )
  }

  const rows = (data ?? []) as FilterCountRow[]

  const byDimension = (dim: string) =>
    rows
      .filter((r) => r.dimension === dim)
      .sort((a, b) => b.count - a.count)
      .map((r) => ({value: r.value, count: Number(r.count)}))

  const subcategories: FilterOptionsResponse["subcategories"] = {}
  for (const row of rows) {
    if (!row.dimension.startsWith("subcategory:")) continue
    const category = row.dimension.slice("subcategory:".length)
    if (!subcategories[category]) subcategories[category] = []
    subcategories[category].push({value: row.value, count: Number(row.count)})
  }
  for (const cat of Object.keys(subcategories)) {
    subcategories[cat].sort((a, b) => b.count - a.count)
  }

  const response: FilterOptionsResponse = {
    platforms: byDimension("platform"),
    categories: byDimension("category"),
    subcategories,
    styleNodes: byDimension("style_node"),
    colorFamilies: byDimension("color_family"),
    fits: byDimension("fit"),
    fabrics: byDimension("fabric"),
  }

  return NextResponse.json(response, {
    headers: {
      "cache-control": "public, max-age=0, s-maxage=600, stale-while-revalidate=60",
    },
  })
}
