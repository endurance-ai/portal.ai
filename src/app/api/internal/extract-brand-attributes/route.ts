import {NextRequest, NextResponse} from "next/server"
import OpenAI from "openai"
import {requireInternalKey} from "@/lib/auth/internal"
import {supabase} from "@/lib/supabase"
import {logger} from "@/lib/logger"
import {buildPrompt} from "@/lib/prompts/registry"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/internal/extract-brand-attributes
 *
 * brand_nodes.attributes (12-dimension JSON) 추출 전용 endpoint.
 * brand-vlm (style_node 라벨링) 과 분리 — DB prompts.situation='brand-attributes'.
 *
 * Body: { brand_id: number, force?: boolean }
 * Header: X-Internal-Key
 *
 * 흐름:
 *  1. brand_nodes 존재 확인 + 기존 attributes 체크 (force=false 시 채워져있으면 skip)
 *  2. products WHERE brand_node_id=$1 AND is_brand_representative=true LIMIT 10
 *     - 1장 미만이면 insufficient_images 반환 (queue 등록 X — 어차피 임베딩에서도 제외)
 *  3. buildPrompt('brand-attributes', {BRAND_NAME, N_IMAGES})
 *  4. LiteLLM 멀티모달 호출 (system + user + N image, base64 인라인)
 *  5. JSON 파싱 + 12-key vocab 화이트리스트 sanitize
 *  6. brand_nodes.attributes UPDATE (전체 12-key 덮어쓰기)
 *
 * confidence 낮아도 review_queue 등록 X — attribute 추출은 "최선의 추정"이면 충분,
 * style_node 라벨링과 달리 검수 비용 > 가치 (어드민에서 brand-clusters 통해 사후 검수).
 */

type RequestBody = {
  brand_id?: number
  force?: boolean
}

const MAX_IMAGES = 10
const MIN_IMAGES = 1

// ─── Controlled vocabularies (prompt 와 1:1) ─────────────
// Vocab 외 값은 sanitize 단계에서 drop. prompt 변경 시 본 상수도 같이 갱신.
const VOCAB = {
  vibe: new Set([
    "archival", "quiet-luxury", "minimalist-architectural", "contemporary-basic",
    "avant-garde", "deconstructed-experimental", "workwear-revival",
    "preppy-classic", "streetwear", "americana", "y2k", "balletcore", "coquette",
    "mob-wife", "indie-sleaze", "dark-academia", "cottagecore", "normcore",
    "old-money", "techwear", "gorpcore", "outdoor", "athletic", "military",
    "utilitarian", "japanese-minimalist", "japanese-avant-garde",
    "scandinavian", "parisian-chic", "british-heritage",
  ]),
  palette: new Set([
    "BLACK", "WHITE", "GREY", "NAVY", "BLUE", "BEIGE", "BROWN", "GREEN",
    "RED", "PINK", "PURPLE", "ORANGE", "YELLOW", "CREAM", "KHAKI", "MULTI",
  ]),
  material: new Set([
    "cotton", "denim", "jersey", "wool", "cashmere", "mohair", "polyester", "nylon",
    "acrylic", "silk", "satin", "leather", "suede", "knit", "fleece", "linen",
    "gore-tex", "technical-shell", "sweatshirt", "tweed",
  ]),
  silhouette: new Set([
    "oversized", "tailored", "relaxed", "slim", "cropped", "boxy",
    "body-conscious", "structured", "draped", "voluminous", "asymmetric", "layered",
  ]),
  detail: new Set([
    "raw-edge", "utility-pocket", "contrast-stitch", "oversized-logo", "monogram",
    "distressed", "patchwork", "asymmetric-cut", "drawstring", "hood",
    "zip-detail", "embroidery", "hardware", "pleated", "sheer-panel",
  ]),
  pattern: new Set([
    "solid", "stripe", "check", "graphic", "logo", "abstract", "floral", "animal", "mixed",
  ]),
  gender_lean: new Set(["mens", "womens", "unisex", "mens-leaning", "womens-leaning"]),
  formality: new Set(["casual", "smart-casual", "business", "formal", "runway"]),
  price_tier: new Set(["budget", "contemporary", "premium", "luxury", "hype-priced"]),
  era_reference: new Set(["timeless", "90s", "y2k", "2010s", "2020s-now", "vintage-revival"]),
  subculture: new Set([
    "none", "techwear", "gorpcore", "preppy", "skate", "mod", "goth",
    "hip-hop", "punk", "surf", "military",
  ]),
} as const

const PICK_LIMIT = {
  vibe: 4, palette: 4, material: 4,
  silhouette: 3, detail: 4, pattern: 2,
} as const

