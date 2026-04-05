/**
 * 상품 이미지 AI 분석 — LiteLLM 호출 + 응답 파싱 + 유효성 검증
 */

import OpenAI from "openai"
import {createHash} from "crypto"
import {PRODUCT_ANALYZE_SYSTEM, PRODUCT_ANALYZE_USER} from "../configs/analyze-prompt"
import {
  isValidCategory, isValidSubcategory, isValidFit,
  isValidFabric, isValidColorFamily,
} from "../../src/lib/enums/product-enums"
import {STYLE_NODE_IDS} from "../../src/lib/fashion-genome"

// ─── 타입 ────────────────────────────────────────────

export interface AnalysisResult {
  category: string
  subcategory: string | null
  fit: string | null
  fabric: string | null
  color_family: string | null
  color_detail: string | null
  style_node: string | null
  mood_tags: string[]
  keywords_ko: string[]
  keywords_en: string[]
  confidence: number
}

export interface AnalysisOutput {
  productId: string
  success: boolean
  result: AnalysisResult | null
  raw: unknown
  error: string | null
}

// ─── 클라이언트 ──────────────────────────────────────

let client: OpenAI
let modelName: string
let promptHash: string

export function initAnalyzer(config: {
  baseUrl: string
  apiKey: string
  model: string
}) {
  client = new OpenAI({
    baseURL: config.baseUrl + "/v1",
    apiKey: config.apiKey,
  })
  modelName = config.model
  promptHash = createHash("sha256")
    .update(PRODUCT_ANALYZE_SYSTEM)
    .digest("hex")
    .slice(0, 8)
}

export function getModelId(): string { return modelName }
export function getPromptHash(): string { return promptHash }

// ─── 분석 실행 ───────────────────────────────────────

export async function analyzeProductImage(
  productId: string,
  imageUrl: string,
): Promise<AnalysisOutput> {
  try {
    const response = await client.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: PRODUCT_ANALYZE_SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: PRODUCT_ANALYZE_USER },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.2,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { productId, success: false, result: null, raw: null, error: "empty_response" }
    }

    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return { productId, success: false, result: null, raw: cleaned, error: "json_parse_failed" }
    }

    const result = validateAndNormalize(parsed)
    return { productId, success: true, result, raw: parsed, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (message.includes("429") || message.toLowerCase().includes("rate")) {
      return { productId, success: false, result: null, raw: null, error: "rate_limited" }
    }

    return { productId, success: false, result: null, raw: null, error: message }
  }
}

// ─── 유효성 검증 + 보정 ─────────────────────────────

function validateAndNormalize(raw: Record<string, unknown>): AnalysisResult {
  const category = String(raw.category || "")
  const subcategory = raw.subcategory ? String(raw.subcategory) : null
  const fit = raw.fit ? String(raw.fit) : null
  const fabric = raw.fabric ? String(raw.fabric) : null
  const colorFamily = raw.color_family ? String(raw.color_family) : null

  return {
    category: isValidCategory(category) ? category : "Accessories",
    subcategory: subcategory && isValidSubcategory(subcategory) ? subcategory : subcategory,
    fit: fit && isValidFit(fit) ? fit : fit,
    fabric: fabric && isValidFabric(fabric) ? fabric : fabric,
    color_family: colorFamily && isValidColorFamily(colorFamily) ? colorFamily : colorFamily,
    color_detail: raw.color_detail ? String(raw.color_detail) : null,
    style_node: raw.style_node && (STYLE_NODE_IDS as readonly string[]).includes(String(raw.style_node))
      ? String(raw.style_node) : null,
    mood_tags: Array.isArray(raw.mood_tags) ? raw.mood_tags.map(String) : [],
    keywords_ko: Array.isArray(raw.keywords_ko) ? raw.keywords_ko.map(String) : [],
    keywords_en: Array.isArray(raw.keywords_en) ? raw.keywords_en.map(String) : [],
    confidence: typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : 0.5,
  }
}
