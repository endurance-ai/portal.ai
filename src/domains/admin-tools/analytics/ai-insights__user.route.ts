import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {pool} from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/ai-insights/user?key=<user_key>
 *
 * 한 사용자의 전체 대화 이벤트 (모든 thread 합쳐서 시간순).
 * 어드민이 텔레그램 채팅처럼 그 사람과 봇의 전체 대화를 재생.
 */
export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const userKey = request.nextUrl.searchParams.get("key")
  if (!userKey) return NextResponse.json({error: "missing key"}, {status: 400})

  try {
    // payload 는 프론트가 쓰는 키만 추출 (data minimization — ai-server 가
    // payload 에 민감 필드 추가해도 자동 노출 안 되게).
    const {rows} = await pool.query(
      `SELECT id, thread_id, turn_no, event_type, latency_ms,
              to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
              jsonb_build_object(
                'text',          payload->>'text',
                'chunk_text',    payload->>'chunk_text',
                'callback_data', payload->>'callback_data',
                'intent',        payload->>'intent',
                'lang_detected', payload->>'lang_detected'
              ) AS payload
       FROM ai.log_conversation_event
       WHERE user_key = $1
       ORDER BY created_at ASC, id ASC
       LIMIT 1000`,
      [userKey],
    )
    return NextResponse.json({user_key: userKey, events: rows})
  } catch (err) {
    console.error("[ai-insights/user] query error:", err)
    return NextResponse.json({error: "Internal server error"}, {status: 500})
  }
}
