import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"
import {getStyleNodeByCode} from "@/lib/style-nodes-db"

export const dynamic = "force-dynamic"

type Ctx = {params: Promise<{id: string}>}

/**
 * GET /api/admin/brand-node-review/[id] — 단건 + brand 상세.
 */
export async function GET(_request: NextRequest, ctx: Ctx) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {id} = await ctx.params
  const numericId = Number(id)
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({error: "invalid id"}, {status: 400})
  }

  const {data: row, error} = await supabase
    .from("brand_node_review_queue")
    .select("*")
    .eq("id", numericId)
    .maybeSingle()
  if (error) return NextResponse.json({error: error.message}, {status: 500})
  if (!row) return NextResponse.json({error: "queue row not found"}, {status: 404})

  // brand 상세 (067 슬림화 후 컬럼 정리)
  type BrandRow = {
    id: number
    brand_name: string
    primary_style_node_id: number | null
    secondary_style_node_id: number | null
    style_node_confidence: number | string | null
    style_node_assigned_at: string | null
    style_node_assigned_model: string | null
    gender_scope: string[] | null
    price_min_usd: number | string | null
    price_max_usd: number | string | null
  }
  const {data: brandRaw} = await supabase
    .from("brand_nodes")
    .select(
      "id, brand_name, primary_style_node_id, secondary_style_node_id, " +
        "style_node_confidence, style_node_assigned_at, style_node_assigned_model, " +
        "gender_scope, price_min_usd, price_max_usd",
    )
    .eq("id", row.brand_id)
    .maybeSingle()

  const brand = brandRaw as unknown as BrandRow | null

  let primaryCode: string | null = null
  let secondaryCode: string | null = null
  if (brand?.primary_style_node_id || brand?.secondary_style_node_id) {
    const ids = [brand.primary_style_node_id, brand.secondary_style_node_id].filter(Boolean) as number[]
    const {data: styles} = await supabase.from("style_nodes").select("id, code, name_en").in("id", ids)
    const map = new Map(
      ((styles ?? []) as Array<{id: number; code: string; name_en: string}>).map((s) => [s.id, s]),
    )
    if (brand.primary_style_node_id) primaryCode = map.get(brand.primary_style_node_id)?.code ?? null
    if (brand.secondary_style_node_id) secondaryCode = map.get(brand.secondary_style_node_id)?.code ?? null
  }

  // 대표 이미지 — products.is_brand_representative 가 source of truth
  let representativeImages: Array<{product_id: string; image_url: string}> = []
  if (brand) {
    type RepRow = {id: string; images: string[] | null}
    const {data: reps} = await supabase
      .from("products")
      .select("id, images")
      .eq("brand_node_id", brand.id)
      .eq("is_brand_representative", true)
      .limit(5)
    representativeImages = ((reps ?? []) as RepRow[])
      .map((r) => ({product_id: r.id, image_url: r.images?.[0] ?? ""}))
      .filter((r) => r.image_url)
  }

  return NextResponse.json({
    queue: row,
    brand: brand
      ? {
          ...brand,
          primary_code: primaryCode,
          secondary_code: secondaryCode,
          representative_images: representativeImages,
        }
      : null,
  })
}

type ActionBody =
  | {action: "approve"}
  | {action: "dismiss"; admin_note?: string}
  | {action: "manual"; primary_code: string; secondary_code?: string | null; admin_note?: string}
  | {action: "rerun"}

