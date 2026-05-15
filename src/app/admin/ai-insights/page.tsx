"use client"

import {useEffect, useState} from "react"
import Link from "next/link"
import {Loader2} from "lucide-react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import {cn} from "@/lib/utils"

type Resp = {
  impressions: {
    summary: {shown: number; clicked: number; ctr: number}
    daily: Array<{day: string; shown: number; clicked: number}>
    topBrands: Array<{brand: string; shown: number; clicked: number}>
    recent: Array<{
      id: number
      brand: string | null
      click_status: string | null
      shown_at: string | null
      product_uuid: string | null
      product_name: string | null
      product_image: string | null
    }>
  }
  conversation: {
    byType: Array<{event_type: string; cnt: number}>
    latency: {p50: number | null; p90: number | null; p99: number | null; max: number | null}
    users: Array<{
      user_key: string
      chat_id: number | null
      event_count: number
      thread_count: number
      first_at: string | null
      last_at: string | null
      last_message: string | null
    }>
  }
  sessions: {
    active: Array<{
      chat_id: number
      state: string | null
      user_intent: string | null
      lang: string | null
      vision_primary: string | null
      vision_secondary: string | null
      vision_gender: string | null
      vision_item: string | null
      onboard_stage: string | null
      has_selection: boolean
      has_image: boolean
      last_active: string | null
      ttl_expires_at: string | null
      ttl_seconds_left: number
      is_live: boolean
    }>
  }
}

type Tab = "impressions" | "conversation" | "sessions"

const STATUS_KO: Record<string, string> = {
  clicked: "클릭함",
  attributed_no_click: "노출 후 무클릭",
}

export default function AiInsightsPage() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("impressions")

  useEffect(() => {
    fetch("/api/admin/ai-insights")
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? "failed")
        return d as Resp
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "error"))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">AI 인사이트</h1>
        <p className="text-sm text-muted-foreground">
          대화형 봇 검색의 추천 성과 · 대화 흐름 · 세션 현황.
        </p>
      </header>

      <div className="flex gap-1 border-b text-sm">
        {([
          ["impressions", "추천 성과"],
          ["conversation", "대화 로그"],
          ["sessions", "세션"],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-3 py-2 transition",
              tab === t
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          <span className="text-sm">로딩 중…</span>
        </div>
      )}
      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {data && tab === "impressions" && <ImpressionsTab d={data.impressions} />}
      {data && tab === "conversation" && <ConversationTab d={data.conversation} />}
      {data && tab === "sessions" && <SessionsTab d={data.sessions} />}
    </div>
  )
}

function ImpressionsTab({d}: {d: Resp["impressions"]}) {
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-3 gap-3">
        <StatBox label="총 노출" value={d.summary.shown.toLocaleString()} />
        <StatBox label="클릭" value={d.summary.clicked.toLocaleString()} />
        <StatBox
          label="클릭률 (CTR)"
          value={`${(d.summary.ctr * 100).toFixed(2)}%`}
          hint={`${d.summary.clicked} / ${d.summary.shown}`}
        />
      </section>

      <ChartCard title="일자별 노출·클릭 추이">
        {d.daily.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={d.daily} margin={{top: 8, right: 16, bottom: 8, left: -8}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{fontSize: 11}} />
              <YAxis tick={{fontSize: 11}} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="shown" name="노출" stroke="#1565c0" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="clicked" name="클릭" stroke="#ef6c00" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="브랜드별 노출 Top 20" tall>
        {d.topBrands.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.topBrands} layout="vertical" margin={{top: 4, right: 16, bottom: 4, left: 90}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{fontSize: 11}} allowDecimals={false} />
              <YAxis type="category" dataKey="brand" tick={{fontSize: 11}} width={90} />
              <Tooltip />
              <Legend />
              <Bar dataKey="shown" name="노출" fill="#1565c0" />
              <Bar dataKey="clicked" name="클릭" fill="#ef6c00" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">최근 추천 노출 50건</h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {d.recent.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded border bg-card p-2"
            >
              {r.product_uuid ? (
                <Link
                  href={`/admin/products/${r.product_uuid}`}
                  target="_blank"
                  rel="noopener"
                  className="flex min-w-0 flex-1 items-center gap-3 hover:underline"
                >
                  {r.product_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.product_image}
                      alt=""
                      className="size-12 shrink-0 rounded object-cover bg-muted"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid size-12 shrink-0 place-items-center rounded bg-muted text-[9px] text-muted-foreground">
                      no img
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.product_name ?? "(상품 미상)"}</div>
                    <div className="text-xs text-muted-foreground">{r.brand ?? "—"}</div>
                  </div>
                </Link>
              ) : (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-muted-foreground">(삭제된 상품)</div>
                  <div className="text-xs text-muted-foreground">{r.brand ?? "—"}</div>
                </div>
              )}
              <div className="shrink-0 text-right">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px]",
                    r.click_status === "clicked"
                      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200"
                      : "text-muted-foreground",
                  )}
                >
                  {STATUS_KO[r.click_status ?? ""] ?? r.click_status ?? "—"}
                </span>
                <div className="mt-0.5 text-[10px] text-muted-foreground/70 tabular-nums">{r.shown_at}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

