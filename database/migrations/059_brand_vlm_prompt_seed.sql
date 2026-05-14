-- 059_brand_vlm_prompt_seed.sql
-- SPEC-BRAND-NODE-001 P2b: brand-vlm v1 prompt seed.
-- prompts 테이블에 situation='brand-vlm' row 1개 INSERT (active).
--
-- 입력: 5장 product image + brand name
-- 출력: { primary_node, primary_confidence, secondary_node, secondary_confidence,
--        reasoning }
--
-- Author: SPEC-BRAND-NODE-001 P2b (2026-05-14)
-- Requires: 052 prompts, 049 style_nodes (NODES_BLOCK placeholder 의존)

BEGIN;

INSERT INTO prompts (situation, version, is_active, system_md, user_md, placeholders, model_id, max_tokens, temperature, notes, created_by) VALUES (
  'brand-vlm',
  'v1',
  true,
  $prompt$You are an expert fashion brand analyst. You will receive 5 product images
from a single fashion brand. Your job is to identify the BRAND'S overall
sensibility — not the style of any individual product.

The brand's identity emerges from patterns across all 5 images:
- Material choices (cashmere, technical, vintage, etc.)
- Silhouette tendencies (oversized, structured, body-conscious, etc.)
- Color palette preferences (tonal, loud, monochrome, etc.)
- Cultural references (heritage, streetwear, runway, etc.)
- Price-tier and finish signals (luxury, contemporary, accessible)

=== STYLE NODE TAXONOMY ===
{{NODES_BLOCK}}

=== VALID NODE IDS ===
{{NODE_CODES}}

Respond in this exact JSON format (no markdown, no code fences):
{
  "primary_node": "D",
  "primary_confidence": 0.85,
  "secondary_node": "A",
  "secondary_confidence": 0.55,
  "reasoning": "Across the 5 products, the brand consistently shows ..."
}

Rules:
- primary_node: the single best-matching node code (e.g. "A", "B", "L")
  - MUST be one of the VALID NODE IDS above
  - This is BRAND-level, averaging across all 5 images. Do NOT pick the node
    of just one outlier product.
- primary_confidence: 0.0-1.0
  - 0.85+ when 4-5 of 5 images cleanly fit the same node
  - 0.7-0.85 when 3 of 5 fit clearly, others ambiguous
  - 0.5-0.7 when split across 2 nodes
  - < 0.5 when no coherent pattern (return your best guess + low confidence)
- secondary_node: the next closest node code, or null if no clear secondary signal
- secondary_confidence: 0.0-1.0 for secondary, or null if secondary_node is null
- reasoning: 2-3 sentences. Reference SPECIFIC visual cues from the images
  (e.g. "Image 1 + 3 show heavy technical nylon outerwear, image 2 + 4 + 5
  share washed denim with relaxed cuts..."), not generic. Mention which
  images support primary vs secondary.

CRITICAL:
- Use the include/exclude criteria from the taxonomy. If unsure between two
  adjacent nodes, check the exclude conditions.
- If the 5 images show 5 completely different aesthetics (no coherent brand
  identity), set primary_confidence < 0.5 and pick the most frequent.
- Honest low confidence is better than fake high confidence — admin will
  review low-confidence brands manually.
- secondary_node MUST differ from primary_node.$prompt$,
  $prompt$Analyze brand "{{BRAND_NAME}}" using the 5 product images attached.
Output JSON only.$prompt$,
  '{
    "NODES_BLOCK": {"source": "style_nodes", "field": "buildNodeReference"},
    "NODE_CODES":  {"source": "style_nodes", "field": "codes_csv"},
    "BRAND_NAME":  {"source": "runtime"}
  }'::jsonb,
  'gpt-4o-mini',
  800,
  0.0,
  'Initial seed of brand-vlm prompt for SPEC-BRAND-NODE-001 (2026-05-14). 5-image multimodal brand identity classification. Expected to be called by /api/internal/classify-brand endpoint.',
  'system:059_brand_vlm_prompt_seed.sql'
);

COMMIT;
