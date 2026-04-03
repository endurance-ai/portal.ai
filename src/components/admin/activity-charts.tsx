"use client"

import { useEffect, useState } from "react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"

interface AnalysisRecord {
  created_at: string
  style_node_primary: string | null
  detected_gender: string | null
}

interface AccessLog {
  id: string
  ip: string | null
  user_agent: string | null
  endpoint: string | null
  method: string | null
  status_code: number | null
  duration_ms: number | null
  analysis_id: string | null
  created_at: string
}

const PIE_COLORS = ["#ffffff", "#a1a1aa", "#52525b", "#3f3f46"]

const tooltipStyle = {
  backgroundColor: "#18181b",
  border: "1px solid #27272a",
  borderRadius: "6px",
  color: "#fafafa",
  fontSize: "12px",
}

function aggregateDaily(analyses: AnalysisRecord[]) {
  const counts: Record<string, number> = {}
  for (const a of analyses) {
    const day = a.created_at.slice(0, 10)
    counts[day] = (counts[day] || 0) + 1
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      date: date.slice(5), // "MM-DD"
      count,
    }))
}

function aggregateGender(analyses: AnalysisRecord[]) {
  const counts: Record<string, number> = {}
  for (const a of analyses) {
    const g = a.detected_gender || "unknown"
    counts[g] = (counts[g] || 0) + 1
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value }))
}

function aggregateNodes(analyses: AnalysisRecord[]) {
  const counts: Record<string, number> = {}
  for (const a of analyses) {
    const node = a.style_node_primary || "unknown"
    counts[node] = (counts[node] || 0) + 1
  }
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }))
}

export function ActivityCharts() {
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([])
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/analytics?tab=activity")
        if (res.ok) {
          const data = await res.json()
          setAnalyses(data.analyses || [])
          setAccessLogs(data.accessLogs || [])
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const dailyData = aggregateDaily(analyses)
  const genderData = aggregateGender(analyses)
  const nodeData = aggregateNodes(analyses)
  const recentLogs = accessLogs.slice(0, 20)

  return (
    <div className="space-y-8">
      {/* Daily analyses */}
      <section>
        <h3 className="text-sm font-medium mb-3">Daily Analyses (Last 30 Days)</h3>
        {dailyData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet</p>
        ) : (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  axisLine={{ stroke: "#27272a" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  axisLine={{ stroke: "#27272a" }}
                  tickLine={false}
                  width={30}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#27272a" }} />
                <Bar dataKey="count" fill="#ffffff" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Gender + Node distribution */}
      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h3 className="text-sm font-medium mb-3">Gender Distribution</h3>
          {genderData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet</p>
          ) : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={genderData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) =>
                      `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {genderData.map((entry, i) => (
                      <Cell
                        key={`gender-${entry.name}`}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-medium mb-3">Node Distribution (Top 15)</h3>
          {nodeData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet</p>
          ) : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={nodeData} layout="vertical">
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fill: "#a1a1aa", fontSize: 11 }}
                    axisLine={{ stroke: "#27272a" }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#a1a1aa", fontSize: 10 }}
                    axisLine={{ stroke: "#27272a" }}
                    tickLine={false}
                    width={100}
                  />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#27272a" }} />
                  <Bar dataKey="count" fill="#a1a1aa" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Recent API access logs */}
      <section>
        <h3 className="text-sm font-medium mb-3">Recent API Calls</h3>
        {recentLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No access logs available</p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="hidden sm:table-cell">Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Duration</TableHead>
                  <TableHead className="hidden md:table-cell">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })}
                    </TableCell>
                    <TableCell className="text-xs font-mono max-w-[200px] truncate">
                      {log.endpoint || "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary" className="text-[10px]">
                        {log.method || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          log.status_code && log.status_code < 400
                            ? "outline"
                            : "destructive"
                        }
                        className="text-[10px]"
                      >
                        {log.status_code || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {log.duration_ms != null ? `${log.duration_ms}ms` : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground font-mono">
                      {log.ip || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
