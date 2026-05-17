import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"
import {
  ALLOWED_MODEL_IDS,
  invalidatePromptCache,
  MAX_PROMPT_BODY_LEN,
  type PromptSituation,
} from "@/lib/prompts/registry"

type Ctx = {params: Promise<{id: string}>}

/**
 * GET /api/admin/prompts/[id] — 단건 조회 (전체 본문 포함).
 */
export async function GET(_request: NextRequest, ctx: Ctx) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {id} = await ctx.params
  const numericId = Number(id)
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({error: "invalid id"}, {status: 400})
  }
  const {data, error} = await supabase
    .from("prompts")
    .select(
      "id, situation, version, is_active, system_md, user_md, placeholders, model_id, max_tokens, temperature, notes, created_by, created_at, updated_at",
    )
    .eq("id", numericId)
    .maybeSingle()
  if (error) return NextResponse.json({error: error.message}, {status: 500})
  if (!data) return NextResponse.json({error: "prompt not found"}, {status: 404})
  return NextResponse.json({prompt: data})
}

/**
 * PATCH /api/admin/prompts/[id] — 본문 / 메타 수정.
 * Editable: system_md, user_md, placeholders, model_id, max_tokens, temperature, notes, is_active.
 * is_active=true 로 변경 시 PL/pgSQL `activate_prompt` 함수로 원자 처리 (siblings deactivate + self activate).
 * situation / version 은 immutable.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {id} = await ctx.params
  const numericId = Number(id)
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({error: "invalid id"}, {status: 400})
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({error: "Invalid JSON body"}, {status: 400})
  }

  // 현재 row 조회 (situation, is_active)
  const {data: existing, error: fetchErr} = await supabase
    .from("prompts")
    .select("id, situation, is_active")
    .eq("id", numericId)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({error: fetchErr.message}, {status: 500})
  if (!existing) return NextResponse.json({error: "prompt not found"}, {status: 404})

  const patch: Record<string, unknown> = {}

  // 본문 — 길이 상한 검증
  for (const k of ["system_md", "user_md"] as const) {
    if (k in body) {
      const v = body[k]
      if (typeof v !== "string") {
        return NextResponse.json({error: `${k} must be string`}, {status: 400})
      }
      if (v.length > MAX_PROMPT_BODY_LEN) {
        return NextResponse.json(
          {error: `${k} exceeds max length ${MAX_PROMPT_BODY_LEN}`},
          {status: 400},
        )
      }
      patch[k] = v
    }
  }

  // model_id — allowlist 검증
  if ("model_id" in body) {
    const v = body.model_id
    if (v !== null && typeof v !== "string") {
      return NextResponse.json({error: "model_id must be string or null"}, {status: 400})
    }
    if (typeof v === "string" && !ALLOWED_MODEL_IDS.includes(v)) {
      return NextResponse.json(
        {error: `model_id not in allowlist. allowed: ${ALLOWED_MODEL_IDS.join(", ")}`},
        {status: 400},
      )
    }
    patch.model_id = v
  }

  // notes
  if ("notes" in body) {
    patch.notes = body.notes
  }

  // placeholders
  if ("placeholders" in body && typeof body.placeholders === "object") {
    patch.placeholders = body.placeholders
  }

  // numeric
  if ("max_tokens" in body && typeof body.max_tokens === "number") {
    patch.max_tokens = body.max_tokens
  }
  if ("temperature" in body && typeof body.temperature === "number") {
    patch.temperature = body.temperature
  }

  const willActivate = body.is_active === true && !existing.is_active
  const willDeactivate = body.is_active === false && existing.is_active

  // 본문/메타 먼저 update
  if (Object.keys(patch).length > 0) {
    const {error: updateErr} = await supabase
      .from("prompts")
      .update(patch)
      .eq("id", numericId)
    if (updateErr) return NextResponse.json({error: updateErr.message}, {status: 400})
  }

  // is_active toggle
  if (willActivate) {
    const {data: rpcData, error: rpcErr} = await supabase.rpc("activate_prompt", {
      p_id: numericId,
    })
    if (rpcErr) {
      return NextResponse.json({error: `activate_prompt: ${rpcErr.message}`}, {status: 500})
    }
    invalidatePromptCache(existing.situation as PromptSituation)
    return NextResponse.json({prompt: rpcData})
  }
  if (willDeactivate) {
    const {error: deactErr} = await supabase
      .from("prompts")
      .update({is_active: false})
      .eq("id", numericId)
    if (deactErr) return NextResponse.json({error: deactErr.message}, {status: 400})
  }

  if (Object.keys(patch).length === 0 && !willActivate && !willDeactivate) {
    return NextResponse.json({error: "no fields to update"}, {status: 400})
  }

  // 최종 row 재조회 (정확한 응답)
  const {data: finalRow, error: finalErr} = await supabase
    .from("prompts")
    .select(
      "id, situation, version, is_active, system_md, user_md, placeholders, model_id, max_tokens, temperature, notes, created_by, created_at, updated_at",
    )
    .eq("id", numericId)
    .maybeSingle()
  if (finalErr) return NextResponse.json({error: finalErr.message}, {status: 500})

  invalidatePromptCache(existing.situation as PromptSituation)
  return NextResponse.json({prompt: finalRow})
}

/**
 * DELETE /api/admin/prompts/[id] — soft (is_active=false).
 * 존재 확인 후 update 패턴 (정확한 404 응답).
 */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {id} = await ctx.params
  const numericId = Number(id)
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({error: "invalid id"}, {status: 400})
  }

  // 존재 확인 (정확한 404)
  const {data: existing, error: fetchErr} = await supabase
    .from("prompts")
    .select("id, situation")
    .eq("id", numericId)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({error: fetchErr.message}, {status: 500})
  if (!existing) return NextResponse.json({error: "prompt not found"}, {status: 404})

  const {data, error} = await supabase
    .from("prompts")
    .update({is_active: false})
    .eq("id", numericId)
    .select("id, situation, is_active")
    .maybeSingle()
  if (error) return NextResponse.json({error: error.message}, {status: 400})

  invalidatePromptCache(existing.situation as PromptSituation)
  return NextResponse.json({prompt: data})
}
