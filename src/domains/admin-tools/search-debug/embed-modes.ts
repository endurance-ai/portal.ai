import "server-only"
import {logger} from "@/lib/logger"

// 어드민 검색 디버거 전용 임베딩 헬퍼.
// production query-embed.ts 와 분리한 이유:
//  - production 은 image 필수 + text 선택 융합만 지원 (REQ-V6-015 fallback)
//  - 디버거는 image-only / text-only / both 3-모드를 명시적으로 비교
//  - latency / norm / dim / model 등 trace 메타를 그대로 반환

const MODAL_EMBED_URL = process.env.MODAL_EMBED_URL
const MODAL_EMBED_TOKEN = process.env.MODAL_EMBED_TOKEN
const _timeoutSec = Number(process.env.MODAL_EMBED_TIMEOUT)
const TIMEOUT_MS =
  Number.isFinite(_timeoutSec) && _timeoutSec > 0 ? _timeoutSec * 1000 : 90000

const IMG_WEIGHT = 0.7
const TXT_WEIGHT = 0.3

export type EmbedMode = "image" | "text" | "fused"

export interface ModalEmbedTrace {
  path: "/embed" | "/embed/text"
  latency_ms: number
  ok: boolean
  status?: number
  model?: string
  dim?: number
  norm?: number
  error?: string
}

export interface BuildResult {
  ok: boolean
  mode: EmbedMode
  embedding?: number[]
  fused: boolean
  traces: ModalEmbedTrace[]
  total_latency_ms: number
  final_norm?: number
  error?: string
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {"content-type": "application/json"}
  if (MODAL_EMBED_TOKEN) h.Authorization = `Bearer ${MODAL_EMBED_TOKEN}`
  return h
}

function l2norm(v: number[]): number {
  let sum = 0
  for (const x of v) sum += x * x
  return Math.sqrt(sum)
}

function normalize(v: number[]): number[] {
  const n = l2norm(v)
  if (n === 0) return v
  return v.map((x) => x / n)
}

async function postEmbed(
  path: "/embed" | "/embed/text",
  body: Record<string, unknown>,
): Promise<ModalEmbedTrace & {embedding?: number[]}> {
  const t0 = Date.now()
  if (!MODAL_EMBED_URL) {
    return {path, latency_ms: 0, ok: false, error: "MODAL_EMBED_URL unset"}
  }
  const url = `${MODAL_EMBED_URL.replace(/\/$/, "")}${path}`
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: ctl.signal,
    })
    const latency = Date.now() - t0
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        path,
        latency_ms: latency,
        ok: false,
        status: res.status,
        error: text.slice(0, 200) || `HTTP ${res.status}`,
      }
    }
    const json = (await res.json()) as {
      embedding?: number[]
      dim?: number
      model?: string
    }
    if (!Array.isArray(json.embedding) || json.embedding.length === 0) {
      return {path, latency_ms: latency, ok: false, error: "malformed response"}
    }
    return {
      path,
      latency_ms: latency,
      ok: true,
      status: res.status,
      model: json.model,
      dim: json.dim ?? json.embedding.length,
      norm: l2norm(json.embedding),
      embedding: json.embedding,
    }
  } catch (err) {
    return {
      path,
      latency_ms: Date.now() - t0,
      ok: false,
      error: (err as Error).message,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function buildDebugEmbedding(opts: {
  imageUrl?: string
  text?: string
  mode: EmbedMode
}): Promise<BuildResult> {
  const t0 = Date.now()
  const traces: ModalEmbedTrace[] = []
  const trimmed = (opts.text ?? "").trim()
  const imageUrl = opts.imageUrl?.trim()

  try {
    if (opts.mode === "image") {
      if (!imageUrl) {
        return {
          ok: false,
          mode: opts.mode,
          fused: false,
          traces,
          total_latency_ms: 0,
          error: "image mode requires imageUrl",
        }
      }
      const r = await postEmbed("/embed", {image_url: imageUrl})
      traces.push(stripEmbedding(r))
      if (!r.ok || !r.embedding) {
        return {
          ok: false,
          mode: opts.mode,
          fused: false,
          traces,
          total_latency_ms: Date.now() - t0,
          error: r.error,
        }
      }
      return {
        ok: true,
        mode: opts.mode,
        embedding: r.embedding,
        fused: false,
        traces,
        total_latency_ms: Date.now() - t0,
        final_norm: l2norm(r.embedding),
      }
    }

    if (opts.mode === "text") {
      if (!trimmed) {
        return {
          ok: false,
          mode: opts.mode,
          fused: false,
          traces,
          total_latency_ms: 0,
          error: "text mode requires non-empty text",
        }
      }
      const r = await postEmbed("/embed/text", {text: trimmed})
      traces.push(stripEmbedding(r))
      if (!r.ok || !r.embedding) {
        return {
          ok: false,
          mode: opts.mode,
          fused: false,
          traces,
          total_latency_ms: Date.now() - t0,
          error: r.error,
        }
      }
      return {
        ok: true,
        mode: opts.mode,
        embedding: r.embedding,
        fused: false,
        traces,
        total_latency_ms: Date.now() - t0,
        final_norm: l2norm(r.embedding),
      }
    }

    // mode === "fused"
    if (!imageUrl || !trimmed) {
      return {
        ok: false,
        mode: opts.mode,
        fused: false,
        traces,
        total_latency_ms: 0,
        error: "fused mode requires both imageUrl and text",
      }
    }
    const [imgR, txtR] = await Promise.all([
      postEmbed("/embed", {image_url: imageUrl}),
      postEmbed("/embed/text", {text: trimmed}),
    ])
    traces.push(stripEmbedding(imgR), stripEmbedding(txtR))
    if (!imgR.ok || !imgR.embedding) {
      return {
        ok: false,
        mode: opts.mode,
        fused: false,
        traces,
        total_latency_ms: Date.now() - t0,
        error: `image embed failed: ${imgR.error}`,
      }
    }
    if (!txtR.ok || !txtR.embedding || txtR.embedding.length !== imgR.embedding.length) {
      // text 실패 시 image-only fallback (production behavior 와 동일)
      return {
        ok: true,
        mode: opts.mode,
        embedding: imgR.embedding,
        fused: false,
        traces,
        total_latency_ms: Date.now() - t0,
        final_norm: l2norm(imgR.embedding),
        error: `text failed → image-only fallback: ${txtR.error}`,
      }
    }
    const combined = imgR.embedding.map(
      (x, i) => IMG_WEIGHT * x + TXT_WEIGHT * txtR.embedding![i]
    )
    const normalized = normalize(combined)
    return {
      ok: true,
      mode: opts.mode,
      embedding: normalized,
      fused: true,
      traces,
      total_latency_ms: Date.now() - t0,
      final_norm: l2norm(normalized),
    }
  } catch (err) {
    logger.error(`[v6-debug] buildDebugEmbedding crashed: ${(err as Error).message}`)
    return {
      ok: false,
      mode: opts.mode,
      fused: false,
      traces,
      total_latency_ms: Date.now() - t0,
      error: (err as Error).message,
    }
  }
}

function stripEmbedding(t: ModalEmbedTrace & {embedding?: number[]}): ModalEmbedTrace {
  const {embedding: _emb, ...rest} = t
  void _emb
  return rest
}

export function toVectorLiteral(v: number[]): string {
  return `[${v.map((x) => x.toFixed(6)).join(",")}]`
}
