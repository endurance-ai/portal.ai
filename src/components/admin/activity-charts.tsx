"use client"

import { useEffect, useState } from "react"
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts"
import { Loader2 } from "lucide-react"

interface AnalysisRecord {
  created_at: string
  style_node_primary: string | null
  detected_gender: string | null
  analysis_duration_ms: number | null
  search_duration_ms: number | null
  image_filename: string | null
  items: unknown[] | null
}

interface SearchQualityRecord {
  category: string | null
  subcategory: string | null
  result_count: number | null
  top_score: number | null
  avg_score: number | null
  is_empty: boolean | null
  created_at: string
}

// ── Palette ─────────────────────────────────────────
const TURQUOISE     = "#55B4A8"
const TURQUOISE_DIM = "#3D9B8F"
const ZINC_400  = "#a1a1aa"
const ZINC_600  = "#52525b"
const ZINC_700  = "#3f3f46"
const ZINC_800  = "#27272a"

const tooltipStyle = {
  backgroundColor: "#18181b",
  border: `1px solid ${ZINC_800}`,
  borderRadius: "6px",
  color: "#fafafa",
  fontSize: "12px",
}

// ── Aggregators ──────────────────────────────────────
function buildDailyData(analyses: AnalysisRecord[], days: number) {
  const map = new Map<string, number>()
  for (const a of analyses) {
    const key = a.created_at.slice(0, 10)
    map.set(key, (map.get(key) || 0) + 1)
  }
  const result = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    const key = d.toISOString().slice(0, 10)
    result.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      count: map.get(key) || 0,
    })
  }
  return result
}

function buildHourlyData(analyses: AnalysisRecord[]) {
  const counts = Array(24).fill(0)
  for (const a of analyses) {
    const h = new Date(a.created_at).getUTCHours()
    counts[h]++
  }
  return counts.map((count, hour) => ({
    hour: `${String(hour).padStart(2, "0")}시`,
    count,
  }))
}

function buildGenderData(analyses: AnalysisRecord[]) {
  const counts: Record<string, number> = {}
  for (const a of analyses) {
    const g = a.detected_gender || "unknown"
    counts[g] = (counts[g] || 0) + 1
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value }))
}

function buildTypeData(analyses: AnalysisRecord[]) {
  let image = 0, text = 0
  for (const a of analyses) {
    if (a.image_filename) image++; else text++
  }
  return [
    { name: "이미지", value: image },
    { name: "텍스트", value: text },
  ]
}

function buildNodeData(analyses: AnalysisRecord[]) {
  const counts: Record<string, number> = {}
  for (const a of analyses) {
    const n = a.style_node_primary || "미분류"
    counts[n] = (counts[n] || 0) + 1
  }
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))
}

function buildDurationData(analyses: AnalysisRecord[]) {
  const buckets = [
    { label: "~2s",  min: 0,     max: 2000  },
    { label: "2-5s", min: 2000,  max: 5000  },
    { label: "5-10s",min: 5000,  max: 10000 },
    { label: "10-20s",min:10000, max: 20000 },
    { label: "20s+", min: 20000, max: Infinity },
  ].map(b => ({ ...b, ai: 0, search: 0 }))

  for (const a of analyses) {
    const ai = a.analysis_duration_ms || 0
    const sr = a.search_duration_ms || 0
    const b = buckets.find(x => ai >= x.min && ai < x.max)
    if (b) b.ai++
    const bs = buckets.find(x => sr >= x.min && sr < x.max)
    if (bs) bs.search++
  }
  return buckets.map(({ label, ai, search }) => ({ label, ai, search }))
}

// ── Search quality aggregators ───────────────────────
function buildHitRate(sq: SearchQualityRecord[]) {
  if (sq.length === 0) return { hitRate: 0, avgScore: 0, total: 0 }
  const hits = sq.filter(s => !s.is_empty).length
  const scores = sq.filter(s => s.avg_score != null).map(s => s.avg_score!)
  return {
    hitRate: Math.round((hits / sq.length) * 100),
    avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    total: sq.length,
  }
}