type UserEvent = {
  id: number
  thread_id: string | null
  turn_no: number | null
  event_type: string
  payload: Record<string, unknown> | null
  latency_ms: number | null
  created_at: string
}

function ConversationTab({d}: {d: Resp["conversation"]}) {
  const [openUser, setOpenUser] = useState<string | null>(null)
  const [events, setEvents] = useState<UserEvent[] | null>(null)
  const [evLoading, setEvLoading] = useState(false)

  const openConversation = (userKey: string) => {
    setOpenUser(userKey)
    setEvents(null)
    setEvLoading(true)
    fetch(`/api/admin/ai-insights/user?key=${encodeURIComponent(userKey)}`)
      .then((r) => r.json())
      .then((j) => setEvents(j.events ?? []))
      .catch(() => setEvents([]))
      .finally(() => setEvLoading(false))
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-4 gap-3">
        <StatBox label="응답 p50" value={d.latency.p50 != null ? `${d.latency.p50}ms` : "—"} />
        <StatBox label="응답 p90" value={d.latency.p90 != null ? `${d.latency.p90}ms` : "—"} />
        <StatBox label="응답 p99" value={d.latency.p99 != null ? `${d.latency.p99}ms` : "—"} />
        <StatBox label="최대" value={d.latency.max != null ? `${d.latency.max}ms` : "—"} />
      </section>

      <ChartCard title="이벤트 종류 분포">
        {d.byType.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.byType} layout="vertical" margin={{top: 4, right: 16, bottom: 4, left: 110}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{fontSize: 11}} allowDecimals={false} />
              <YAxis type="category" dataKey="event_type" tick={{fontSize: 11}} width={110} />
              <Tooltip />
              <Bar dataKey="cnt" name="횟수" fill="#0277bd" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">사용자별 대화 (클릭하면 전체 대화 보기)</h2>
        {d.users.length === 0 ? (
          <Empty />
        ) : (
          <ul className="divide-y rounded border bg-card">
            {d.users.map((u) => (
              <li key={u.user_key}>
                <button
                  type="button"
                  onClick={() => openConversation(u.user_key)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-muted/40"
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
                    {u.user_key.replace(/^u:/, "").slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium">{u.user_key}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground/70">
                        {u.thread_count}개 대화 · {u.event_count}이벤트
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {u.last_message ?? "—"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[10px] text-muted-foreground/70 tabular-nums">
                    {u.last_at}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConversationDrawer
        userKey={openUser}
        events={events}
        loading={evLoading}
        onClose={() => setOpenUser(null)}
      />
    </div>
  )
}

function ConversationDrawer({
  userKey,
  events,
  loading,
  onClose,
}: {
  userKey: string | null
  events: UserEvent[] | null
  loading: boolean
  onClose: () => void
}) {
  if (!userKey) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b bg-background px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold">
              {userKey.replace(/^u:/, "").slice(0, 2)}
            </div>
            <div>
              <div className="text-sm font-semibold">{userKey}</div>
              <div className="text-[10px] text-muted-foreground">전체 대화</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
          >
            닫기
          </button>
        </div>

        {loading && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            <span className="text-sm">대화 로딩 중…</span>
          </div>
        )}

        {events && (
          <div className="flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4">
            {events.length === 0 && (
              <div className="text-center text-sm text-muted-foreground">대화 기록 없음</div>
            )}
            {events.map((ev) => (
              <ConversationBubble key={ev.id} ev={ev} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ConversationBubble({ev}: {ev: UserEvent}) {
  const p = (ev.payload ?? {}) as Record<string, unknown>
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null)

  // 사용자 발화
  if (ev.event_type === "user_text") {
    return (
      <Bubble side="right" meta={`${ev.created_at}${p.lang_detected ? ` · ${p.lang_detected}` : ""}`}>
        {str("text") ?? "(빈 메시지)"}
      </Bubble>
    )
  }
  if (ev.event_type === "user_photo") {
    return (
      <Bubble side="right" meta={ev.created_at}>
        📷 사진 업로드
      </Bubble>
    )
  }
  if (ev.event_type === "user_callback") {
    return (
      <Bubble side="right" meta={ev.created_at} muted>
        🔘 {str("callback_data") ?? "버튼"}
      </Bubble>
    )
  }
  // 봇 발화
  if (ev.event_type === "bot_text") {
    return (
      <Bubble side="left" meta={`${ev.created_at}${ev.latency_ms != null ? ` · ${ev.latency_ms}ms` : ""}`}>
        {str("chunk_text") ?? "(봇 응답)"}
      </Bubble>
    )
  }
  // 시스템 이벤트 — 색상/아이콘으로 카테고리 구분
  const sys = (() => {
    switch (ev.event_type) {
      case "intent_routed":
        return {icon: "🧭", label: `의도 판단: ${str("intent") ?? "?"}`, tone: "blue" as const}
      case "vision_done":
        return {icon: "👁️", label: "이미지 분석 완료", tone: "green" as const}
      case "search_done":
        return {icon: "🔍", label: "검색 완료", tone: "green" as const}
      case "pick_item_done":
        return {icon: "✅", label: "아이템 선택 완료", tone: "green" as const}
      case "diversify_done":
        return {icon: "🔀", label: "다양성 확장", tone: "green" as const}
      case "card_sent":
        return {icon: "🛍️", label: "추천 카드 전송", tone: "amber" as const}
      case "card_clicked":
        return {icon: "👆", label: "추천 카드 클릭", tone: "amber" as const}
      case "taste_update":
        return {icon: "❤️", label: "취향 업데이트", tone: "purple" as const}
      case "onboard_select":
        return {icon: "📝", label: "온보딩 선택", tone: "purple" as const}
      case "pinterest_ingest":
        return {icon: "📌", label: "Pinterest 수집", tone: "purple" as const}
      case "tool_call":
        return {icon: "⚙️", label: "도구 호출", tone: "gray" as const}
      default:
        return {icon: "•", label: ev.event_type, tone: "gray" as const}
    }
  })()

  const toneCls: Record<string, string> = {
    blue: "bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200",
    green: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
    purple: "bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-200",
    gray: "bg-muted text-muted-foreground",
  }

  return (
    <div className="flex justify-center py-1">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
          toneCls[sys.tone],
        )}
      >
        <span>{sys.icon}</span>
        <span>{sys.label}</span>
        {ev.latency_ms != null && (
          <span className="opacity-60">· {ev.latency_ms}ms</span>
        )}
      </span>
    </div>
  )
}

function Bubble({
  side,
  meta,
  muted,
  children,
}: {
  side: "left" | "right"
  meta?: string
  muted?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex", side === "right" ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[80%] space-y-0.5", side === "right" ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm",
            side === "right"
              ? "bg-foreground text-background"
              : "bg-muted text-foreground",
            muted && "opacity-70",
          )}
        >
          {children}
        </div>
        {meta && (
          <div
            className={cn(
              "text-[10px] text-muted-foreground/60",
              side === "right" ? "text-right" : "text-left",
            )}
          >
            {meta}
          </div>
        )}
      </div>
    </div>
  )
}

function SessionsTab({d}: {d: Resp["sessions"]}) {
  const live = d.active.filter((s) => s.is_live)
  const stale = d.active.filter((s) => !s.is_live)

  return (
    <div className="space-y-5">
      <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-200">
        라이브 세션 모니터 — 봇이 현재 들고 있는 진행 중 세션 스냅샷. 사용자당 1개 (TTL 만료 시 사라짐).
        과거 대화 이력은 <span className="font-medium">대화 로그</span> 탭에서 확인.
      </div>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          현재 활성 세션
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
            {live.length}명
          </span>
        </h2>
        {live.length === 0 ? (
          <div className="rounded border border-dashed border-muted-foreground/30 p-8 text-center text-sm text-muted-foreground">
            지금 봇을 사용 중인 사용자 없음
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {live.map((s) => (
              <SessionCard key={s.chat_id} s={s} />
            ))}
          </ul>
        )}
      </section>

      {stale.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            만료 대기 ({stale.length}) — TTL 지났으나 아직 정리 전
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {stale.map((s) => (
              <SessionCard key={s.chat_id} s={s} expired />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function SessionCard({
  s,
  expired,
}: {
  s: Resp["sessions"]["active"][number]
  expired?: boolean
}) {
  const mins = Math.floor(s.ttl_seconds_left / 60)
  const secs = s.ttl_seconds_left % 60
  return (
    <li
      className={cn(
        "rounded-lg border bg-card p-3 space-y-2",
        expired && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-sm font-semibold">chat {s.chat_id}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
            <span className="rounded bg-foreground px-1.5 py-0.5 text-background">
              {s.state ?? "(상태 없음)"}
            </span>
            {s.lang && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{s.lang}</span>
            )}
            {s.onboard_stage && (
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-900 dark:bg-violet-900/30 dark:text-violet-200">
                온보딩: {s.onboard_stage}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right text-[11px]">
          {expired ? (
            <span className="text-rose-600 dark:text-rose-400">만료됨</span>
          ) : (
            <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
              TTL {mins}:{String(secs).padStart(2, "0")}
            </span>
          )}
        </div>
      </div>

      <dl className="space-y-1 text-[11px]">
        {s.user_intent && (
          <KV label="의도" value={s.user_intent} />
        )}
        {(s.vision_primary || s.vision_secondary) && (
          <KV
            label="Vision 노드"
            value={`${s.vision_primary ?? "—"}${s.vision_secondary ? ` / ${s.vision_secondary}` : ""}${
              s.vision_gender ? ` · ${s.vision_gender}` : ""
            }`}
          />
        )}
        {s.vision_item && <KV label="선택 아이템" value={s.vision_item} />}
        <KV
          label="진행"
          value={[
            s.has_image ? "🖼️ 이미지 보유" : null,
            s.has_selection ? "✅ 아이템 선택됨" : null,
          ]
            .filter(Boolean)
            .join(" · ") || "—"}
        />
        <KV label="마지막 활동" value={s.last_active ?? "—"} />
      </dl>
    </li>
  )
}

function KV({label, value}: {label: string; value: string}) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  )
}

function StatBox({label, value, hint}: {label: string; value: string; hint?: string}) {
  return (
    <div className="rounded border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground/70">{hint}</div>}
    </div>
  )
}

function ChartCard({title, tall, children}: {title: string; tall?: boolean; children: React.ReactNode}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className={cn("w-full rounded border bg-card p-3", tall ? "h-80" : "h-64")}>{children}</div>
    </section>
  )
}

function Empty() {
  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">데이터 없음</div>
  )
}
