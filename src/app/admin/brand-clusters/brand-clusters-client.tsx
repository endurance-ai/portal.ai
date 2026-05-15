"use client"

import {useMemo, useState} from "react"
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"

export type BrandPoint = {
  brand_id: number
  brand_name: string
  primary_style_node_id: number | null
  secondary_style_node_id: number | null
  x: number
  y: number
}

export type NodeLabel = {
  id: number
  code: string
  name_en: string
}

// 카테고리 색상 팔레트 (20 node 대응). HSL 균등 분포.
const PALETTE: string[] = Array.from({length: 20}, (_, i) =>
  `hsl(${(i * 360) / 20}, 65%, 55%)`,
)

function colorForNodeId(nodes: NodeLabel[], nodeId: number | null): string {
  if (nodeId == null) return "#9ca3af"
  const idx = nodes.findIndex((n) => n.id === nodeId)
  return idx >= 0 ? PALETTE[idx % PALETTE.length] : "#9ca3af"
}

export function BrandClustersClient({
  points,
  nodes,
}: {
  points: BrandPoint[]
  nodes: NodeLabel[]
}) {
  const [hoverId, setHoverId] = useState<number | null>(null)

  const series = useMemo(() => {
    // primary_style_node_id 별로 grouped scatter
    const groups = new Map<number | null, BrandPoint[]>()
    for (const p of points) {
      const key = p.primary_style_node_id
      const arr = groups.get(key) ?? []
      arr.push(p)
      groups.set(key, arr)
    }
    return Array.from(groups.entries()).map(([nodeId, items]) => {
      const node = nodes.find((n) => n.id === nodeId)
      return {
        name: node ? `${node.code} ${node.name_en}` : "(미분류)",
        color: colorForNodeId(nodes, nodeId),
        data: items,
      }
    })
  }, [points, nodes])

  if (points.length === 0) {
    return (
      <div className="rounded border border-dashed border-muted-foreground/30 p-8 text-center text-sm text-muted-foreground">
        brand_multimodal_umap 데이터 없음. scripts/build_brand_umap.py 실행 필요.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="h-[560px] w-full rounded border bg-white p-2">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{top: 16, right: 16, bottom: 16, left: 16}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" dataKey="x" hide />
            <YAxis type="number" dataKey="y" hide />
            <ZAxis type="number" range={[60, 60]} />
            <Tooltip
              cursor={{strokeDasharray: "3 3"}}
              content={({active, payload}) => {
                if (!active || !payload || payload.length === 0) return null
                const d = payload[0].payload as BrandPoint
                const primary = nodes.find((n) => n.id === d.primary_style_node_id)
                const secondary = nodes.find((n) => n.id === d.secondary_style_node_id)
                return (
                  <div className="rounded border bg-white px-3 py-2 text-xs shadow">
                    <div className="font-semibold">{d.brand_name}</div>
                    <div className="text-muted-foreground">
                      primary: {primary ? `${primary.code} ${primary.name_en}` : "—"}
                    </div>
                    <div className="text-muted-foreground">
                      secondary: {secondary ? `${secondary.code} ${secondary.name_en}` : "—"}
                    </div>
                  </div>
                )
              }}
            />
            <Legend />
            {series.map((s) => (
              <Scatter
                key={s.name}
                name={s.name}
                data={s.data}
                fill={s.color}
                onMouseEnter={(p) => {
                  const item = (p as {payload?: BrandPoint} | undefined)?.payload
                  setHoverId(item?.brand_id ?? null)
                }}
                onMouseLeave={() => setHoverId(null)}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">brand list ({points.length})</summary>
        <table className="mt-2 w-full text-left">
          <thead className="border-b">
            <tr>
              <th className="py-1 pr-2">brand</th>
              <th className="py-1 pr-2">primary</th>
              <th className="py-1 pr-2">x</th>
              <th className="py-1 pr-2">y</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => {
              const primary = nodes.find((n) => n.id === p.primary_style_node_id)
              return (
                <tr
                  key={p.brand_id}
                  className={hoverId === p.brand_id ? "bg-amber-50" : ""}
                >
                  <td className="py-1 pr-2 font-medium text-foreground">{p.brand_name}</td>
                  <td className="py-1 pr-2">{primary?.code ?? "—"}</td>
                  <td className="py-1 pr-2">{p.x.toFixed(3)}</td>
                  <td className="py-1 pr-2">{p.y.toFixed(3)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>
    </div>
  )
}