function buildEmptyByCategory(sq: SearchQualityRecord[]) {
  const cats: Record<string, { total: number; empty: number }> = {}
  for (const s of sq) {
    const cat = s.category || "미분류"
    if (!cats[cat]) cats[cat] = { total: 0, empty: 0 }
    cats[cat].total++
    if (s.is_empty) cats[cat].empty++
  }
  return Object.entries(cats)
    .map(([name, { total, empty }]) => ({
      name,
      emptyRate: Math.round((empty / total) * 100),
      total,
    }))
    .sort((a, b) => b.emptyRate - a.emptyRate)
    .slice(0, 8)
}

// ── Section wrapper ──────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// ── Donut legend (below chart) ───────────────────────
function Legend({ data, colors }: { data: { name: string; value: number }[]; colors: string[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
      {data.map((d, i) => (
        <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block size-2.5 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
          {d.name}
          <span className="tabular-nums font-medium text-foreground">
            {total > 0 ? Math.round((d.value / total) * 100) : 0}%
          </span>
          <span className="opacity-50">({d.value})</span>
        </span>
      ))}
    </div>
  )
}

export function ActivityCharts({ days = 30 }: { days?: number }) {
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([])
  const [searchQuality, setSearchQuality] = useState<SearchQualityRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/admin/analytics?tab=activity&days=${days}`)
        const data = r.ok ? await r.json() : null
        if (!cancelled && data) {
          setAnalyses(data.analyses || [])
          setSearchQuality(data.searchQuality || [])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [days])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (analyses.length === 0) {
    return <p className="text-sm text-muted-foreground py-12 text-center">데이터가 없습니다</p>
  }

  const daily    = buildDailyData(analyses, days)
  const hourly   = buildHourlyData(analyses)
  const gender   = buildGenderData(analyses)
  const type     = buildTypeData(analyses)
  const nodes    = buildNodeData(analyses)
  const duration = buildDurationData(analyses)

  // Search quality
  const sqStats    = buildHitRate(searchQuality)
  const sqByCat    = buildEmptyByCategory(searchQuality)

  const GENDER_COLORS = [TURQUOISE, ZINC_400, ZINC_600]
  const TYPE_COLORS   = [TURQUOISE, ZINC_400]

  return (
    <div className="space-y-4">

      {/* Row 1 — Daily trend */}
      <Section title="일별 분석 추이" subtitle={`최근 ${days}일`}>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="turquoiseFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={TURQUOISE} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={TURQUOISE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: ZINC_400, fontSize: 10 }}
                axisLine={{ stroke: ZINC_800 }}
                tickLine={false}
                interval={4}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: ZINC_400, fontSize: 10 }}
                axisLine={{ stroke: ZINC_800 }}
                tickLine={false}
                width={28}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: ZINC_700 }} />
              <Area
                type="monotone"
                dataKey="count"
                name="분석 수"
                stroke={TURQUOISE}
                strokeWidth={2}
                fill="url(#turquoiseFill)"
                dot={false}
                activeDot={{ r: 4, fill: TURQUOISE }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* Row 2 — 3 columns */}
      <div className="grid gap-4 md:grid-cols-3">

        {/* Hourly */}
        <Section title="시간대별 분석" subtitle="0~23시">
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis
                  dataKey="hour"
                  tick={{ fill: ZINC_400, fontSize: 9 }}
                  axisLine={{ stroke: ZINC_800 }}
                  tickLine={false}
                  interval={5}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: ZINC_400, fontSize: 10 }}
                  axisLine={{ stroke: ZINC_800 }}
                  tickLine={false}
                  width={24}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: ZINC_800 }} />
                <Bar dataKey="count" name="분석 수" fill={TURQUOISE} radius={[2, 2, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* Gender donut */}
        <Section title="성별 분포" subtitle={`총 ${analyses.length}건`}>
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={gender}
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={58}
                  dataKey="value"
                  nameKey="name"
                  labelLine={false}
                >
                  {gender.map((d, i) => (
                    <Cell key={d.name} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <Legend data={gender} colors={GENDER_COLORS} />
        </Section>

        {/* Type donut */}
        <Section title="분석 유형" subtitle="이미지 / 텍스트">
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={type}
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={58}
                  dataKey="value"
                  nameKey="name"
                  labelLine={false}
                >
                  {type.map((d, i) => (
                    <Cell key={d.name} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <Legend data={type} colors={TYPE_COLORS} />
        </Section>
      </div>

      {/* Row 3 — 2 columns */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Style nodes */}
        <Section title="스타일 노드 Top 10" subtitle="최근 30일 기준">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={nodes} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: ZINC_400, fontSize: 10 }}
                  axisLine={{ stroke: ZINC_800 }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: ZINC_400, fontSize: 10 }}
                  axisLine={{ stroke: ZINC_800 }}
                  tickLine={false}
                  width={80}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: ZINC_800 }} />
                <Bar dataKey="count" name="분석 수" radius={[0, 3, 3, 0]}>
                  {nodes.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === 0 ? TURQUOISE : i === 1 ? TURQUOISE_DIM : i <= 3 ? ZINC_400 : ZINC_600}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* Duration histogram */}
        <Section title="소요시간 분포" subtitle="AI 분석 · 검색">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={duration} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: ZINC_400, fontSize: 11 }}
                  axisLine={{ stroke: ZINC_800 }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: ZINC_400, fontSize: 10 }}
                  axisLine={{ stroke: ZINC_800 }}
                  tickLine={false}
                  width={28}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: ZINC_800 }} />
                <Bar dataKey="ai"     name="AI 분석"  fill={TURQUOISE} radius={[2, 2, 0, 0]} opacity={0.9} />
                <Bar dataKey="search" name="검색"     fill={ZINC_400}  radius={[2, 2, 0, 0]} opacity={0.75} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 pt-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: TURQUOISE }} />
              AI 분석
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: ZINC_400 }} />
              검색
            </span>
          </div>
        </Section>
      </div>

      {/* Row 4 — Search quality */}
      {searchQuality.length > 0 && (
        <div className="grid gap-4 md:grid-cols-[1fr_2fr]">

          {/* Hit rate stats */}
          <Section title="검색 품질" subtitle={`${sqStats.total}건 쿼리 기준`}>
            <div className="space-y-4 pt-1">
              <div>
                <p className="text-xs text-muted-foreground">적중률</p>
                <div className="flex items-end gap-2 mt-1">
                  <span className="text-3xl font-bold tabular-nums text-turquoise">{sqStats.hitRate}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-turquoise transition-all" style={{ width: `${sqStats.hitRate}%` }} />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">평균 매칭 스코어</p>
                <span className="text-2xl font-bold tabular-nums">{sqStats.avgScore.toFixed(3)}</span>
              </div>
            </div>
          </Section>

          {/* Empty rate by category */}
          <Section title="카테고리별 빈 결과율" subtitle="상위 8개">
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sqByCat} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fill: ZINC_400, fontSize: 10 }}
                    axisLine={{ stroke: ZINC_800 }}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: ZINC_400, fontSize: 10 }}
                    axisLine={{ stroke: ZINC_800 }}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: ZINC_800 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, _name: any, entry: any) =>
                      [`${value}% (${entry.payload.total}건)`, "빈 결과율"]
                    }
                  />
                  <Bar dataKey="emptyRate" name="빈 결과율" fill={ZINC_600} radius={[0, 3, 3, 0]}>
                    {sqByCat.map((d, i) => (
                      <Cell key={i} fill={d.emptyRate > 50 ? "#ef4444" : d.emptyRate > 25 ? ZINC_400 : TURQUOISE_DIM} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}