// LiteLLM proxy 토글 (classify-brand 와 동일 패턴).
const useLiteLLM =
  !!process.env.LITELLM_BASE_URL && process.env.LITELLM_DISABLED !== "true"

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

  // 1) brand_nodes 존재 + 기존 attributes 확인
  const {data: brandRow, error: brandErr} = await supabase
    .from("brand_nodes")
    .select("id, brand_name, attributes")
    .eq("id", brandId)
    .maybeSingle()
  if (brandErr) {
    return NextResponse.json({ok: false, error: brandErr.message}, {status: 500})
  }
  if (!brandRow) {
    return NextResponse.json({ok: false, error: "brand not found"}, {status: 404})
  }
  if (!force && brandRow.attributes && Object.keys(brandRow.attributes).length >= 10) {
    // 이미 12-key 풍부하게 채워진 brand 는 skip (>=10 키 보유 = v1 출력 이미 적용)
    return NextResponse.json({
      ok: true,
      brand_id: brandId,
      result: "skipped",
      skipped_reason: "already_filled",
    })
  }

  // 2) 대표상품 이미지 fetch (MAX_IMAGES 까지)
  const {data: reps, error: repsErr} = await supabase
    .from("products")
    .select("image_url")
    .eq("brand_node_id", brandId)
    .eq("is_brand_representative", true)
    .not("image_url", "is", null)
    .limit(MAX_IMAGES)
  if (repsErr) {
    return NextResponse.json({ok: false, error: repsErr.message}, {status: 500})
  }
  const imageUrls = (reps ?? []).map((r) => r.image_url as string).filter(Boolean)
  if (imageUrls.length < MIN_IMAGES) {
    return NextResponse.json({
      ok: true,
      brand_id: brandId,
      result: "insufficient_images",
      reps_found: imageUrls.length,
    })
  }

  // 3) prompt 빌드
  let built
  try {
    built = await buildPrompt("brand-attributes", {
      BRAND_NAME: brandRow.brand_name,
      N_IMAGES: String(imageUrls.length),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ok: false, error: `prompt build: ${msg}`}, {status: 500})
  }

  // 4) image fetch + base64 인라인 (classify-brand 와 동일 — CDN 다운로드 대신 app 서버 경유)
  const fetched = await Promise.all(
    imageUrls.map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "kiko.ai-brand-attributes/1.0",
            Accept: "image/*",
          },
        })
        if (!res.ok) {
          logger.warn(`[extract-brand-attributes] image fetch ${res.status} ${url}`)
          return null
        }
        const buf = Buffer.from(await res.arrayBuffer())
        const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg"
        return {dataUri: `data:${mime};base64,${buf.toString("base64")}`}
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn(`[extract-brand-attributes] image fetch error ${url}: ${msg}`)
        return null
      }
    }),
  )
  const validImages = fetched.filter((x): x is NonNullable<typeof x> => x !== null)
  if (validImages.length < MIN_IMAGES) {
    return NextResponse.json({
      ok: true,
      brand_id: brandId,
      result: "insufficient_images",
      reps_found: imageUrls.length,
      fetched_ok: 0,
    })
  }

  // 5) LLM 호출
  const t0 = Date.now()
  let raw: string
  let finishReason: string | null = null
  try {
    const response = await getLLM().chat.completions.create({
      model: built.model_id ?? "nova-lite",
      messages: [
        {role: "system", content: built.system},
        {
          role: "user",
          content: [
            {type: "text", text: built.user},
            ...validImages.map(
              (img) =>
                ({
                  type: "image_url" as const,
                  image_url: {url: img.dataUri, detail: "low" as const},
                }),
            ),
          ],
        },
      ],
      max_tokens: built.max_tokens,
      temperature: built.temperature,
    })
    raw = response.choices[0]?.message?.content ?? ""
    finishReason = response.choices[0]?.finish_reason ?? null
  } catch (e) {
    const status = (e as {status?: number})?.status
    const code = (e as {code?: string})?.code
    const via = useLiteLLM ? "litellm" : "openai_direct"
    const masked = `[${via}_error] status=${status ?? "?"} code=${code ?? "?"}`
    logger.error(`[extract-brand-attributes] LLM failed brand=${brandId}: ${masked}`)
    return NextResponse.json(
      {ok: false, brand_id: brandId, error: masked, result: "llm_failed"},
      {status: 502},
    )
  }
  const latencyMs = Date.now() - t0

  if (finishReason === "length") {
    return NextResponse.json({
      ok: false,
      brand_id: brandId,
      result: "llm_failed",
      error: "finish_reason=length (max_tokens 부족)",
    })
  }
  if (!raw.trim()) {
    return NextResponse.json({
      ok: false,
      brand_id: brandId,
      result: "llm_failed",
      error: "empty content",
    })
  }

  // 6) JSON 파싱 — Nova 는 markdown fence / reasoning prefix 가 섞이는 경우 있음
  const cleanRawJson = (s: string): string => {
    const trimmed = s.replace(/```json\s*|\s*```/g, "").trim()
    const firstBrace = trimmed.indexOf("{")
    const lastBrace = trimmed.lastIndexOf("}")
    return firstBrace >= 0 && lastBrace > firstBrace
      ? trimmed.slice(firstBrace, lastBrace + 1)
      : trimmed
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleanRawJson(raw))
  } catch {
    return NextResponse.json({
      ok: false,
      brand_id: brandId,
      result: "json_parse_failed",
      raw: raw.slice(0, 500),
    })
  }

  // 7) Sanitize — vocab 외 값 drop, pick-N 초과 truncate
  const sanitized = sanitizeAttributes(parsed)

  // 8) brand_nodes.attributes UPDATE (전체 덮어쓰기)
  const {error: updateErr} = await supabase
    .from("brand_nodes")
    .update({
      attributes: sanitized,
      updated_at: new Date().toISOString(),
    })
    .eq("id", brandId)
  if (updateErr) {
    return NextResponse.json({ok: false, error: updateErr.message}, {status: 500})
  }

  logger.info(
    `[extract-brand-attributes] brand=${brandId} (${brandRow.brand_name}) → conf=${sanitized.confidence ?? "?"} (${latencyMs}ms, ${validImages.length}img, via ${useLiteLLM ? "litellm" : "openai_direct"})`,
  )

  return NextResponse.json({
    ok: true,
    brand_id: brandId,
    result: "extracted",
    attributes: sanitized,
    image_count: validImages.length,
    latency_ms: latencyMs,
    model_id: built.model_id,
  })
}

