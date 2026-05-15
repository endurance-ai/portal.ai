import {NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"
import * as XLSX from "xlsx"

export async function GET() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const { data: brands } = await supabase
    .from("brand_nodes")
    .select(
      "brand_name, brand_name_normalized, primary_style_node_id, secondary_style_node_id, " +
        "style_node_confidence, price_min_usd, price_max_usd, gender_scope, source_platforms, attributes",
    )
    .order("brand_name_normalized")

  if (!brands) return NextResponse.json({ error: "No data" }, { status: 500 })

  type BrandRow = {
    brand_name: string
    brand_name_normalized: string
    primary_style_node_id: number | null
    secondary_style_node_id: number | null
    style_node_confidence: number | null
    price_min_usd: number | null
    price_max_usd: number | null
    gender_scope: string[] | null
    source_platforms: string[] | null
    attributes: Record<string, unknown> | null
  }
  const rows = (brands as unknown as BrandRow[]).map((b) => ({
    brand_name: b.brand_name,
    brand_name_normalized: b.brand_name_normalized,
    primary_style_node_id: b.primary_style_node_id,
    secondary_style_node_id: b.secondary_style_node_id,
    style_node_confidence: b.style_node_confidence,
    price_min_usd: b.price_min_usd,
    price_max_usd: b.price_max_usd,
    gender_scope: (b.gender_scope || []).join(", "),
    source_platforms: (b.source_platforms || []).join(", "),
    attributes: JSON.stringify(b.attributes || {}),
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Brand_DB")
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="brand_nodes_${new Date().toISOString().split("T")[0]}.xlsx"`,
    },
  })
}
