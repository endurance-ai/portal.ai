import "server-only"
import {supabase} from "@/lib/supabase"
import {buildEnumReference} from "@/lib/enums/product-enums"
import {buildKoreanVocabReference} from "@/lib/enums/korean-vocab"
import {buildSeasonPatternReference} from "@/lib/enums/season-pattern"
import {SENSITIVITY_TAGS} from "@/lib/fashion-genome"
import {buildNodeReference, getActiveNodeCodes,} from "@/lib/style-nodes-db"

/**
 * Prompt Registry — DB-managed VLM/Text prompts.
 *
 * 옛 src/lib/prompts/{analyze,prompt-search}.ts 의 하드코딩 template 을 대체.
 * 노드 정의는 style_nodes 테이블, prompt 본문은 prompts 테이블에서 fetch.
 *
 * 캐시: 모듈 in-memory 5분 TTL + in-flight promise dedup
 *       (style-nodes-db.ts 와 동일 패턴).
 */

// ─── 타입 / 상수 ──────────────────────────────────────────────
/** TS-side enum guard for situation. DB CHECK 대체. */
export const PROMPT_SITUATIONS = [
  "vision-analyze",
  "prompt-search",
  "brand-vlm",
] as const
export type PromptSituation = (typeof PROMPT_SITUATIONS)[number]

/** Prompt 본문 길이 상한 — admin 입력 DoS 방어 + cache 메모리 가드. */
export const MAX_PROMPT_BODY_LEN = 50_000

/** 허용 model_id — admin 임의 모델 지정 방지. 추가 시 본 목록 확장. */
export const ALLOWED_MODEL_IDS: readonly string[] = [
  "gpt-4o-mini",
  "gpt-4o",
  "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "us.amazon.nova-lite-v1:0",
  "us.amazon.nova-pro-v1:0",
]

export type PromptRow = {
  id: number
  situation: PromptSituation
  version: string
  is_active: boolean
  system_md: string
  user_md: string
  placeholders: Record<string, PlaceholderSpec>
  model_id: string | null
  max_tokens: number
  temperature: number
}

type PlaceholderSpec =
  | {source: "style_nodes"; field: "buildNodeReference" | "codes_csv"}
  | {source: "static"; field: "SENSITIVITY_TAGS"}
  | {source: "enums"; field: "buildEnumReference" | "buildSeasonPatternReference" | "buildKoreanVocabReference"}
  | {source: "runtime"}

export type BuiltPrompt = {
  system: string
  user: string
  model_id: string | null
  max_tokens: number
  temperature: number
}

// ─── In-memory cache ─────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000
const promptCache = new Map<
  PromptSituation,
  {data: PromptRow; at: number}
>()
const promptInflight = new Map<PromptSituation, Promise<PromptRow>>()

function nowMs(): number {
  return Date.now()
}

/** Situation 별 active prompt fetch. cache + in-flight dedup. */
export async function fetchActivePrompt(
  situation: PromptSituation,
): Promise<PromptRow> {
  const cached = promptCache.get(situation)
  if (cached && nowMs() - cached.at < CACHE_TTL_MS) {
    return cached.data
  }
  const inflight = promptInflight.get(situation)
  if (inflight) return inflight

  const fetchPromise = (async () => {
    try {
      const {data, error} = await supabase
        .from("prompts")
        .select(
          "id, situation, version, is_active, system_md, user_md, placeholders, model_id, max_tokens, temperature",
        )
        .eq("situation", situation)
        .eq("is_active", true)
        .maybeSingle()
      if (error) {
        throw new Error(`fetchActivePrompt(${situation}) failed: ${error.message}`)
      }
      if (!data) {
        throw new Error(`fetchActivePrompt: no active prompt for situation '${situation}'`)
      }
      const row = data as PromptRow
      promptCache.set(situation, {data: row, at: nowMs()})
      return row
    } finally {
      promptInflight.delete(situation)
    }
  })()
  promptInflight.set(situation, fetchPromise)
  return fetchPromise
}

// ─── Placeholder resolution ──────────────────────────────────
/** Placeholder 1개의 값을 resolve. runtime 은 caller 가 채움. */
async function resolvePlaceholder(
  token: string,
  spec: PlaceholderSpec,
  runtimeVars: Record<string, string>,
): Promise<string> {
  switch (spec.source) {
    case "style_nodes":
      switch (spec.field) {
        case "buildNodeReference":
          return buildNodeReference()
        case "codes_csv": {
          const codes = await getActiveNodeCodes()
          return codes.join(", ")
        }
      }
      throw new Error(`unknown style_nodes field for token '${token}'`)
    case "static":
      switch (spec.field) {
        case "SENSITIVITY_TAGS":
          return SENSITIVITY_TAGS.join(", ")
      }
      throw new Error(`unknown static field for token '${token}'`)
    case "enums":
      switch (spec.field) {
        case "buildEnumReference":
          return buildEnumReference()
        case "buildSeasonPatternReference":
          return buildSeasonPatternReference()
        case "buildKoreanVocabReference":
          return buildKoreanVocabReference()
      }
      throw new Error(`unknown enums field for token '${token}'`)
    case "runtime": {
      const v = runtimeVars[token]
      if (v === undefined) {
        throw new Error(`runtime placeholder '${token}' not provided by caller`)
      }
      // Prompt injection 방어 — 사용자 입력이 system prompt 의 구조 (XML tag, placeholder marker) 를 흉내내지 못하도록 escape.
      return escapeRuntimeValue(v)
    }
  }
  throw new Error(
    `unhandled placeholder for token '${token}': ${JSON.stringify(spec)}`,
  )
}

/**
 * Runtime 사용자 입력 escape. 다음 패턴 무력화:
 * - `<` `>` `&` HTML/XML 특수문자 → entity 로 변환 (system prompt 의 <user_request> 태그 구조 깨지 못 함)
 * - `{{` 더블 brace → 의미 없는 시퀀스로 변환 (placeholder 재진입 방지)
 */
function escapeRuntimeValue(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{\{/g, "{ {")
}

/** 본문 안의 {{TOKEN}} 을 모두 치환. */
function applyTemplate(body: string, values: Map<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, token) => {
    const v = values.get(token)
    if (v === undefined) {
      // 정의되지 않은 placeholder 는 원본 유지 (디버그용)
      return `{{${token}}}`
    }
    return v
  })
}

/** Public API — situation + runtime vars → 완성된 prompt 객체. */
export async function buildPrompt(
  situation: PromptSituation,
  runtimeVars: Record<string, string> = {},
): Promise<BuiltPrompt> {
  const row = await fetchActivePrompt(situation)
  const resolved = new Map<string, string>()
  await Promise.all(
    Object.entries(row.placeholders ?? {}).map(async ([token, spec]) => {
      const value = await resolvePlaceholder(token, spec, runtimeVars)
      resolved.set(token, value)
    }),
  )
  return {
    system: applyTemplate(row.system_md, resolved),
    user: applyTemplate(row.user_md, resolved),
    model_id: row.model_id,
    max_tokens: row.max_tokens,
    temperature: row.temperature,
  }
}

/** admin 수정 후 즉시 반영을 위한 cache invalidate. */
export function invalidatePromptCache(situation?: PromptSituation): void {
  if (situation) {
    promptCache.delete(situation)
  } else {
    promptCache.clear()
  }
}
