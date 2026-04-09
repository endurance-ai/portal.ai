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
    const {feedbackId, sessionId, analysisId, rating, tags, comment, email} = body

    // ── Update existing feedback (tags, comment, email) ──
    if (feedbackId) {
      const updates: Record<string, unknown> = {}

      if (Array.isArray(tags)) {
        updates.tags = tags.filter((t: string) => VALID_TAGS.includes(t as FeedbackTagId))
      }
      if (typeof comment === "string" && comment.trim()) {
        updates.comment = comment.trim().slice(0, 1000)
      }
      if (typeof email === "string" && email.includes("@")) {
        updates.email = email.trim()
      }

      if (Object.keys(updates).length > 0) {
        const {error} = await supabase
          .from("user_feedbacks")
          .update(updates)
          .eq("id", feedbackId)

        if (error) {
          logger.error({error}, "❌ 피드백 업데이트 실패")
          return NextResponse.json({error: "Failed to update feedback"}, {status: 500})
        }

        logger.info(`✅ 피드백 업데이트 — ${feedbackId} | keys: ${Object.keys(updates).join(",")}`)
      }

      return NextResponse.json({success: true, feedbackId})
    }

    // ── Create new feedback (thumbs) ──
    if (!sessionId || !analysisId || !rating) {
      return NextResponse.json({error: "Missing required fields"}, {status: 400})
    }

    if (rating !== "up" && rating !== "down") {
      return NextResponse.json({error: "Invalid rating"}, {status: 400})
    }

    const {data, error} = await supabase
      .from("user_feedbacks")
      .insert({
        session_id: sessionId,
        analysis_id: analysisId,
        rating,
        tags: [],
      })
      .select("id")
      .single()

    if (error) {
      logger.error({error}, "❌ 피드백 저장 실패")
      return NextResponse.json({error: "Failed to save feedback"}, {status: 500})
    }

    // 👎 피드백 시 해당 분석 자동 pin (eval 큐 우선 검토)
    if (rating === "down") {
      supabase
        .from("analyses")
        .update({is_pinned: true})
        .eq("id", analysisId)
        .then(({error: pinErr}) => {
          if (pinErr) logger.error({error: pinErr}, "❌ 자동 pin 실패")
        })
    }

    logger.info(`✅ 피드백 생성 — ${rating} | id: ${data.id}`)

    return NextResponse.json({success: true, feedbackId: data.id})
  } catch (error) {
    logger.error({error}, "💥 피드백 API 예외")
    return NextResponse.json({error: "Internal error"}, {status: 500})
  }
}
