import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const body = await request.json()

  // brand_nodes 슬림화 (067) 후 허용 컬럼.
  // drop: style_node(062), sensitivity_tags, brand_keywords, category_type,
  //       price_band, aliases, representative_image_urls, embedding* x_umap* (067)
  const allowed = [
    "primary_style_node_id", "secondary_style_node_id",
    "gender_scope", "source_platforms", "attributes",
    "price_min_usd", "price_max_usd",
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabase
    .from("brand_nodes")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brand: data })
}