/**
 * PATCH /api/admin/brand-node-review/[id] — admin action.
 *
 * Actions:
 *  - approve: vlm_output 의 primary/secondary 그대로 brand_nodes 박음 + queue resolve.
 *  - manual:  admin 이 직접 primary_code / secondary_code 지정 + brand_nodes 박음 + queue resolve.
 *  - dismiss: brand_nodes 안 건드림. queue 만 resolve (admin_note 와 함께).
 *  - rerun:   classify_brand_acquire 의 sentinel 만 reset (style_node_assigned_at=null) + queue resolve.
 *             크롤러 / cron 이 다음 호출 시 force=false 로 다시 처리.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate
  const user = "user" in gate ? gate.user : null

  const {id} = await ctx.params
  const numericId = Number(id)
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({error: "invalid id"}, {status: 400})
  }

  const body = (await request.json().catch(() => null)) as ActionBody | null
  if (!body || typeof body !== "object" || !("action" in body)) {
    return NextResponse.json({error: "action required"}, {status: 400})
  }

  // queue row + brand 함께 fetch
  const {data: row, error: fetchErr} = await supabase
    .from("brand_node_review_queue")
    .select("id, brand_id, vlm_output, resolved_at")
    .eq("id", numericId)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({error: fetchErr.message}, {status: 500})
  if (!row) return NextResponse.json({error: "queue row not found"}, {status: 404})
  if (row.resolved_at !== null) {
    return NextResponse.json({error: "already resolved"}, {status: 400})
  }

  const adminEmail = user?.email ?? "system"
  const nowIso = new Date().toISOString()

  if (body.action === "approve") {
    // vlm_output 에서 primary/secondary 추출
    const vlm = (row.vlm_output ?? {}) as Record<string, unknown>
    const primaryCode = typeof vlm.primary_node === "string" ? vlm.primary_node : null
    const secondaryCode = typeof vlm.secondary_node === "string" ? vlm.secondary_node : null
    const confidence = typeof vlm.primary_confidence === "number" ? vlm.primary_confidence : null
    if (!primaryCode) {
      return NextResponse.json({error: "vlm_output has no primary_node — use manual instead"}, {status: 400})
    }
    const primaryNode = await getStyleNodeByCode(primaryCode)
    if (!primaryNode) {
      return NextResponse.json({error: `unknown primary_code: ${primaryCode}`}, {status: 400})
    }
    let secondaryNodeId: number | null = null
    if (secondaryCode && secondaryCode !== primaryCode) {
      const s = await getStyleNodeByCode(secondaryCode)
      if (s) secondaryNodeId = s.id
    }
    // resolve 먼저 (atomic). 다른 액션이 이미 잡았으면 brand_nodes 안 건드림.
    const won = await resolveQueue(numericId, adminEmail, nowIso)
    if (!won) {
      return NextResponse.json({error: "already resolved by another action"}, {status: 409})
    }
    await applyBrandNode(row.brand_id, primaryNode.id, secondaryNodeId, confidence, "admin:approve")
    return NextResponse.json({ok: true, action: "approve", primary_code: primaryCode, secondary_code: secondaryCode})
  }

  if (body.action === "manual") {
    if (typeof body.primary_code !== "string") {
      return NextResponse.json({error: "primary_code required"}, {status: 400})
    }
    const primaryNode = await getStyleNodeByCode(body.primary_code)
    if (!primaryNode) {
      return NextResponse.json({error: `unknown primary_code: ${body.primary_code}`}, {status: 400})
    }
    let secondaryNodeId: number | null = null
    if (body.secondary_code && body.secondary_code !== body.primary_code) {
      const s = await getStyleNodeByCode(body.secondary_code)
      if (s) secondaryNodeId = s.id
    }
    const won = await resolveQueue(numericId, adminEmail, nowIso, body.admin_note)
    if (!won) {
      return NextResponse.json({error: "already resolved by another action"}, {status: 409})
    }
    await applyBrandNode(row.brand_id, primaryNode.id, secondaryNodeId, null, "admin:manual")
    return NextResponse.json({ok: true, action: "manual", primary_code: body.primary_code, secondary_code: body.secondary_code ?? null})
  }

  if (body.action === "dismiss") {
    const won = await resolveQueue(numericId, adminEmail, nowIso, body.admin_note)
    if (!won) {
      return NextResponse.json({error: "already resolved by another action"}, {status: 409})
    }
    return NextResponse.json({ok: true, action: "dismiss"})
  }

  if (body.action === "rerun") {
    // queue open 유지 + admin_note 마크. process-reruns batch 가 picked up 함.
    // brand_nodes 는 그대로 (force=true 호출이 sentinel 무시).
    await supabase
      .from("brand_node_review_queue")
      .update({admin_note: "RERUN_REQUESTED"})
      .eq("id", numericId)
    return NextResponse.json({ok: true, action: "rerun", status: "pending"})
  }

  return NextResponse.json({error: "unknown action"}, {status: 400})
}

async function applyBrandNode(
  brandId: number,
  primaryId: number,
  secondaryId: number | null,
  confidence: number | null,
  source: string,
): Promise<void> {
  await supabase
    .from("brand_nodes")
    .update({
      primary_style_node_id: primaryId,
      secondary_style_node_id: secondaryId,
      style_node_confidence: confidence,
      style_node_assigned_at: new Date().toISOString(),
      style_node_assigned_model: source,
    })
    .eq("id", brandId)
}

/**
 * atomic resolve — `WHERE resolved_at IS NULL` 절로 두 admin 동시 액션 중 한 쪽만 성공.
 * @returns true 면 본인 트랜잭션이 resolve 한 것, false 면 이미 다른 액션이 resolve 함
 */
async function resolveQueue(
  queueId: number,
  adminEmail: string,
  nowIso: string,
  adminNote?: string,
): Promise<boolean> {
  const update: Record<string, unknown> = {
    resolved_at: nowIso,
    resolved_by: adminEmail,
  }
  if (adminNote !== undefined) update.admin_note = adminNote
  const {data} = await supabase
    .from("brand_node_review_queue")
    .update(update)
    .eq("id", queueId)
    .is("resolved_at", null)
    .select("id")
    .maybeSingle()
  return data !== null
}
