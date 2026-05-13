import "server-only"
import {supabase} from "@/lib/supabase"

/**
 * Style Node — DB-managed taxonomy.
 *
 * 옛 src/lib/fashion-genome.ts 의 STYLE_NODES 상수를 대체.
 * 노드 정의는 style_nodes 테이블에서 fetch.
 * Adjacency 는 style_node_adjacency 테이블 (SPEC-BRAND-EMBED-001 가 채움).
 *
 * 캐시: 모듈 in-memory 5분 TTL + in-flight promise dedup.
 * admin 에서 노드 변경 후 최대 5분 후 반영 (invalidate 시 즉시).
 */

export type StyleNode = {
  id: number
  code: string
  name_en: string
  name_ko: string
  mood: string | null
  include_rule: string | null
  exclude_rule: string | null
  keywords_en: string[]
  keywords_ko: string[]
  is_active: boolean
}

export type AdjacencyEdge = {
  from_code: string
  to_code: string
  weight: number
  source: "embedding_derived" | "manual"
}

// ─── In-memory cache (with in-flight promise dedup) ─────────
const CACHE_TTL_MS = 5 * 60 * 1000
const SAFE_FIELD_MAX_LEN = 600
let nodesCache: {data: StyleNode[]; at: number} | null = null
let adjacencyCache: {data: AdjacencyEdge[]; at: number} | null = null
let nodesInflight: Promise<StyleNode[]> | null = null
let adjacencyInflight: Promise<AdjacencyEdge[]> | null = null

function nowMs(): number {
  return Date.now()
}

/** 활성 노드 전부 fetch. 5분 cache + in-flight dedup. */
export async function fetchActiveStyleNodes(): Promise<StyleNode[]> {
  if (nodesCache && nowMs() - nodesCache.at < CACHE_TTL_MS) {
    return nodesCache.data
  }
  if (nodesInflight) return nodesInflight
  nodesInflight = (async () => {
    try {
      const {data, error} = await supabase
        .from("style_nodes")
        .select(
          "id, code, name_en, name_ko, mood, include_rule, exclude_rule, keywords_en, keywords_ko, is_active",
        )
        .eq("is_active", true)
        .order("code")
      if (error) {
        throw new Error(`fetchActiveStyleNodes failed: ${error.message}`)
      }
      nodesCache = {data: (data as StyleNode[]) ?? [], at: nowMs()}
      return nodesCache.data
    } finally {
      nodesInflight = null
    }
  })()
  return nodesInflight
}

/** 활성 노드 code 배열. */
export async function getActiveNodeCodes(): Promise<string[]> {
  const nodes = await fetchActiveStyleNodes()
  return nodes.map((n) => n.code)
}

/** code → node lookup. */
export async function getStyleNodeByCode(
  code: string,
): Promise<StyleNode | null> {
  const nodes = await fetchActiveStyleNodes()
  return nodes.find((n) => n.code === code) ?? null
}

/** Adjacency 전부 fetch (code 기반). 5분 cache + in-flight dedup. */
export async function fetchAdjacencyEdges(): Promise<AdjacencyEdge[]> {
  if (adjacencyCache && nowMs() - adjacencyCache.at < CACHE_TTL_MS) {
    return adjacencyCache.data
  }
  if (adjacencyInflight) return adjacencyInflight
  adjacencyInflight = (async () => {
    try {
      const nodes = await fetchActiveStyleNodes()
      const codeById = new Map(nodes.map((n) => [n.id, n.code]))
      const {data, error} = await supabase
        .from("style_node_adjacency")
        .select("weight, source, from_id, to_id")
      if (error) {
        throw new Error(`fetchAdjacencyEdges failed: ${error.message}`)
      }
      type RawAdjacencyRow = {
        from_id: number
        to_id: number
        weight: number | string
        source: AdjacencyEdge["source"]
      }
      const edges: AdjacencyEdge[] = ((data ?? []) as RawAdjacencyRow[])
        .map((row) => {
          const fromCode = codeById.get(row.from_id)
          const toCode = codeById.get(row.to_id)
          if (!fromCode || !toCode) return null
          return {
            from_code: fromCode,
            to_code: toCode,
            weight: Number(row.weight),
            source: row.source,
          }
        })
        .filter((e): e is AdjacencyEdge => e !== null)
      adjacencyCache = {data: edges, at: nowMs()}
      return edges
    } finally {
      adjacencyInflight = null
    }
  })()
  return adjacencyInflight
}

/** code A 에 대해 threshold 이상으로 인접한 code 목록 (자기 자신 제외). */
export async function getAdjacentCodes(
  code: string,
  threshold = 0.7,
): Promise<{code: string; weight: number}[]> {
  const edges = await fetchAdjacencyEdges()
  return edges
    .filter((e) => e.from_code === code && e.weight >= threshold)
    .map((e) => ({code: e.to_code, weight: e.weight}))
    .sort((a, b) => b.weight - a.weight)
}

/** code A ↔ code B 의 인접도. row 없으면 0. */
export async function getStyleSimilarityFromDb(
  a: string,
  b: string,
): Promise<number> {
  if (a === b) return 1.0
  const edges = await fetchAdjacencyEdges()
  const e = edges.find((x) => x.from_code === a && x.to_code === b)
  return e ? e.weight : 0
}

/**
 * Sanitize admin-editable text 필드를 VLM prompt 안에 안전히 박기 위해:
 * - 줄바꿈/탭 → 공백 (prompt 구조 깨짐 방지)
 * - 길이 상한 (token 폭주 + prompt-injection 표면 줄임)
 */
function sanitizePromptField(value: string | null | undefined): string {
  if (!value) return ""
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, SAFE_FIELD_MAX_LEN)
}

/** VLM prompt 에 주입할 노드 reference 텍스트 생성. admin 입력은 sanitize. */
export async function buildNodeReference(): Promise<string> {
  const nodes = await fetchActiveStyleNodes()
  return nodes
    .map((n) => {
      const mood = sanitizePromptField(n.mood)
      const include = sanitizePromptField(n.include_rule)
      const exclude = sanitizePromptField(n.exclude_rule)
      const keywords = n.keywords_en
        .map((k) => k.replace(/[\r\n\t,]+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 20)
        .join(", ")
      return [
        `[${n.code}] ${n.name_en}`,
        mood && `  Mood: ${mood}`,
        include && `  Include when: ${include}`,
        exclude && `  Exclude when: ${exclude}`,
        keywords && `  Keywords: ${keywords}`,
      ]
        .filter(Boolean)
        .join("\n")
    })
    .join("\n\n")
}

/** 캐시 명시적 invalidate. admin 노드 수정 후 호출. */
export function invalidateStyleNodesCache(): void {
  nodesCache = null
  adjacencyCache = null
}
