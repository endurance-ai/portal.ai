import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"
import {invalidateStyleNodesCache} from "@/lib/style-nodes-db"

/**
 * GET /api/admin/style-nodes — 활성/비활성 모두 포함한 노드 리스트 (admin 전용).
 */
export async function GET() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {data, error} = await supabase
    .from("style_nodes")
    .select(
      "id, code, name_en, name_ko, mood, include_rule, exclude_rule, keywords_en, keywords_ko, is_active, created_at, updated_at",
    )
    .order("code")
  if (error) return NextResponse.json({error: error.message}, {status: 500})
  return NextResponse.json({nodes: data ?? []})
}

/**
 * POST /api/admin/style-nodes — 새 노드 생성.
 * Body: { code, name_en, name_ko, mood?, include_rule?, exclude_rule?, keywords_en?, keywords_ko?, is_active? }
 */
export async function POST(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({error: "Invalid JSON body"}, {status: 400})
  }

  const {code, name_en, name_ko} = body as Record<string, unknown>
  if (typeof code !== "string" || typeof name_en !== "string" || typeof name_ko !== "string") {
    return NextResponse.json(
      {error: "code, name_en, name_ko are required strings"},
      {status: 400},
    )
  }
  if (!/^[A-Z]{1,3}$/.test(code)) {
    return NextResponse.json(
      {error: "code must match ^[A-Z]{1,3}$ (e.g. 'A', 'AB')"},
      {status: 400},
    )
  }

  const insertRow = {
    code,
    name_en,
    name_ko,
    mood: typeof body.mood === "string" ? body.mood : null,
    include_rule: typeof body.include_rule === "string" ? body.include_rule : null,
    exclude_rule: typeof body.exclude_rule === "string" ? body.exclude_rule : null,
    keywords_en: Array.isArray(body.keywords_en) ? (body.keywords_en as string[]) : [],
    keywords_ko: Array.isArray(body.keywords_ko) ? (body.keywords_ko as string[]) : [],
    is_active: body.is_active !== false,
  }

  const {data, error} = await supabase
    .from("style_nodes")
    .insert(insertRow)
    .select()
    .single()
  if (error) return NextResponse.json({error: error.message}, {status: 400})

  invalidateStyleNodesCache()
  return NextResponse.json({node: data}, {status: 201})
}
