import {NextRequest, NextResponse} from "next/server"
import OpenAI from "openai"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
import {requireInternalKey} from "@/lib/auth/internal"
import {supabase} from "@/lib/supabase"
import {logger} from "@/lib/logger"
import {buildPrompt} from "@/lib/prompts/registry"
import {getStyleNodeByCode} from "@/lib/style-nodes-db"

/**
 * POST /api/internal/classify-brand
 *
 * 크롤러가 brand_nodes INSERT + is_brand_representative 선정 직후 호출하는 분류 endpoint.
 *
 * Body: { brand_id: number, force?: boolean }
 * Header: X-Internal-Key
 *
 * 흐름:
 *  1. PL/pgSQL classify_brand_acquire(brand_id, force) — atomic lock + skip 분기
 *  2. products WHERE brand_node_id=$1 AND is_brand_representative=true LIMIT 5
 *     - 5장 미만이면 review_queue (insufficient_images)
 *  3. registry.buildPrompt('brand-vlm', { BRAND_NAME }) → 완성된 prompt
 *  4. OpenAI multimodal 호출 (system + user + 5 image)
 *     - finish_reason='length' 면 token_limit → review_queue
 *  5. JSON 파싱 + node code 유효성 검증
 *  6. confidence >= 0.7 → brand_nodes UPDATE
 *     confidence <  0.7 → review_queue (low_confidence)
 *     primary==secondary 또는 코드 unknown → review_queue
 *  7. response 반환
 *
 * Race-free: classify_brand_acquire 가 SELECT FOR UPDATE + sentinel update 로 atomic.
 *            enqueue_brand_review RPC 가 partial unique index 와 함께 atomic upsert.
 */

type RequestBody = {
  brand_id?: number
  force?: boolean
}

const CONFIDENCE_THRESHOLD = 0.7

// LiteLLM 프록시 토글 (analyze/route.ts 와 동일 패턴).
// LITELLM_BASE_URL 설정 + LITELLM_DISABLED !== "true" 일 때만 LiteLLM 경유.
// 프록시 다운 시 .env 에 LITELLM_DISABLED=true 추가로 OpenAI direct 폴백.
const useLiteLLM =
  !!process.env.LITELLM_BASE_URL && process.env.LITELLM_DISABLED !== "true"

// Lazy init — Next.js build 시 키 없어도 module load 통과
let llmClient: OpenAI | null = null
function getLLM(): OpenAI {
  if (!llmClient) {
    const apiKey = useLiteLLM
      ? process.env.LITELLM_API_KEY || process.env.OPENAI_API_KEY
      : process.env.OPENAI_API_KEY
    llmClient = new OpenAI({
      apiKey,
      baseURL: useLiteLLM ? `${process.env.LITELLM_BASE_URL}/v1` : undefined,
    })
  }
  return llmClient
}

