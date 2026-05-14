import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"
import {
  ALLOWED_MODEL_IDS,
  invalidatePromptCache,
  MAX_PROMPT_BODY_LEN,
  PROMPT_SITUATIONS,
  type PromptSituation,
} from "@/lib/prompts/registry"

/**
 * GET /api/admin/prompts — 모든 prompt row.
 * Optional ?situation=vision-analyze 필터.
 */
export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {searchParams} = request.nextUrl
  const situation = searchParams.get("situation")

  let q = supabase
    .from("prompts")
    .select(
      "id, situation, version, is_active, model_id, max_tokens, temperature, notes, created_by, created_at, updated_at",
    )
    .order("situation")
    .order("is_active", {ascending: false})
    .order("created_at", {ascending: false})

  if (situation) q = q.eq("situation", situation)

  const {data, error} = await q
  if (error) return NextResponse.json({error: error.message}, {status: 500})
  return NextResponse.json({prompts: data ?? []})
}

/**
 * POST /api/admin/prompts — 새 version 생성.
 * activate=true 면 PL/pgSQL `activate_prompt` 로 atomic activate.
 */
export async function POST(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate
  const user = "user" in gate ? gate.user : null

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({error: "Invalid JSON body"}, {status: 400})
  }

  const {situation, version, system_md, user_md} = body as Record<
    string,
    unknown
  >
  if (
    typeof situation !== "string" ||
    !PROMPT_SITUATIONS.includes(situation as PromptSituation)
  ) {
    return NextResponse.json(
      {error: `situation must be one of: ${PROMPT_SITUATIONS.join(", ")}`},
      {status: 400},
    )
  }
  if (typeof version !== "string" || version.length < 1 || version.length > 30) {
    return NextResponse.json({error: "version must be 1-30 chars"}, {status: 400})
  }
  if (typeof system_md !== "string" || typeof user_md !== "string") {
    return NextResponse.json(
      {error: "system_md and user_md are required strings"},
      {status: 400},
    )
  }
  if (
    system_md.length > MAX_PROMPT_BODY_LEN ||
    user_md.length > MAX_PROMPT_BODY_LEN
  ) {
    return NextResponse.json(
      {error: `system_md/user_md exceed max length ${MAX_PROMPT_BODY_LEN}`},
      {status: 400},
    )
  }

  // model_id allowlist
  const rawModelId = body.model_id
  let modelId: string | null = null
  if (rawModelId === null || rawModelId === undefined) {
    modelId = null
  } else if (typeof rawModelId === "string") {
    if (!ALLOWED_MODEL_IDS.includes(rawModelId)) {
      return NextResponse.json(
        {error: `model_id not in allowlist. allowed: ${ALLOWED_MODEL_IDS.join(", ")}`},
        {status: 400},
      )
    }
    modelId = rawModelId
  } else {
    return NextResponse.json({error: "model_id must be string or null"}, {status: 400})
  }

  const activate = body.activate === true
  const insertRow = {
    situation,
    version,
    is_active: false, // activate 는 별도 RPC 단계로
    system_md,
    user_md,
    placeholders:
      body.placeholders && typeof body.placeholders === "object"
        ? body.placeholders
        : {},
    model_id: modelId,
    max_tokens:
      typeof body.max_tokens === "number" ? body.max_tokens : 1200,
    temperature:
      typeof body.temperature === "number" ? body.temperature : 0.0,
    notes: typeof body.notes === "string" ? body.notes : null,
    created_by: user?.email ?? null,
  }

  const {data: inserted, error: insertError} = await supabase
    .from("prompts")
    .insert(insertRow)
    .select()
    .single()
  if (insertError) {
    return NextResponse.json({error: insertError.message}, {status: 400})
  }

  if (activate) {
    const {data: activated, error: rpcErr} = await supabase.rpc("activate_prompt", {
      p_id: inserted.id,
    })
    if (rpcErr) {
      return NextResponse.json(
        {error: `activate_prompt: ${rpcErr.message}`},
        {status: 500},
      )
    }
    invalidatePromptCache(situation as PromptSituation)
    return NextResponse.json({prompt: activated}, {status: 201})
  }

  invalidatePromptCache(situation as PromptSituation)
  return NextResponse.json({prompt: inserted}, {status: 201})
}
