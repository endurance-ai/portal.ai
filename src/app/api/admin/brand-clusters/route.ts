import {NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/brand-clusters
 *
 * SPEC-BRAND-EMBED-001 P6 / AC-007.
 * brand_multimodal_umap 2D 좌표 + brand 메타 + style_node 매핑 반환.
 *
 * 좌표 갱신 = scripts/build_brand_umap.py 별도 실행.
 */
export async function GET() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {data: umap, error: umapErr} = await supabase
    .from("brand_multimodal_umap")
    .select("brand_id, x, y, computed_at")
  if (umapErr) return NextResponse.json({error: umapErr.message}, {status: 500})

  if (!umap || umap.length === 0) {
    return NextResponse.json({brands: [], nodes: [], computed_at: null})
  }

  const brandIds = umap.map((r) => r.brand_id)
  const {data: brands, error: brandErr} = await supabase
    .from("brand_nodes")
    .select("id, brand_name, primary_style_node_id, secondary_style_node_id")
    .in("id", brandIds)
  if (brandErr) return NextResponse.json({error: brandErr.message}, {status: 500})

  const {data: nodes, error: nodeErr} = await supabase
    .from("style_nodes")
    .select("id, code, name_en")
    .eq("is_active", true)
    .order("code")
  if (nodeErr) return NextResponse.json({error: nodeErr.message}, {status: 500})

  const brandById = new Map((brands ?? []).map((b) => [b.id, b]))
  const items = umap.map((r) => {
    const b = brandById.get(r.brand_id)
    return {
      brand_id: r.brand_id,
      brand_name: b?.brand_name ?? "(unknown)",
      primary_style_node_id: b?.primary_style_node_id ?? null,
      secondary_style_node_id: b?.secondary_style_node_id ?? null,
      x: r.x,
      y: r.y,
    }
  })

  const latestComputed = umap
    .map((r) => r.computed_at)
    .sort()
    .at(-1)

  return NextResponse.json({
    brands: items,
    nodes: nodes ?? [],
    computed_at: latestComputed,
  })
}
