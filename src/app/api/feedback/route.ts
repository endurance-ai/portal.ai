import {NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { analysisId, rating, tags, comment, email } = body

    if (!rating || !["up", "down"].includes(rating)) {
      return NextResponse.json({ error: "Invalid rating" }, { status: 400 })
    }

    // analysisId로 session_id 조회
    let sessionId: string | null = null
    if (analysisId) {
      const { data: analysis } = await supabase
        .from("analyses")
        .select("session_id")
        .eq("id", analysisId)
        .single()
      sessionId = analysis?.session_id ?? null
    }

    const { data, error } = await supabase
      .from("user_feedbacks")
      .insert({
        session_id: sessionId,
        analysis_id: analysisId || null,
        rating,
        tags: Array.isArray(tags) ? tags : [],
        comment: comment || null,
        email: email || null,
      })
      .select("id")
      .single()

    if (error) {
      console.error("[feedback] insert error:", error)
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 })
    }

    // 부정 피드백 → 분석 자동 핀
    if (rating === "down" && analysisId) {
      await supabase
        .from("analyses")
        .update({ is_pinned: true })
        .eq("id", analysisId)
    }

    return NextResponse.json({ id: data.id })
  } catch (e) {
    console.error("[feedback] error:", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
