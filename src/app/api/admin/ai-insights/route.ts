import {NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {pool} from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/ai-insights
 *
 * 대화형 봇 검색 (ai 스키마) 운영 통계 — 3 영역:
 *  - impressions: 추천 카드 노출·클릭 (CTR, 추이, brand top, 최근 raw + product join)
 *  - conversation: 대화 이벤트 (event 분포, latency, 최근 turn)
 *  - sessions: 라이브 세션 모니터 (현재 활성 user_session 스냅샷, TTL 카운트다운)
 */
export async function GET() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const [
      impSummary,
      impDaily,
      impTopBrands,
      impRecent,
      convByType,
      convLatency,
      convUsers,
      sessActive,
    ] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS shown,
               COUNT(*) FILTER (WHERE click_status = 'clicked')::int AS clicked
        FROM ai.card_impression
      `),
      pool.query(`
        SELECT to_char(date_trunc('day', shown_at), 'MM-DD') AS day,
               COUNT(*)::int AS shown,
               COUNT(*) FILTER (WHERE click_status = 'clicked')::int AS clicked
        FROM ai.card_impression GROUP BY 1 ORDER BY 1
      `),
      pool.query(`
        SELECT COALESCE(brand, '(미상)') AS brand,
               COUNT(*)::int AS shown,
               COUNT(*) FILTER (WHERE click_status = 'clicked')::int AS clicked
        FROM ai.card_impression GROUP BY 1 ORDER BY shown DESC LIMIT 20
      `),
      pool.query(`
        SELECT ci.id, ci.brand, ci.click_status,
               to_char(ci.shown_at, 'MM-DD HH24:MI') AS shown_at,
               p.id AS product_uuid, p.name AS product_name,
               p.images[1] AS product_image
        FROM ai.card_impression ci
        LEFT JOIN public.products p ON p.id::text = ci.product_id
        ORDER BY ci.shown_at DESC LIMIT 50
      `),
      pool.query(`
        SELECT event_type, COUNT(*)::int AS cnt
        FROM ai.log_conversation_event GROUP BY 1 ORDER BY 2 DESC
      `),
      pool.query(`
        SELECT
          percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS p50,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY latency_ms)::int AS p90,
          percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms)::int AS p99,
          MAX(latency_ms)::int AS max
        FROM ai.log_conversation_event WHERE latency_ms IS NOT NULL
      `),
      // 사용자(user_key) 별 대화 집계 (목록 → 클릭 시 전체 대화 연속 보기)
      pool.query(`
        WITH agg AS (
          SELECT
            user_key,
            MAX(chat_id) AS chat_id,
            COUNT(*)::int AS event_count,
            COUNT(DISTINCT thread_id)::int AS thread_count,
            MIN(created_at) AS first_at,
            MAX(created_at) AS last_at
          FROM ai.log_conversation_event
          WHERE user_key IS NOT NULL
          GROUP BY user_key
        )
        SELECT
          a.user_key, a.chat_id, a.event_count, a.thread_count,
          to_char(a.first_at, 'MM-DD HH24:MI') AS first_at,
          to_char(a.last_at, 'MM-DD HH24:MI') AS last_at,
          (SELECT COALESCE(e.payload->>'text', e.payload->>'chunk_text', e.event_type)
             FROM ai.log_conversation_event e
            WHERE e.user_key = a.user_key
            ORDER BY e.created_at DESC LIMIT 1) AS last_message
        FROM agg a
        ORDER BY a.last_at DESC
        LIMIT 100
      `),
      // 라이브 세션 — user_session 은 chat_id PK (사용자당 1 row, 덮어쓰기).
      // 과거 이력 없음 (그건 log_conversation_event). 현재 활성 스냅샷만.
      pool.query(`
        SELECT chat_id, state, user_intent, lang,
               vision_outfit_style_node_primary AS vision_primary,
               vision_outfit_style_node_secondary AS vision_secondary,
               vision_outfit_gender AS vision_gender,
               vision_item,
               onboard_stage,
               (selected_item_index IS NOT NULL) AS has_selection,
               (image_url IS NOT NULL) AS has_image,
               to_char(last_active, 'MM-DD HH24:MI:SS') AS last_active,
               to_char(ttl_expires_at, 'MM-DD HH24:MI:SS') AS ttl_expires_at,
               GREATEST(0, EXTRACT(EPOCH FROM (ttl_expires_at - now()))::int) AS ttl_seconds_left,
               (ttl_expires_at > now()) AS is_live
        FROM ai.user_session
        ORDER BY last_active DESC NULLS LAST
        LIMIT 100
      `),
    ])

    const s = impSummary.rows[0] ?? {shown: 0, clicked: 0}
    return NextResponse.json({
      impressions: {
        summary: {shown: s.shown, clicked: s.clicked, ctr: s.shown > 0 ? s.clicked / s.shown : 0},
        daily: impDaily.rows,
        topBrands: impTopBrands.rows,
        recent: impRecent.rows,
      },
      conversation: {
        byType: convByType.rows,
        latency: convLatency.rows[0] ?? {p50: null, p90: null, p99: null, max: null},
        users: convUsers.rows,
      },
      sessions: {
        active: sessActive.rows,
      },
    })
  } catch (err) {
    console.error("[ai-insights] query error:", err)
    return NextResponse.json({error: "Internal server error"}, {status: 500})
  }
}
