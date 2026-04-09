import {NextRequest, NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {logger} from "@/lib/logger"
import type {FeedbackTagId} from "@/lib/feedback-tags"

const VALID_TAGS: FeedbackTagId[] = [
  "style_mismatch", "price_high", "product_irrelevant", "few_results",
  "category_wrong", "color_off", "brand_unfamiliar", "other",
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, analysisId, rating, tags, comment, email } = body

    // Validation
    if (!sessionId || !analysisId || !rating) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (rating !== "up" && rating !== "down") {
      return NextResponse.json({ error: "Invalid rating" }, { status: 400 })
    }

    // Tag validation
    const validatedTags = Array.isArray(tags)
      ? tags.filter((t: string) => VALID_TAGS.includes(t as FeedbackTagId))
      : []

    // Email basic validation
    const validEmail = typeof email === "string" && email.includes("@") ? email.trim() : null

    // Comment sanitization
    const validComment = typeof comment === "string" ? comment.trim().slice(0, 1000) : null

    const { data, error } = await supabase
      .from("user_feedbacks")
      .insert({
        session_id: sessionId,
        analysis_id: analysisId,
        rating,
        tags: validatedTags,
        comment: validComment,
        email: validEmail,
      })
      .select("id")
      .single()

    if (error) {
      logger.error({ error }, "❌ 피드백 저장 실패")
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 })
    }

    // 👎 피드백 시 해당 분석 자동 pin (eval 큐 우선 검토)
    if (rating === "down") {
      supabase
        .from("analyses")
        .update({ is_pinned: true })
        .eq("id", analysisId)
        .then(({ error: pinErr }) => {
          if (pinErr) logger.error({ error: pinErr }, "❌ 자동 pin 실패")
        })
    }

    logger.info(`✅ 피드백 저장 — ${rating} | 태그: ${validatedTags.join(",")} | 이메일: ${validEmail ? "있음" : "없음"}`)

    return NextResponse.json({ success: true, feedbackId: data.id })
  } catch (error) {
    logger.error({ error }, "💥 피드백 API 예외")
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
