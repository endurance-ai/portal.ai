// @MX:NOTE: [AUTO] v6 query-embedding helper — Modal /embed (image) + /embed/text
//   (text) in the shared 768-dim L2-normalized FashionSigLIP space, fused
//   image-dominant α=0.7 (SPEC-SEARCH-V6-001 §13 결정 3, ratified — α locked).
// @MX:SPEC: SPEC-SEARCH-V6-001
import "server-only"
import {logger} from "@/lib/logger"

/**
 * SPEC-SEARCH-V6-001 P1 — v6 query embedding.
 *
 * Mirrors the ai-repo `EmbedProvider` contract (app/providers/embedding.py):
 * the same Modal app (`portal-embed`) exposes:
 *   POST /embed       {image_url}  → {embedding:[768], dim, model}
 *   POST /embed/text  {text}       → {embedding:[768], dim, model}
 * image & text live in ONE FashionSigLIP space (L2-norm) so cross-modal
 * cosine is valid (embed_app.py header). Env keys reuse the ai-repo names
 * (MODAL_EMBED_URL / MODAL_EMBED_TOKEN / MODAL_EMBED_TIMEOUT) for stack
 * consistency — see scripts/embed_brand_multimodal.py / ai providers.
 *
 * Fusion (ratified §13 결정 3, α locked 0.7): when a text prompt is present
 * AND /embed/text succeeds → query_emb = normalize(0.7·img + 0.3·txt).
 * No text, or /embed/text 5xx/timeout → image-only (REQ-V6-015 runtime
 * fallback). Image /embed failure → throws (engine maps to failed:true).
 */

const MODAL_EMBED_URL = process.env.MODAL_EMBED_URL
const MODAL_EMBED_TOKEN = process.env.MODAL_EMBED_TOKEN
const _modalTimeoutSec = Number(process.env.MODAL_EMBED_TIMEOUT)
const MODAL_EMBED_TIMEOUT_MS =
  Number.isFinite(_modalTimeoutSec) && _modalTimeoutSec > 0
    ? _modalTimeoutSec * 1000
    : 90000

// α locked at 0.7 (image-dominant). Tunable per AC-010 but default frozen.
const IMG_WEIGHT = 0.7
const TXT_WEIGHT = 0.3

export interface QueryEmbedResult {
  /** 768-dim, L2-normalized. */
  embedding: number[]
  /** true => text prompt was fused in; false => image-only. */
  fused: boolean
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {"content-type": "application/json"}
  if (MODAL_EMBED_TOKEN) h.Authorization = `Bearer ${MODAL_EMBED_TOKEN}`
  return h
}

async function postEmbed(
  path: "/embed" | "/embed/text",
  body: Record<string, unknown>,
  label: string,
): Promise<number[] | null> {
  if (!MODAL_EMBED_URL) {
    logger.warn(`[v6/embed][${label}] MODAL_EMBED_URL unset → null`)
    return null
  }
  const url = `${MODAL_EMBED_URL.replace(/\/$/, "")}${path}`
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), MODAL_EMBED_TIMEOUT_MS)
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: ctl.signal,
    })
    if (!res.ok) {
      logger.warn(
        `[v6/embed][${label}] non-2xx ${res.status} — ${Date.now() - t0}ms`,
      )
      return null
    }
    const json = (await res.json()) as {embedding?: unknown}
    const emb = json.embedding
    if (!Array.isArray(emb) || emb.length === 0) {
      logger.warn(`[v6/embed][${label}] malformed response`)
      return null
    }
    return emb as number[]
  } catch (err) {
    logger.warn(
      `[v6/embed][${label}] fetch failed — ${Date.now() - t0}ms | ${(err as Error).message}`,
    )
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** L2-normalize a vector. Zero vector → returned as-is (degenerate guard). */
function l2normalize(v: number[]): number[] {
  let sum = 0
  for (const x of v) sum += x * x
  const norm = Math.sqrt(sum)
  if (norm === 0) return v
  return v.map((x) => x / norm)
}

/**
 * Build the v6 query embedding.
 *
 * @throws when the image embedding (the mandatory signal) cannot be obtained
 *   — the engine maps this to RecommendResponse.failed (route 502, AC-012).
 */
export async function buildQueryEmbedding(
  imageUrl: string,
  text?: string,
): Promise<QueryEmbedResult> {
  const trimmed = (text ?? "").trim()
  const [imgEmb, txtEmb] = await Promise.all([
    postEmbed("/embed", {image_url: imageUrl}, "image"),
    trimmed ? postEmbed("/embed/text", {text: trimmed}, "text") : Promise.resolve(null),
  ])

  if (!imgEmb) {
    throw new Error("v6 query embedding failed: Modal /embed (image) unavailable")
  }

  // Text absent or /embed/text failed → image-only (REQ-V6-015 fallback).
  if (!txtEmb || txtEmb.length !== imgEmb.length) {
    return {embedding: imgEmb, fused: false}
  }

  // normalize(0.7·img + 0.3·txt) — ratified §13 결정 3.
  const fused = imgEmb.map((x, i) => IMG_WEIGHT * x + TXT_WEIGHT * txtEmb[i])
  return {embedding: l2normalize(fused), fused: true}
}

/** PostgREST/pgvector literal form for a halfvec(768) RPC argument. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.map((x) => x.toFixed(6)).join(",")}]`
}
