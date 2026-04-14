import {NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {FEEDBACK_TAGS} from "@/lib/feedback-tags"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_COMMENT = 2000
const MAX_EMAIL = 254
const VALID_TAG_IDS: Set<string> = new Set(FEEDBACK_TAGS.map((t) => t.id))

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {analysisId, rating, tags, comment, email} = body

    // rating 검증
    if (!rating || !["up", "down"].includes(rating)) {
      return NextResponse.json({error: "Invalid rating"}, {status: 400})
    }

    // analysisId UUID 검증
    if (!analysisId || typeof analysisId !== "string" || !UUID_RE.test(analysisId)) {
      return NextResponse.json({error: "Valid analysis ID required"}, {status: 400})
    }

    // 입력 길이 제한 + 이메일 형식 검증
    const safeComment = typeof comment === "string" ? comment.trim().slice(0, MAX_COMMENT) : null
    const safeEmail = typeof email === "string" && email.trim().length > 0
      ? email.trim().toLowerCase().slice(0, MAX_EMAIL)
      : null
    if (safeEmail && !EMAIL_RE.test(safeEmail)) {
      return NextResponse.json({error: "Invalid email format"}, {status: 400})
    }

    // 태그 allowlist 검증
    const safeTags = Array.isArray(tags)
      ? tags.filter((t): t is string => typeof t === "string" && VALID_TAG_IDS.has(t))
      : []

    // session_id 조회
    const {data: analysis} = await supabase
      .from("analyses")
      .select("session_id")
      .eq("id", analysisId)
      .single()

    const sessionId = analysis?.session_id ?? null
    if (!sessionId) {
      return NextResponse.json({error: "Analysis session not found"}, {status: 400})
    }

    const {data, error} = await supabase
      .from("user_feedbacks")
      .insert({
        session_id: sessionId,
        analysis_id: analysisId,
        rating,
        tags: safeTags,
        comment: safeComment,
        email: safeEmail,
      })
      .select("id")
      .single()

    if (error) {
      console.error("[feedback] insert error:", error.code, error.message)
      return NextResponse.json({error: "Failed to save feedback"}, {status: 500})
    }

    // 부정 피드백 → 분석 자동 핀
    if (rating === "down") {
      await supabase
        .from("analyses")
        .update({is_pinned: true})
        .eq("id", analysisId)
    }

    return NextResponse.json({id: data.id})
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    console.error("[feedback] error:", msg)
    return NextResponse.json({error: "Internal error"}, {status: 500})
  }
}
