"use client"

import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import {BrandClusterDetailPanel, type BrandDetail} from "./brand-cluster-detail-panel"

export type BrandPoint = {
  brand_id: number
  brand_name: string
  primary_style_node_id: number | null
  secondary_style_node_id: number | null
  cluster_id: number | null
  x: number   // legacy — radar 에서는 안 씀
  y: number
}

export type NodeLabel = {
  id: number
  code: string
  name_en: string
}

type ViewBox = {x: number; y: number; w: number; h: number}

// ─── SVG Pan/Zoom ─────────────────────────────────
function useSvgPanZoom(initial: ViewBox) {
  const [vb, setVb] = useState<ViewBox>(initial)
  // callback ref — SVG 마운트/언마운트 마다 useEffect 재실행 트리거
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null)
  const dragRef = useRef<{cx: number; cy: number} | null>(null)
  const movedRef = useRef(0)
  const initialKey = `${initial.x},${initial.y},${initial.w},${initial.h}`

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setVb(initial) }, [initialKey])

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    dragRef.current = {cx: e.clientX, cy: e.clientY}
    movedRef.current = 0
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current || !svgEl) return
    const rect = svgEl.getBoundingClientRect()
    const dx = e.clientX - dragRef.current.cx
    const dy = e.clientY - dragRef.current.cy
    movedRef.current += Math.abs(dx) + Math.abs(dy)
    setVb((v) => {
      const sx = v.w / rect.width
      const sy = v.h / rect.height
      return {...v, x: v.x - dx * sx, y: v.y - dy * sy}
    })
    dragRef.current = {cx: e.clientX, cy: e.clientY}
  }, [svgEl])

  const wasDragging = useCallback(() => movedRef.current > 4, [])

  useEffect(() => {
    const onUp = () => {
      dragRef.current = null
    }
    window.addEventListener("mouseup", onUp)
    return () => window.removeEventListener("mouseup", onUp)
  }, [])

  // wheel zoom — svgEl 이 mount 된 후에 attach (dep 에 svgEl 포함이 핵심 fix)
  useEffect(() => {
    if (!svgEl) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = svgEl.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width
      const py = (e.clientY - rect.top) / rect.height
      const factor = e.deltaY < 0 ? 0.8 : 1.25
      setVb((v) => {
        const newW = Math.max(initial.w * 0.05, Math.min(initial.w * 10, v.w * factor))
        const newH = newW * (v.h / v.w)
        const cx = v.x + px * v.w
        const cy = v.y + py * v.h
        return {x: cx - px * newW, y: cy - py * newH, w: newW, h: newH}
      })
    }
    svgEl.addEventListener("wheel", onWheel, {passive: false})
    return () => svgEl.removeEventListener("wheel", onWheel)
  }, [svgEl, initial.w])

  const reset = useCallback(() => setVb(initial), [initial])

  return {svgRef: setSvgEl, viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`, onMouseDown, onMouseMove, wasDragging, reset, vb, setVb}
}

// ─── Radar layout (cosine top-N) ──────────────────
// 거리 스케일 확장 — top brand (sim~0.85) ≈ radius 18 / 가장 멀리 ≈ radius 60
type RadarNode = {
  id: number
  name: string
  primary_style_node_id: number | null
  x: number
  y: number
  r: number
  sim: number
  role: "center" | "neighbor"
  rank: number
}

function computeRadar(
  centerId: number,
  centerName: string,
  centerNodeId: number | null,
  similar: BrandDetail["similar"],
): RadarNode[] {
  const out: RadarNode[] = [{
    id: centerId,
    name: centerName,
    primary_style_node_id: centerNodeId,
    x: 0,
    y: 0,
    r: 5.5,
    sim: 1,
    role: "center",
    rank: 0,
  }]
  const n = similar.length
  for (let i = 0; i < n; i++) {
    const s = similar[i]
    // similarity 1.0 → 12 / 0.85 → 23 / 0.5 → 67  (충분히 펼침)
    const radius = 12 + (1 - Math.max(0, Math.min(1, s.similarity))) * 110
    const baseAngle = (i / n) * 2 * Math.PI - Math.PI / 2
    const jitter = (i % 2 === 0 ? -1 : 1) * 0.06
    const angle = baseAngle + jitter
    out.push({
      id: s.brand_id,
      name: s.brand_name,
      primary_style_node_id: s.primary_style_node_id,
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      r: 3.6 - i * 0.15,
      sim: s.similarity,
      role: "neighbor",
      rank: i + 1,
    })
  }
  return out
}

// 충분히 펼친 기본 viewBox
const DEFAULT_VB: ViewBox = {x: -85, y: -85, w: 170, h: 170}

// ─── Pastel palette by style node ─────────────────
// HSL: hue golden-angle 분포, S=65%, L=78% → 다크 배경 위 파스텔.
// 같은 node 의 brand 는 fill/stroke 같은 hue 공유.
function generatePastelPalette(n: number): string[] {
  if (n <= 0) return []
  const goldenAngle = 137.508
  return Array.from({length: n}, (_, i) => {
    const hue = (i * goldenAngle) % 360
    return `hsl(${hue.toFixed(1)}, 65%, 78%)`
  })
}
const UNCLASSIFIED_FILL = "#a1a1aa"  // zinc-400

export function BrandClustersClient({
  points,
  nodes,
}: {
  points: BrandPoint[]
  nodes: NodeLabel[]
}) {
  // ─── State ─────────────────────────────────────────
  const [centerId, setCenterId] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [styleFilter, setStyleFilter] = useState<number | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [hoverId, setHoverId] = useState<number | null>(null)

  const [detail, setDetail] = useState<BrandDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const pz = useSvgPanZoom(DEFAULT_VB)

  // ─── Lookups ───────────────────────────────────────
  const nodeById = useMemo(() => {
    const m = new Map<number, NodeLabel>()
    nodes.forEach((n) => m.set(n.id, n))
    return m
  }, [nodes])

  // 스타일 노드 → 파스텔 색상
  const pastel = useMemo(() => generatePastelPalette(nodes.length || 20), [nodes.length])
  const nodeColor = useCallback((nid: number | null): string => {
    if (nid == null) return UNCLASSIFIED_FILL
    const idx = nodes.findIndex((n) => n.id === nid)
    return idx >= 0 ? pastel[idx % pastel.length] : UNCLASSIFIED_FILL
  }, [nodes, pastel])

  // ─── 좌측 brand 리스트 (style filter + search) ───
  const filteredBrands = useMemo(() => {
    let list = points
    if (styleFilter != null) {
      list = list.filter((p) => p.primary_style_node_id === styleFilter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((p) => p.brand_name.toLowerCase().includes(q))
    }
    return list.sort((a, b) => a.brand_name.localeCompare(b.brand_name))
  }, [points, styleFilter, search])

  // ─── 디폴트 선택 ──────────────────────────────────
  useEffect(() => {
    if (centerId != null || points.length === 0) return
    setCenterId(points[0].brand_id)
  }, [points, centerId])

  // ─── detail fetch ─────────────────────────────────
  useEffect(() => {
    if (centerId == null) {
      setDetail(null)
      setDetailError(null)
      setDetailLoading(false)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    setDetail(null)
    fetch(`/api/admin/brand-clusters/detail?id=${centerId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<BrandDetail>
      })
      .then((d) => {
        if (cancelled) return
        setDetail(d)
        setDetailLoading(false)
        pz.reset()
      })
      .catch((e) => {
        if (cancelled) return
        setDetailError(e?.message ?? String(e))
        setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerId])

  // ─── Radar 노드 ───────────────────────────────────
  const radarNodes = useMemo<RadarNode[] | null>(() => {
    if (!detail || centerId == null) return null
    return computeRadar(
      detail.brand.id,
      detail.brand.name,
      detail.brand.primary_style_node_id,
      detail.similar,
    )
  }, [detail, centerId])

  return (
    <div className="space-y-3">
      {/* ─── Top filter bar ─── */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input
          type="search"
          placeholder="브랜드 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-60 rounded border border-border bg-card px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
        />
        <select
          value={styleFilter ?? ""}
          onChange={(e) => setStyleFilter(e.target.value ? Number(e.target.value) : null)}
          className="rounded border border-border bg-card px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
        >
          <option value="">all style nodes</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.code} · {n.name_en}
            </option>
          ))}
        </select>
        <div className="text-muted-foreground">
          {filteredBrands.length.toLocaleString()} / {points.length.toLocaleString()} brand
        </div>
        {centerId != null && detail && (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="ml-auto rounded border border-border bg-card px-2 py-1 text-foreground hover:bg-muted"
          >
            {detail.brand.name} 상세보기 →
          </button>
        )}
      </div>

      {/* ─── 좌측 brand list + 중앙 radar ─── */}
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-3">
        {/* Brand list */}
        <div className="max-h-[640px] overflow-y-auto rounded border border-border bg-card">
          <ul className="divide-y divide-border text-xs">
            {filteredBrands.length === 0 && (
              <li className="px-3 py-4 text-center text-muted-foreground">결과 없음</li>
            )}
            {filteredBrands.map((b) => {
              const node = b.primary_style_node_id != null ? nodeById.get(b.primary_style_node_id) : null
              const active = b.brand_id === centerId
              return (
                <li key={b.brand_id}>
                  <button
                    type="button"
                    onClick={() => setCenterId(b.brand_id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left transition ${
                      active ? "bg-foreground text-background" : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="flex-1 truncate font-medium">{b.brand_name}</span>
                    {node && (
                      <span
                        className={`shrink-0 font-mono text-[10px] ${
                          active ? "opacity-70" : "text-muted-foreground"
                        }`}
                      >
                        {node.code}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Radar SVG */}
        <div className="relative h-[640px] overflow-hidden rounded border border-border bg-card">
          {/* Loading / Error */}
          {centerId != null && detailLoading && !detail && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              로딩 중…
            </div>
          )}
          {detailError && (
            <div className="absolute inset-x-4 top-4 rounded border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {detailError}
            </div>
          )}

          {radarNodes && detail && (
            <svg
              ref={pz.svgRef}
              viewBox={pz.viewBox}
              preserveAspectRatio="xMidYMid meet"
              className="h-full w-full cursor-grab select-none active:cursor-grabbing"
              onMouseDown={pz.onMouseDown}
              onMouseMove={pz.onMouseMove}
            >
              {/* concentric guide rings (similarity 0.9 / 0.75 / 0.6 / 0.45) */}
              {[0.9, 0.75, 0.6, 0.45].map((s) => {
                const r = 12 + (1 - s) * 110
                return (
                  <g key={s}>
                    <circle
                      cx={0}
                      cy={0}
                      r={r}
                      fill="none"
                      stroke="#27272a"
                      strokeWidth={0.4}
                      strokeDasharray="1.5 1.5"
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={r * 0.707}
                      y={-r * 0.707}
                      fontSize={3.0}
                      fontWeight={500}
                      fill="#71717a"
                      className="pointer-events-none select-none tabular-nums"
                    >
                      {(s * 100).toFixed(0)}%
                    </text>
                  </g>
                )
              })}

              {/* connection lines center → neighbors */}
              {radarNodes.slice(1).map((n) => (
                <line
                  key={`line-${n.id}`}
                  x1={0}
                  y1={0}
                  x2={n.x}
                  y2={n.y}
                  stroke="#a1a1aa"
                  strokeOpacity={Math.max(0.3, n.sim - 0.25)}
                  strokeWidth={0.5}
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray="2 1.5"
                />
              ))}

              {/* nodes */}
              {radarNodes.map((n) => {
                const isHover = hoverId === n.id
                const isCenter = n.role === "center"
                const r = isHover ? n.r * 1.2 : n.r
                const fill = nodeColor(n.primary_style_node_id)
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x}, ${n.y})`}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoverId(n.id)}
                    onMouseLeave={() => setHoverId((h) => (h === n.id ? null : h))}
                    onClick={() => {
                      if (pz.wasDragging()) return
                      if (isCenter) {
                        setPanelOpen(true)
                      } else {
                        setCenterId(n.id)
                      }
                    }}
                  >
                    <circle
                      r={r}
                      fill={fill}
                      fillOpacity={isCenter ? 1 : 0.92}
                      stroke={isCenter ? "#fafafa" : "#09090b"}
                      strokeWidth={isCenter ? 0.8 : 0.4}
                      vectorEffect="non-scaling-stroke"
                      className="transition-all duration-150"
                    />
                    <text
                      x={0}
                      y={r + 3}
                      textAnchor="middle"
                      fontSize={isCenter ? 3.2 : 2.4}
                      fontWeight={isCenter ? 700 : 500}
                      fill={isHover || isCenter ? "#fafafa" : "#e4e4e7"}
                      stroke="#09090b"
                      strokeWidth={0.6}
                      style={{paintOrder: "stroke"}}
                      className="pointer-events-none select-none"
                    >
                      {n.name.length > 22 ? n.name.slice(0, 21) + "…" : n.name}
                    </text>
                    {!isCenter && (
                      <text
                        x={0}
                        y={-r - 2.2}
                        textAnchor="middle"
                        fontSize={3.2}
                        fontWeight={600}
                        fill="#fafafa"
                        stroke="#09090b"
                        strokeWidth={0.7}
                        style={{paintOrder: "stroke"}}
                        className="pointer-events-none select-none tabular-nums"
                      >
                        {(n.sim * 100).toFixed(1)}%
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          )}

          {/* zoom HUD */}
          {radarNodes && (
            <div className="absolute right-3 top-3 flex gap-1.5">
              <button
                type="button"
                onClick={pz.reset}
                className="rounded border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
              >
                reset
              </button>
            </div>
          )}

          {/* hover overlay */}
          {radarNodes && hoverId != null && (() => {
            const n = radarNodes.find((x) => x.id === hoverId)
            if (!n) return null
            const node = n.primary_style_node_id != null ? nodeById.get(n.primary_style_node_id) : null
            return (
              <div className="pointer-events-none absolute left-3 top-3 max-w-[240px] rounded border border-border bg-card px-2.5 py-1.5 text-xs shadow-lg">
                <div className="truncate font-semibold text-foreground">{n.name}</div>
                <div className="text-muted-foreground">
                  {n.role === "center" ? "center" : `rank ${n.rank} · cosine ${(n.sim * 100).toFixed(1)}%`}
                </div>
                {node && (
                  <div className="text-muted-foreground">
                    <span className="font-mono">{node.code}</span> {node.name_en}
                  </div>
                )}
                <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                  {n.role === "center" ? "클릭 → 상세 패널" : "클릭 → 이 brand 로 focus 이동"}
                </div>
              </div>
            )
          })()}

          {/* footer 안내 */}
          {radarNodes && (
            <div className="absolute bottom-3 left-3 text-[11px] text-muted-foreground">
              cosine top-{detail!.similar.length} · 거리 = (1 − similarity) · ring = 0.45 / 0.6 / 0.75 / 0.9 · 색 = primary_style_node
            </div>
          )}
        </div>
      </div>

      {/* ─── 상세 패널 ─── */}
      {panelOpen && (
        <BrandClusterDetailPanel
          brandId={centerId}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onClose={() => setPanelOpen(false)}
          onSelectBrand={(id) => setCenterId(id)}
        />
      )}
    </div>
  )
}