// ─── Sanitize helpers ────────────────────────────────────
function pickArray(
  raw: unknown,
  vocab: ReadonlySet<string>,
  limit: number,
): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of raw) {
    if (typeof v !== "string") continue
    if (!vocab.has(v)) continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= limit) break
  }
  return out
}

function pickSingle(raw: unknown, vocab: ReadonlySet<string>): string | null {
  // 배열로 와도 첫 valid 값 채택 (모델이 가끔 단일 필드를 array 로 반환)
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "string" && vocab.has(v)) return v
    }
    return null
  }
  if (typeof raw !== "string") return null
  return vocab.has(raw) ? raw : null
}

type SanitizedAttributes = {
  vibe: string[]
  palette: string[]
  material: string[]
  silhouette: string[]
  detail: string[]
  pattern: string[]
  gender_lean: string | null
  formality: string | null
  price_tier: string | null
  era_reference: string | null
  subculture: string | null
  confidence: number
  reasoning: string
}

function sanitizeAttributes(raw: Record<string, unknown>): SanitizedAttributes {
  const confRaw = raw.confidence
  let conf: number
  if (typeof confRaw === "number") {
    conf = confRaw
  } else if (typeof confRaw === "string") {
    const parsed = Number.parseFloat(confRaw)
    conf = Number.isFinite(parsed) ? parsed : 0
  } else {
    conf = 0
  }
  conf = Math.max(0, Math.min(1, conf))

  const reasoningRaw = raw.reasoning
  const reasoning =
    typeof reasoningRaw === "string" ? reasoningRaw.slice(0, 600) : ""

  return {
    vibe: pickArray(raw.vibe, VOCAB.vibe, PICK_LIMIT.vibe),
    palette: pickArray(raw.palette, VOCAB.palette, PICK_LIMIT.palette),
    material: pickArray(raw.material, VOCAB.material, PICK_LIMIT.material),
    silhouette: pickArray(raw.silhouette, VOCAB.silhouette, PICK_LIMIT.silhouette),
    detail: pickArray(raw.detail, VOCAB.detail, PICK_LIMIT.detail),
    pattern: pickArray(raw.pattern, VOCAB.pattern, PICK_LIMIT.pattern),
    gender_lean: pickSingle(raw.gender_lean, VOCAB.gender_lean),
    formality: pickSingle(raw.formality, VOCAB.formality),
    price_tier: pickSingle(raw.price_tier, VOCAB.price_tier),
    era_reference: pickSingle(raw.era_reference, VOCAB.era_reference),
    subculture: pickSingle(raw.subculture, VOCAB.subculture),
    confidence: Math.round(conf * 100) / 100,
    reasoning,
  }
}
