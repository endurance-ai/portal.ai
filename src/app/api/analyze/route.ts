import {after, NextRequest, NextResponse} from "next/server"
import OpenAI from "openai"
import {supabase} from "@/lib/supabase"
import {logger} from "@/lib/logger"
import {STYLE_NODES, type StyleNodeId} from "@/lib/fashion-genome"
import {ANALYZE_SYSTEM_PROMPT, ANALYZE_USER_PROMPT} from "@/lib/prompts/analyze"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function getNodeLabel(id: string): string {
  const node = STYLE_NODES[id as StyleNodeId]
  return node ? `${id} ${node.name}` : id
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // API 접근 로그 (fire-and-forget)
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown"
    const clientUa = request.headers.get("user-agent") || "unknown"
    supabase.from("api_access_logs").insert({
      ip: clientIp,
      user_agent: clientUa,
      endpoint: "/api/analyze",
      method: "POST",
    }).then()

    const formData = await request.formData()
    const imageFile = formData.get("image") as File | null

    if (!imageFile) {
      logger.warn("⚠️ 이미지 없음 — 요청 거부")
      return NextResponse.json({ error: "No image provided" }, { status: 400 })
    }

    logger.info(
      `📸 이미지 수신 — ${imageFile.name} (${formatBytes(imageFile.size)}, ${imageFile.type})`
    )

    if (imageFile.size > MAX_FILE_SIZE) {
      logger.warn(`🚫 파일 크기 초과 — ${formatBytes(imageFile.size)} > 10MB`)
      return NextResponse.json(
        { error: "Image too large. Maximum size is 10 MB." },
        { status: 413 }
      )
    }

    if (!ALLOWED_TYPES.includes(imageFile.type)) {
      logger.warn(`🚫 지원하지 않는 형식 — ${imageFile.type}`)
      return NextResponse.json(
        { error: "Unsupported image format. Allowed: JPEG, PNG, WebP, HEIC." },
        { status: 400 }
      )
    }

    // Convert file to base64
    const bytes = await imageFile.arrayBuffer()
    const base64 = Buffer.from(bytes).toString("base64")
    const mimeType = imageFile.type || "image/jpeg"

    logger.info("🤖 GPT-4o-mini Vision 분석 시작...")
    const aiStart = Date.now()

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ANALYZE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: ANALYZE_USER_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: "auto",
              },
            },
          ],
        },
      ],
      max_tokens: 2500,
      temperature: 0.3,
    })

    const aiDuration = Date.now() - aiStart
    const usage = response.usage
    logger.info(
      `✅ AI 응답 완료 — ${aiDuration}ms | 토큰: ${usage?.prompt_tokens ?? "?"}→${usage?.completion_tokens ?? "?"} (총 ${usage?.total_tokens ?? "?"})`
    )

    const finishReason = response.choices[0]?.finish_reason
    if (finishReason === "length") {
      logger.error("AI 응답이 토큰 한도로 잘림 (finish_reason: length)")
      return NextResponse.json(
        { error: "Analysis incomplete. Please try again." },
        { status: 502 }
      )
    }

    const content = response.choices[0]?.message?.content
    if (!content) {
      logger.error("❌ AI 응답 비어있음")
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
      logger.error({ raw: cleaned.slice(0, 200) }, "❌ JSON 파싱 실패")
      return NextResponse.json(
        { error: "AI returned invalid format. Please try again." },
        { status: 502 }
      )
    }

    // ── 분석 결과 로깅 ──────────────────────────────────
    const node = analysis.styleNode
    if (node) {
      logger.info(
        `🏷️ 스타일 노드 — ${getNodeLabel(node.primary)} (${(node.primaryConfidence * 100).toFixed(0)}%) | 2순위: ${getNodeLabel(node.secondary)} (${(node.secondaryConfidence * 100).toFixed(0)}%)`
      )
      logger.info(`   💬 판단 근거: ${node.reasoning}`)
    }

    if (analysis.sensitivityTags?.length) {
      logger.info(`🎨 감도 태그 — ${analysis.sensitivityTags.join(", ")}`)
    }

    if (analysis.mood) {
      const tags = analysis.mood.tags
        ?.map((t: { label: string; score: number }) => `${t.label}(${t.score})`)
        .join(", ")
      logger.info(`🌀 무드 — ${tags}`)
      logger.info(`   ✨ ${analysis.mood.vibe}`)
    }

    if (analysis.style) {
      logger.info(
        `👤 스타일 — ${analysis.style.aesthetic} | 핏: ${analysis.style.fit} | 성별: ${analysis.style.detectedGender}`
      )
    }

    if (analysis.items?.length) {
      logger.info(`👕 아이템 ${analysis.items.length}개 감지:`)
      for (const item of analysis.items) {
        logger.info(
          `   • [${item.category}/${item.subcategory ?? "-"}] ${item.name} — ${item.colorHex ?? ""} ${item.color}, ${item.fabric}, ${item.fit}`
        )
        logger.info(`     🔍 검색: "${item.searchQuery}"`)
      }
    }

    if (analysis.palette?.length) {
      const colors = analysis.palette
        .map((c: { hex: string; label: string }) => `${c.hex} ${c.label}`)
        .join(" | ")
      logger.info(`🎨 팔레트 — ${colors}`)
    }

    // ── Supabase 저장 ───────────────────────────────────
    const analysisDuration = Date.now() - startTime
    logger.info(`💾 Supabase 저장 중...`)

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
        style_node_primary: analysis.styleNode?.primary,
        style_node_secondary: analysis.styleNode?.secondary,
        style_node_confidence: analysis.styleNode?.primaryConfidence,
        sensitivity_tags: analysis.sensitivityTags,
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
      logger.error({ error: logError }, "❌ Supabase analyses 저장 실패")
    }

    // Insert normalized items (fire-and-forget: don't block response)
    const analysisId = logRow?.id
    if (analysisId && analysis.items?.length) {
      const itemRows = analysis.items.map((item: {
        id: string; category: string; subcategory?: string; name: string; detail?: string;
        fabric?: string; color?: string; colorHex?: string; fit?: string;
        searchQuery: string; position?: { top: number; left: number }
      }, idx: number) => ({
        analysis_id: analysisId,
        item_index: idx,
        item_id: item.id,
        category: item.category,
        subcategory: item.subcategory,
        name: item.name,
        detail: item.detail,
        fabric: item.fabric,
        color: item.color,
        color_hex: item.colorHex,
        fit: item.fit,
        position_top: item.position?.top,
        position_left: item.position?.left,
        search_query_original: item.searchQuery,
      }))

      after(async () => {
        const { error: itemsError } = await supabase
          .from("analysis_items")
          .insert(itemRows)
        if (itemsError) logger.error({ error: itemsError }, "❌ Supabase analysis_items 저장 실패")
      })
    }

    if (analysisId) {
      logger.info(`✅ Supabase 저장 완료 — ID: ${analysisId}`)
    }

    logger.info(
      `🏁 분석 완료 — 총 ${analysisDuration}ms (AI: ${aiDuration}ms)`
    )

    return NextResponse.json({
      ...analysis,
      _logId: analysisId ?? null,
    })
  } catch (error: unknown) {
    logger.error({ error }, "💥 분석 중 예외 발생")
    const message =
      error instanceof Error && error.message.includes("quota")
        ? "OpenAI API quota exceeded. Please check billing."
        : "Failed to analyze image. Please try again."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