export async function POST(request: NextRequest) {
  const gate = requireInternalKey(request)
  if (gate instanceof NextResponse) return gate

  const body = (await request.json().catch(() => null)) as RequestBody | null
  if (!body || typeof body.brand_id !== "number" || !Number.isInteger(body.brand_id)) {
    return NextResponse.json(
      {ok: false, error: "brand_id (integer) required in body"},
      {status: 400},
    )
  }
  const brandId = body.brand_id
  const force = body.force === true

  // 1) atomic lock + skip 분기 (PL/pgSQL RPC)
  const {data: acquired, error: acquireErr} = await supabase.rpc("classify_brand_acquire", {
    p_brand_id: brandId,
    p_force: force,
  })
  if (acquireErr) {
    return NextResponse.json({ok: false, error: acquireErr.message}, {status: 500})
  }
  if (!acquired || acquired.length === 0) {
    return NextResponse.json({ok: false, error: "brand not found"}, {status: 404})
  }
  const lockRow = acquired[0] as {
    id: number
    brand_name: string
    primary_node_id: number | null
    skip_reason: string | null
  }
  if (lockRow.skip_reason) {
    return NextResponse.json({
      ok: true,
      brand_id: brandId,
      result: "skipped",
      skipped_reason: lockRow.skip_reason,
    })
  }

  // 2) representative 이미지 5장
  const {data: reps, error: repsErr} = await supabase
    .from("products")
    .select("image_url")
    .eq("brand_node_id", brandId)
    .eq("is_brand_representative", true)
    .not("image_url", "is", null)
    .limit(5)
  if (repsErr) {
    return NextResponse.json({ok: false, error: repsErr.message}, {status: 500})
  }

  const imageUrls = (reps ?? []).map((r) => r.image_url as string).filter(Boolean)
  if (imageUrls.length < 5) {
    await enqueueReview(brandId, "insufficient_images", {
      reps_found: imageUrls.length,
    })
    return NextResponse.json({
      ok: true,
      brand_id: brandId,
      result: "queued",
      queued_reason: "insufficient_images",
    })
  }

  // 3) prompt 빌드
  let built
  try {
    built = await buildPrompt("brand-vlm", {BRAND_NAME: lockRow.brand_name})
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await enqueueReview(brandId, "vlm_failed", {error: `prompt build: ${msg}`})
    return NextResponse.json({ok: false, error: `prompt build: ${msg}`}, {status: 500})
  }

  // 4) OpenAI multimodal
  const t0 = Date.now()
  let raw: string
  let finishReason: string | null = null
  try {
    const response = await getLLM().chat.completions.create({
      model: built.model_id ?? "gpt-4o-mini",
      messages: [
        {role: "system", content: built.system},
        {
          role: "user",
          content: [
            {type: "text", text: built.user},
            ...imageUrls.map(
              (url) =>
                ({
                  type: "image_url" as const,
                  image_url: {url, detail: "auto" as const},
                }),
            ),
          ],
        },
      ],
      max_tokens: built.max_tokens,
      temperature: built.temperature,
      response_format: {type: "json_object"},
    })
    raw = response.choices[0]?.message?.content ?? ""
    finishReason = response.choices[0]?.finish_reason ?? null
  } catch (e) {
    // OpenAI/LiteLLM error 메시지는 URL/request ID 일부 포함 가능 → 마스킹
    const status = (e as {status?: number})?.status
    const code = (e as {code?: string})?.code
    const via = useLiteLLM ? "litellm" : "openai_direct"
    const masked = `[${via}_error] status=${status ?? "?"} code=${code ?? "?"}`
    logger.error(`[classify-brand] LLM failed brand=${brandId}: ${masked}`)
    await enqueueReview(brandId, "vlm_failed", {error: masked})
    return NextResponse.json(
      {ok: false, error: masked, brand_id: brandId, result: "queued", queued_reason: "vlm_failed"},
      {status: 502},
    )
  }
  const latencyMs = Date.now() - t0

  // 4-1) finish_reason check — length 면 max_tokens 부족
  if (finishReason === "length") {
    await enqueueReview(brandId, "vlm_failed", {
      error: "openai_finish_reason_length",
      raw: raw.slice(0, 500),
    })
    return NextResponse.json({
      ok: false,
      brand_id: brandId,
      result: "queued",
      queued_reason: "vlm_failed",
      error: "openai finish_reason=length (max_tokens 부족)",
    })
  }

  if (!raw.trim()) {
    await enqueueReview(brandId, "vlm_failed", {error: "openai_empty_content", finish_reason: finishReason})
    return NextResponse.json({
      ok: false,
      brand_id: brandId,
      result: "queued",
      queued_reason: "vlm_failed",
      error: "openai returned empty content",
    })
  }

  // 5) JSON 파싱 + 검증
  let parsed: {
    primary_node?: string
    primary_confidence?: number
    secondary_node?: string | null
    secondary_confidence?: number | null
    reasoning?: string
  }
  try {
    parsed = JSON.parse(raw)
  } catch {
    await enqueueReview(brandId, "vlm_failed", {error: "json_parse_failed", raw: raw.slice(0, 500)})
    return NextResponse.json(
      {ok: false, brand_id: brandId, result: "queued", queued_reason: "vlm_failed", error: "json parse failed"},
    )
  }

  const primaryCode = parsed.primary_node
  const primaryConf = parsed.primary_confidence
  const secondaryCode = parsed.secondary_node ?? null

  if (typeof primaryCode !== "string" || typeof primaryConf !== "number") {
    await enqueueReview(brandId, "vlm_failed", {
      error: "missing primary_node or confidence",
      vlm_output: parsed,
    })
    return NextResponse.json({
      ok: false,
      brand_id: brandId,
      result: "queued",
      queued_reason: "vlm_failed",
      error: "missing primary_node or confidence",
    })
  }

  // node 코드 → id 변환
  const primaryNode = await getStyleNodeByCode(primaryCode)
  if (!primaryNode) {
    await enqueueReview(brandId, "vlm_failed", {
      error: `unknown primary_node code: ${primaryCode}`,
      vlm_output: parsed,
    })
    return NextResponse.json({
      ok: false,
      brand_id: brandId,
      result: "queued",
      queued_reason: "vlm_failed",
      error: `unknown primary_node code: ${primaryCode}`,
    })
  }

  let secondaryNodeId: number | null = null
  let secondaryWarn: string | null = null
  if (secondaryCode && secondaryCode !== primaryCode) {
    const secondaryNode = await getStyleNodeByCode(secondaryCode)
    if (secondaryNode) {
      secondaryNodeId = secondaryNode.id
    } else {
      secondaryWarn = `unknown secondary_node code: ${secondaryCode}`
    }
  }

  // 6) confidence < 0.7 → review queue
  if (primaryConf < CONFIDENCE_THRESHOLD) {
    await enqueueReview(brandId, "low_confidence", {
      vlm_output: parsed,
      latency_ms: latencyMs,
      secondary_warn: secondaryWarn,
    })
    return NextResponse.json({
      ok: true,
      brand_id: brandId,
      result: "queued",
      queued_reason: "low_confidence",
    })
  }

  // 7) brand_nodes UPDATE
  const {error: updateErr} = await supabase
    .from("brand_nodes")
    .update({
      primary_node_id: primaryNode.id,
      secondary_node_id: secondaryNodeId,
      node_confidence: primaryConf,
      node_assigned_at: new Date().toISOString(),
      node_assigned_model: built.model_id ?? "gpt-4o-mini",
    })
    .eq("id", brandId)
  if (updateErr) {
    return NextResponse.json({ok: false, error: updateErr.message}, {status: 500})
  }

  logger.info(
    `[classify-brand] brand=${brandId} (${lockRow.brand_name}) → ${primaryCode}/${secondaryCode ?? "-"} conf=${primaryConf} (${latencyMs}ms via ${useLiteLLM ? "litellm" : "openai_direct"})`,
  )

  return NextResponse.json({
    ok: true,
    brand_id: brandId,
    result: "classified",
    primary_node: primaryCode,
    secondary_node: secondaryCode,
    secondary_warn: secondaryWarn,
    confidence: primaryConf,
    model_id: built.model_id ?? "gpt-4o-mini",
    latency_ms: latencyMs,
  })
}

/** review_queue 에 atomic upsert (PL/pgSQL RPC). */
async function enqueueReview(
  brandId: number,
  reason:
    | "insufficient_images"
    | "low_confidence"
    | "multi_node_conflict"
    | "vlm_failed"
    | "alias_candidate",
  payload: Record<string, unknown>,
): Promise<void> {
  await supabase.rpc("enqueue_brand_review", {
    p_brand_id: brandId,
    p_reason: reason,
    p_vlm_output: payload,
  })
}
