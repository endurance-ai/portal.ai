import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

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
      "searchQuery": "oversized relaxed fit grey wool blend long coat men"
    },
    {
      "id": "top",
      "category": "Top",
      "name": "Boxy Graphic Tee",
      "detail": "Crew neck, boxy cut, front graphic print",
      "fabric": "Cotton jersey",
      "color": "Black",
      "fit": "Boxy / Relaxed",
      "searchQuery": "boxy oversized black graphic print cotton tee men"
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
  try {
    const formData = await request.formData()
    const imageFile = formData.get("image") as File | null

    if (!imageFile) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 })
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
      max_tokens: 1000,
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

    return NextResponse.json(analysis)
  } catch (error: unknown) {
    console.error("Analysis error:", error)
    const message =
      error instanceof Error && error.message.includes("quota")
        ? "OpenAI API quota exceeded. Please check billing."
        : "Failed to analyze image. Please try again."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
