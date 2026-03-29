import {NextRequest, NextResponse} from "next/server"
import OpenAI from "openai"
import {supabase} from "@/lib/supabase"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const SYSTEM_PROMPT = `You are MOODFIT, an expert AI fashion analyst with deep knowledge of brands, fabrics, and silhouettes.
Given an outfit photo, analyze every visible clothing item and the overall mood.

Respond in this exact JSON format (no markdown, no code fences):
{
  "mood": {
    "tags": [
      {"label": "Street", "score": 92},
      {"label": "Minimal", "score": 78}
    ],
    "summary": "A confident street-minimal hybrid with muted earth tones.",
    "vibe": "Effortless urban cool — layered neutrals with an architectural edge.",
    "season": "Fall/Winter",
    "occasion": "Casual daily, gallery visit, coffee date"
  },
  "palette": [
    {"hex": "#2E3336", "label": "Charcoal"},
    {"hex": "#767B7F", "label": "Slate"}
  ],
  "style": {
    "fit": "Oversized & Relaxed",
    "aesthetic": "Street Minimal",
    "gender": "Unisex / Masculine-leaning",
    "detectedGender": "male"
  },
  "items": [
    {
      "id": "outer",
      "category": "Outer",
      "name": "Oversized Wool Coat",
      "detail": "Dropped shoulder, mid-thigh length, single-breasted",
      "fabric": "Wool blend",
      "color": "Charcoal grey",
      "fit": "Oversized",
      "searchQuery": "oversized relaxed fit grey wool blend long coat men",
      "position": {"top": 30, "left": 50}
    },
    {
      "id": "top",
      "category": "Top",
      "name": "Boxy Graphic Tee",
      "detail": "Crew neck, boxy cut, front graphic print",
      "fabric": "Cotton jersey",
      "color": "Black",
      "fit": "Boxy / Relaxed",
      "searchQuery": "boxy oversized black graphic print cotton tee men",
      "position": {"top": 42, "left": 48}
    }
  ]
}

Rules:
- Extract 2-5 mood tags with confidence scores (0-100)
- Extract 3-5 dominant colors as hex codes with descriptive labels
- Identify each visible clothing item (outer, top, bottom, shoes, accessories)
- summary: 1-2 sentences, editorial tone, English only
- vibe: one evocative line describing the overall feeling
- season: appropriate season(s) for this look
- occasion: 2-3 suitable occasions
- style: overall fit tendency, aesthetic label, gender expression
- style.detectedGender: MUST be one of "male", "female", or "unisex". Determine based on the person in the photo (body shape, styling cues). Only use "unisex" if genuinely ambiguous. This is critical for product search accuracy.
- Per item: detail (silhouette/construction), fabric, color, fit
- Per item position: estimate where the CENTER of this garment appears in the image as percentage coordinates. This is CRITICAL for the UI — a dot will be placed on the image at these exact coordinates.
  - top: 0 = very top edge of image, 100 = very bottom edge
  - left: 0 = very left edge of image, 100 = very right edge
  - Look at where the garment is ACTUALLY visible in this specific photo, not where it would be on a generic body
  - Consider whether the person is centered, offset, cropped, or in a specific pose
  - If the person is not centered (e.g., shifted left or right), adjust left% accordingly
  - Typical ranges for a full-body centered shot: hat 5-12%, face/neck area 12-20%, top/shirt chest area 28-40%, waist/belt 42-50%, bottom/pants thigh area 50-65%, bottom/pants knee area 65-75%, shoes 82-95%
  - For accessories: bags/watches go where they actually appear in the image
  - left% should reflect the actual horizontal position of the garment center in the image (usually 45-55% for centered photos, but adjust based on pose and framing)
- Be specific about silhouette, fabric, and fit in item names

searchQuery rules (CRITICAL for accurate product matching):
- MUST include: fit (oversized/slim/relaxed/cropped/regular), color (specific: "charcoal grey" not just "grey"), fabric/material (wool/cotton/denim/leather/corduroy/nylon), garment type
- MUST include gender keyword: use "men" / "women" / "unisex" based on detectedGender. This prevents cross-gender results.
- SHOULD include: length (long/cropped/midi), style detail (pleated/ribbed/distressed/raw hem)
- Format: "[fit] [color] [material] [garment type] [men/women]"
- Example good: "relaxed fit washed indigo wide leg raw hem denim jeans men"
- Example bad: "blue jeans"
- Think like someone searching on Google Shopping for this exact item
- Return valid JSON only`

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const formData = await request.formData()
    const imageFile = formData.get("image") as File | null

    if (!imageFile) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 })
    }

    // File size validation (10 MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024
    if (imageFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Image too large. Maximum size is 10 MB." },
        { status: 413 }
      )
    }

    // MIME type validation
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"]
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: "Unsupported image format. Allowed: JPEG, PNG, WebP, HEIC." },
        { status: 400 }
      )
    }

    // Convert file to base64
    const bytes = await imageFile.arrayBuffer()
    const base64 = Buffer.from(bytes).toString("base64")
    const mimeType = imageFile.type || "image/jpeg"

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this outfit photo. Identify all visible clothing items and the overall style mood.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      )
    }

    // Parse JSON response — strip markdown fences if present
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    let analysis
    try {
      analysis = JSON.parse(cleaned)
    } catch {
      console.error("JSON parse failed:", cleaned)
      return NextResponse.json(
        { error: "AI returned invalid format. Please try again." },
        { status: 502 }
      )
    }

    const analysisDuration = Date.now() - startTime

    // Log to Supabase (non-blocking)
    const { data: logRow, error: logError } = await supabase
      .from("analyses")
      .insert({
        image_filename: imageFile.name,
        image_size_bytes: imageFile.size,
        ai_raw_response: analysis,
        mood_tags: analysis.mood?.tags,
        mood_summary: analysis.mood?.summary,
        mood_vibe: analysis.mood?.vibe,
        palette: analysis.palette,
        style_fit: analysis.style?.fit,
        style_aesthetic: analysis.style?.aesthetic,
        detected_gender: analysis.style?.detectedGender,
        items: analysis.items,
        search_queries: analysis.items?.map((item: { id: string; searchQuery: string }) => ({
          id: item.id,
          query: item.searchQuery,
        })),
        analysis_duration_ms: analysisDuration,
      })
      .select("id")
      .single()

    if (logError) {
      console.error("Supabase log insert error:", logError)
    }

    // Insert normalized items
    const analysisId = logRow?.id
    if (analysisId && analysis.items?.length) {
      const itemRows = analysis.items.map((item: {
        id: string; category: string; name: string; detail?: string;
        fabric?: string; color?: string; fit?: string;
        searchQuery: string; position?: { top: number; left: number }
      }, idx: number) => ({
        analysis_id: analysisId,
        item_index: idx,
        item_id: item.id,
        category: item.category,
        name: item.name,
        detail: item.detail,
        fabric: item.fabric,
        color: item.color,
        fit: item.fit,
        position_top: item.position?.top,
        position_left: item.position?.left,
        search_query_original: item.searchQuery,
      }))

      const { error: itemsError } = await supabase
        .from("analysis_items")
        .insert(itemRows)

      if (itemsError) {
        console.error("Supabase items insert error:", itemsError)
      }
    }

    // Return analysis + log ID for later search result update
    return NextResponse.json({
      ...analysis,
      _logId: analysisId ?? null,
    })
  } catch (error: unknown) {
    console.error("Analysis error:", error)
    const message =
      error instanceof Error && error.message.includes("quota")
        ? "OpenAI API quota exceeded. Please check billing."
        : "Failed to analyze image. Please try again."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
