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
    const {rows} = await pool.query(
      `SELECT id, thread_id, turn_no, event_type, payload, latency_ms,
              to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
       FROM ai.log_conversation_event
       WHERE user_key = $1
       ORDER BY created_at ASC, id ASC
       LIMIT 1000`,
      [userKey],
    )
    return NextResponse.json({user_key: userKey, events: rows})
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({error: message}, {status: 500})
  }
}
