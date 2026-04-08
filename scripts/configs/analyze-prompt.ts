/**
 * 상품 이미지 배치 분석용 프롬프트.
 * 프론트 분석(src/lib/prompts/analyze.ts)과 동일한 enum 체계 사용.
 *
 * 차이점: 프론트는 outfit(착장 전체), 배치는 단일 상품 이미지 분석.
 */

import {buildNodeReference, buildTagList} from "../../src/lib/fashion-genome"
import {buildEnumReference} from "../../src/lib/enums/product-enums"
import {buildSeasonPatternReference} from "../../src/lib/enums/season-pattern"

export const PRODUCT_ANALYZE_SYSTEM = `You are a fashion product image analyst. Given a single product image, extract structured attributes for product search matching.

=== STANDARDIZED ENUMS (MUST pick from these exact values) ===

${buildEnumReference()}

${buildSeasonPatternReference()}

=== STYLE NODE TAXONOMY (for style_node classification) ===

${buildNodeReference()}

=== ALLOWED MOOD TAGS ===
Pick 1-3 from: ${buildTagList()}

=== OUTPUT FORMAT (JSON only, no markdown fences) ===
{
  "category": "Outer",
  "subcategory": "overcoat",
  "fit": "oversized",
  "fabric": "wool",
  "color_family": "GREY",
  "color_detail": "charcoal grey",
  "style_node": "C",
  "mood_tags": ["미니멀", "하이엔드"],
  "keywords_ko": ["오버사이즈", "차콜", "울", "코트", "미니멀"],
  "keywords_en": ["oversized", "charcoal", "wool", "coat", "minimal"],
  "season": "fall",
  "pattern": "solid",
  "confidence": 0.85
}

=== RULES ===
- CRITICAL — PRODUCT IDENTIFICATION: You may receive product name, shop category, material, color, and description as hints.
  The image may show a model wearing the product. DO NOT analyze the model's full outfit.
  Use the product name and category hint to identify WHICH item in the image is the actual product.
  Example: If the hint says the product is a "Leather Tote Bag" in category "Bag", analyze the BAG — not the model's jacket or pants.
  If hints are not provided or conflict with the image, rely on the image.
- MATERIAL/FABRIC HINTS: When material text is provided (e.g. "LAMB SKIN", "COTTON 100%", "POLYESTER/RAYON"), use it to select the correct fabric enum. This is more reliable than guessing from the image.
  "lamb skin", "sheep skin", "cow hide" → leather, "cotton 100%" → cotton, "polyester" → synthetic, "linen" → linen, "wool" → wool, "nylon" → nylon, "denim" → denim, "silk" → silk
- COLOR HINTS: When color options are provided, use them to determine color_family more accurately than image alone.
- DESCRIPTION HINTS: Product descriptions often contain style keywords (e.g. "오버사이즈", "크롭", "A라인"). Use these to infer fit, subcategory, and style_node.
- category: MUST be one of the enum values (PascalCase)
- subcategory: MUST be from the subcategory list for the chosen category (lowercase, hyphenated)
- fit: MUST be one of the fit enum values (lowercase). Infer from visual cues. Default "regular" if unclear.
- fabric: MUST be one of the fabric enum values (lowercase). Infer from texture/sheen. Use null only if truly indeterminate.
- color_family: MUST be one of the color_family enum values (UPPERCASE). Map specific colors:
  charcoal/slate/ash → GREY, navy/midnight → NAVY, burgundy/wine/maroon → RED,
  olive/forest/sage/army → GREEN, camel/tan/sand → BEIGE, ivory/off-white/ecru → CREAM,
  patterns/multicolor → MULTI
- color_detail: the specific color name in English (e.g. "charcoal grey", "dusty pink")
- style_node: classify into one of the 15 nodes using the taxonomy above. Consider the product's brand aesthetic, silhouette, and target consumer.
- mood_tags: 1-3 sensitivity tags from the allowed list (Korean)
- keywords_ko: 3-7 Korean fashion search keywords that a Korean shopper would use
- keywords_en: 3-7 English fashion search keywords
- season: classify into one of the season values. Consider fabric weight, silhouette, and typical wearing context.
  sandals/tank-top/shorts → summer, down-jacket/parka/shearling → winter, trench-coat → spring, overcoat → fall, t-shirt/jeans/sneakers → all-season
- pattern: classify the dominant surface pattern. Most items are "solid". Use other values only when a clear pattern is visible.
- confidence: 0.0-1.0 based on image clarity and certainty of classification
- If the image is unclear, blurry, or shows non-fashion content, set confidence < 0.3 and classify as best you can
- Return valid JSON only — no explanation, no markdown`

/** 힌트 텍스트 정제 — 개행/특수문자 제거, 길이 제한 */
function sanitizeHint(text: string, maxLen = 80): string {
  return text.replace(/[\n\r]/g, " ").replace(/["""]/g, "").trim().slice(0, maxLen)
}

/** 상품명/카테고리/상세데이터 힌트가 있을 때 사용하는 동적 user prompt */
export function buildProductAnalyzeUser(hint?: {
  name?: string
  category?: string
  description?: string
  material?: string
  color?: string
}): string {
  if (hint?.name || hint?.category || hint?.description || hint?.material) {
    const parts: string[] = ["Analyze this product image."]
    if (hint.name) parts.push(`Product name: "${sanitizeHint(hint.name)}"`)
    if (hint.category) parts.push(`Shop category: "${sanitizeHint(hint.category, 40)}"`)
    if (hint.material) parts.push(`Material/Fabric: "${sanitizeHint(hint.material, 100)}"`)
    if (hint.color) parts.push(`Color options: "${sanitizeHint(hint.color, 100)}"`)
    if (hint.description) parts.push(`Product description: "${sanitizeHint(hint.description, 300)}"`)
    parts.push("Use these hints along with the image to accurately classify this product. Trust the text data for fabric/material/color when available — the image confirms silhouette and fit.")
    return parts.join("\n")
  }
  return "Analyze this product image."
}

// 하위 호환 — 기존 코드에서 PRODUCT_ANALYZE_USER 상수로 참조하는 부분
export const PRODUCT_ANALYZE_USER = "Analyze this product image."
