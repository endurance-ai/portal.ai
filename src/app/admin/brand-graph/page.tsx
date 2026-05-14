"use client"

import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import {Skeleton} from "@/components/ui/skeleton"
import {BrandDetailPanel} from "@/components/admin/brand-detail-panel"

// ─── Pan/Zoom hook ────────────────────────────────────────────
function useSvgPanZoom(initial: {x: number; y: number; w: number; h: number}) {
  const [vb, setVb] = useState(initial)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{cx: number; cy: number} | null>(null)
  const movedRef = useRef(0)  // 드래그 누적 픽셀 거리 — 클릭 vs 드래그 판별용
  const initialKey = `${initial.x},${initial.y},${initial.w},${initial.h}`

  // initial 변경 시 reset
  useEffect(() => {
    setVb(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey])

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    dragRef.current = {cx: e.clientX, cy: e.clientY}
    movedRef.current = 0
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const dx = e.clientX - dragRef.current.cx
    const dy = e.clientY - dragRef.current.cy
    movedRef.current += Math.abs(dx) + Math.abs(dy)
    setVb((v) => {
      const sx = v.w / rect.width
      const sy = v.h / rect.height
      return {...v, x: v.x - dx * sx, y: v.y - dy * sy}
    })
    dragRef.current = {cx: e.clientX, cy: e.clientY}
  }, [])

  // 클릭이 드래그 끝의 부산물인지 검사
  const wasDragging = useCallback(() => movedRef.current > 4, [])

  // window mouseup — 드래그 중 SVG 밖으로 나가도 해제
  useEffect(() => {
    const onUp = () => {
      dragRef.current = null
    }
    window.addEventListener("mouseup", onUp)
    return () => window.removeEventListener("mouseup", onUp)
  }, [])

  // wheel zoom — passive: false 필요 (preventDefault)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width
      const py = (e.clientY - rect.top) / rect.height
      const factor = e.deltaY < 0 ? 0.85 : 1.18
      setVb((v) => {
        const newW = Math.max(initial.w * 0.1, Math.min(initial.w * 8, v.w * factor))
        const newH = newW * (v.h / v.w)
        const cx = v.x + px * v.w
        const cy = v.y + py * v.h
        return {x: cx - px * newW, y: cy - py * newH, w: newW, h: newH}
      })
    }
    svg.addEventListener("wheel", onWheel, {passive: false})
    return () => svg.removeEventListener("wheel", onWheel)
  }, [initial.w])

  const reset = useCallback(() => setVb(initial), [initial])

  return {
    svgRef,
    viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`,
    onMouseDown,
    onMouseMove,
    reset,
    wasDragging,
    vb,
    initialW: initial.w,
  }
}

interface NodeData {
  id: number
  name: string
  hasMeta: boolean
  cluster: string
  skuCount: number
  x: number | null
  y: number | null
}

interface NeighborData {
  id: number
  name: string
  similarity: number
  cluster: string
  skuCount: number
  hasMeta: boolean
}

interface GraphPayload {
  nodes: NodeData[]
  stats: {totalNodes: number; withMeta: number; withoutMeta: number}
}

const CLUSTER_COLORS: Record<string, string> = {
  minimalist: "#94a3b8",
  contemporary: "#60a5fa",
  classic: "#a78bfa",
  vintage: "#f97316",
  chic: "#ec4899",
  casual: "#34d399",
  luxury: "#fbbf24",
  avantgarde: "#a855f7",
  feminine: "#f472b6",
  streetwear: "#ef4444",
  other: "#6b7280",
  unknown: "#6b7280",
  empty: "#374151",
}

const CLUSTER_LABEL: Record<string, string> = {
  minimalist: "MINIMALIST",
  contemporary: "CONTEMPORARY",
  classic: "CLASSIC",
  vintage: "VINTAGE",
  chic: "CHIC",
  casual: "CASUAL",
  luxury: "LUXURY",
  avantgarde: "AVANT-GARDE",
  feminine: "FEMININE",
  streetwear: "STREETWEAR",
  other: "OTHER",
  unknown: "UNCATEGORIZED",
  empty: "메타 없음",
}

export default function BrandGraphPage() {
  const [data, setData] = useState<GraphPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [focused, setFocused] = useState<NodeData | null>(null)
  const [neighbors, setNeighbors] = useState<NeighborData[] | null>(null)
  const [neighborsLoading, setNeighborsLoading] = useState(false)
  const [hoveredNode, setHoveredNode] = useState<NodeData | null>(null)
  const [activeCluster, setActiveCluster] = useState<string | null>(null)

  // 데이터 로드
  useEffect(() => {
    fetch("/api/admin/brand-graph")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: GraphPayload) => {
        setData(d)
        setLoading(false)
      })
      .catch((e) => {
        setError(String(e))
        setLoading(false)
      })
  }, [])

  // 검색 자동 매칭 — 입력 후 디바운스. 클릭한 focus 는 건드리지 않음.
  useEffect(() => {
    if (!data) return
    const q = search.trim().toLowerCase()
    if (!q) return  // empty 입력은 무시 (초기화 버튼이 명시적으로 처리)
    const t = setTimeout(() => {
      const exact = data.nodes.find((n) => n.name.toLowerCase() === q)
      const prefix = data.nodes.find((n) => n.name.toLowerCase().startsWith(q))
      const contains = data.nodes.find((n) => n.name.toLowerCase().includes(q))
      const match = exact || prefix || contains
      if (match) setFocused(match)
    }, 250)
    return () => clearTimeout(t)
  }, [search, data])

  // focused 바뀌면 neighbors 로드 (data fetching effect)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!focused) {
      setNeighbors(null)
      return
    }
    let cancelled = false
    setNeighborsLoading(true)
    fetch(`/api/admin/brand-graph/neighbors?id=${focused.id}&k=10`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setNeighbors(d.neighbors ?? [])
        setNeighborsLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setNeighbors([])
        setNeighborsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [focused?.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  const clusterCounts = useMemo(() => {
    if (!data) return []
    const c = new Map<string, number>()
    for (const n of data.nodes) c.set(n.cluster, (c.get(n.cluster) ?? 0) + 1)
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1])
  }, [data])

  // UMAP centroid (전체 모드 클러스터 라벨)
  const clusterCentroids = useMemo(() => {
    if (!data) return []
    const groups = new Map<string, {sum_x: number; sum_y: number; count: number}>()
    for (const n of data.nodes) {
      if (n.cluster === "empty" || n.cluster === "unknown" || n.cluster === "other") continue
      if (n.x == null || n.y == null) continue
      const g = groups.get(n.cluster) ?? {sum_x: 0, sum_y: 0, count: 0}
      g.sum_x += n.x
      g.sum_y += n.y
      g.count += 1
      groups.set(n.cluster, g)
    }
    return Array.from(groups.entries())
      .filter(([, g]) => g.count >= 5)
      .map(([cluster, g]) => ({
        cluster,
        x: g.sum_x / g.count,
        y: g.sum_y / g.count,
        count: g.count,
      }))
  }, [data])

  if (loading) return <LoadingSkeleton />
  if (error) return <div className="p-6 text-red-500">에러: {error}</div>
  if (!data) return null

  const isFocused = focused !== null

  return (
    <div className="flex flex-col h-full gap-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Brand Similarity Graph</h1>
          <div className="text-xs text-muted-foreground mt-1">
            UMAP 2D · 노드 {data.stats.totalNodes} · 메타 {data.stats.withMeta}/{data.stats.totalNodes}
            {isFocused && (
              <span className="ml-2 text-amber-400">
                · 중심: {focused!.name}
              </span>
            )}
          </div>
        </div>
        {isFocused && (
          <button
            onClick={() => {
              setFocused(null)
              setSearch("")
            }}
            className="px-3 py-1.5 text-xs rounded-md border border-border bg-secondary hover:bg-secondary/80 transition-colors"
          >
            ← 전체 보기로
          </button>
        )}
      </div>

      {/* 컨트롤 */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="search"
          placeholder="브랜드 검색 (예: Acne, Uniqlo, Lemaire)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 bg-secondary text-foreground rounded-md text-sm w-72 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {search && (
          <button
            onClick={() => {
              setSearch("")
              setFocused(null)
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            초기화
          </button>
        )}

        <div className="flex-1" />

        {/* 클러스터 칩 — 클릭으로 필터 (전체 모드에서만 의미) */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          {clusterCounts.slice(0, 11).map(([cluster, count]) => {
            const isActive = activeCluster === cluster
            return (
              <button
                key={cluster}
                onClick={() => setActiveCluster(isActive ? null : cluster)}
                disabled={isFocused}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-colors ${
                  isActive
                    ? "bg-primary/20 border-primary text-foreground"
                    : "bg-secondary/40 border-transparent text-muted-foreground hover:bg-secondary/60"
                } ${isFocused ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{backgroundColor: CLUSTER_COLORS[cluster] ?? "#6b7280"}}
                />
                <span>{CLUSTER_LABEL[cluster] ?? cluster}</span>
                <span className="text-muted-foreground/60">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 본문 */}
      <div className="relative flex-1 bg-card rounded-lg border border-border overflow-hidden min-h-[600px]">
        {!isFocused ? (
          <FullMapView
            nodes={data.nodes}
            centroids={clusterCentroids}
            activeCluster={activeCluster}
            onNodeClick={(n) => setFocused(n)}
            onNodeHover={setHoveredNode}
            hoveredNode={hoveredNode}
          />
        ) : (
          <ConstellationView
            center={focused!}
            neighbors={neighbors ?? []}
            loading={neighborsLoading}
            onNeighborClick={(n) => {
              // 이웃 노드를 새 center 로 (NodeData 형태로 변환)
              const target = data.nodes.find((x) => x.id === n.id)
              if (target) setFocused(target)
            }}
          />
        )}

        {/* 좌하단 hover 카드 (전체 모드) */}
        {!isFocused && hoveredNode && (
          <div className="absolute bottom-3 left-3 bg-popover/90 backdrop-blur border border-border rounded-md px-3 py-2 text-xs pointer-events-none">
            <span className="font-semibold">{hoveredNode.name}</span>
            <span className="text-muted-foreground ml-2">
              {CLUSTER_LABEL[hoveredNode.cluster] ?? hoveredNode.cluster}
              {hoveredNode.skuCount > 0 && ` · SKU ${hoveredNode.skuCount}`}
            </span>
          </div>
        )}

        {/* 우측 사이드 패널 (데스크탑) / 바텀시트 (모바일) */}
        <BrandDetailPanel
          brandId={focused?.id ?? null}
          onClose={() => {
            setFocused(null)
            setSearch("")
          }}
          onSelectSimilar={(id) => {
            const target = data.nodes.find((n) => n.id === id)
            if (target) setFocused(target)
          }}
        />
      </div>
    </div>
  )
}

// ─── Full UMAP Map View ───────────────────────────────────────
function FullMapView({
  nodes,
  centroids,
  activeCluster,
  onNodeClick,
  onNodeHover,
  hoveredNode,
}: {
  nodes: NodeData[]
  centroids: Array<{cluster: string; x: number; y: number; count: number}>
  activeCluster: string | null
  onNodeClick: (n: NodeData) => void
  onNodeHover: (n: NodeData | null) => void
  hoveredNode: NodeData | null
}) {
  // initial viewBox — activeCluster 있으면 그 노드 bounding box, 없으면 전체
  const initialVb = useMemo(() => {
    const PAD_DEFAULT = 15
    if (!activeCluster) {
      const VB = 100 + PAD_DEFAULT
      return {x: -VB, y: -VB, w: VB * 2, h: VB * 2}
    }
    const filtered = nodes.filter(
      (n) => n.cluster === activeCluster && n.x != null && n.y != null
    )
    if (filtered.length === 0) {
      const VB = 100 + PAD_DEFAULT
      return {x: -VB, y: -VB, w: VB * 2, h: VB * 2}
    }
    const xs = filtered.map((n) => n.x!)
    const ys = filtered.map((n) => n.y!)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const w = maxX - minX
    const h = maxY - minY
    const pad = Math.max(w, h) * 0.15 + 8
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const half = Math.max(w, h) / 2 + pad
    return {x: cx - half, y: cy - half, w: half * 2, h: half * 2}
  }, [activeCluster, nodes])

  const renderNodes = useMemo(() => {
    if (!activeCluster) return nodes
    return nodes.filter((n) => n.cluster === activeCluster)
  }, [activeCluster, nodes])

  const pz = useSvgPanZoom(initialVb)
  const zoomFactor = pz.vb.w / 230

  // ref / viewBox / handlers 는 hook 객체에서 꺼냄 — destructure 로 일관성 유지
  const {svgRef, viewBox, onMouseDown, onMouseMove} = pz

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full"
      style={{display: "block", cursor: "grab", userSelect: "none"}}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
    >
      {/* 클러스터 라벨 (centroid 위치) — 줌 모드면 안 보여줌 */}
      {!activeCluster &&
        centroids.map((c) => (
          <text
            key={c.cluster}
            x={c.x}
            y={c.y}
            textAnchor="middle"
            fill="rgba(255,255,255,0.06)"
            fontSize={6}
            fontWeight={700}
            fontFamily="Pretendard, sans-serif"
            letterSpacing="0.1em"
          >
            {CLUSTER_LABEL[c.cluster] ?? c.cluster}
          </text>
        ))}

      {/* 줌 모드: 큰 클러스터 라벨을 좌상단 */}
      {activeCluster && (
        <text
          x={0}
          y={0}
          fill="rgba(255,255,255,0.08)"
          fontSize={zoomFactor * 12}
          fontWeight={800}
          fontFamily="Pretendard, sans-serif"
          letterSpacing="0.15em"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {CLUSTER_LABEL[activeCluster] ?? activeCluster}
        </text>
      )}

      {/* 노드 */}
      {renderNodes.map((n) => {
        if (n.x == null || n.y == null) return null
        // 줌 모드면 노드 크기 키움 (viewBox 줄어든 만큼)
        const baseR = Math.max(0.6, Math.log2((n.skuCount || 1) + 1) * 0.4)
        const r = baseR * (activeCluster ? zoomFactor * 1.2 : 1)
        const isHovered = hoveredNode?.id === n.id

        // 라벨 노출 — 줌 레벨에 따라 점진적
        // - 줌 아웃(zoomFactor=1, full view): SKU 800 이상만
        // - 줌 인 진행: 임계치 점차 낮아짐
        // - 클러스터 모드 + 100개 미만: 모두
        const fullModeThreshold = Math.max(50, 800 * zoomFactor)
        const showLabel =
          isHovered ||
          (activeCluster
            ? renderNodes.length < 100
            : n.skuCount >= fullModeThreshold)
        const labelSize = activeCluster ? zoomFactor * 4 : 2.8 * zoomFactor

        return (
          <g
            key={n.id}
            style={{cursor: "pointer"}}
            onClick={(e) => {
              e.stopPropagation()
              if (pz.wasDragging()) return  // 드래그 끝의 click 은 무시
              onNodeClick(n)
            }}
            onMouseEnter={() => onNodeHover(n)}
            onMouseLeave={() => onNodeHover(null)}
          >
            <circle
              cx={n.x}
              cy={n.y}
              r={Math.max(3, r * 1.5)}
              fill="rgba(0,0,0,0.001)"
            />
            <circle
              cx={n.x}
              cy={n.y}
              r={isHovered ? r * 2.2 : r}
              fill={CLUSTER_COLORS[n.cluster] ?? "#6b7280"}
              fillOpacity={n.cluster === "empty" ? 0.4 : 0.85}
              stroke={isHovered ? "rgba(255,255,255,0.95)" : "none"}
              strokeWidth={isHovered ? 0.4 * zoomFactor : 0}
              style={{pointerEvents: "none", transition: "r 0.15s"}}
            />
            {showLabel && (
              <text
                x={n.x}
                y={n.y - r * 2.5 - 0.5}
                textAnchor="middle"
                fill={isHovered ? "#fff" : "rgba(255,255,255,0.85)"}
                fontSize={labelSize}
                fontWeight={isHovered ? 700 : 500}
                fontFamily="Pretendard, sans-serif"
                style={{pointerEvents: "none"}}
              >
                {n.name}
              </text>
            )}
          </g>
        )
      })}

    </svg>
  )
}

// ─── Constellation View ──────────────────────────────────────
function ConstellationView({
  center,
  neighbors,
  loading,
  onNeighborClick,
}: {
  center: NodeData
  neighbors: NeighborData[]
  loading: boolean
  onNeighborClick: (n: NeighborData) => void
}) {
  const cx = 600
  const cy = 450

  // 좌표 계산 — radial layout
  const positions = useMemo(() => {
    if (neighbors.length === 0) return []
    const N = neighbors.length
    const sims = neighbors.map((n) => n.similarity)
    const minSim = Math.min(...sims)
    const maxSim = Math.max(...sims)
    const range = Math.max(0.01, maxSim - minSim)

    return neighbors.map((n, i) => {
      const angle = (2 * Math.PI * i) / N - Math.PI / 2
      const t = (maxSim - n.similarity) / range  // 0~1
      const dist = 160 + t * 180  // 160 ~ 340 (이전 180~430 → 짤림)
      return {
        ...n,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        angle,
        dist,
      }
    })
  }, [neighbors])

  // pan/zoom
  const pz = useSvgPanZoom({x: 0, y: 0, w: 1200, h: 900})
  const {svgRef, viewBox, onMouseDown, onMouseMove} = pz

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      className="w-full h-full"
      style={{display: "block", cursor: "grab", userSelect: "none"}}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
    >
      {/* 거리 가이드 ring — 더 진하게, 라이트 톤 */}
      {[160, 220, 280, 340].map((r) => (
        <circle
          key={r}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(148, 163, 184, 0.18)"
          strokeWidth={1}
          strokeDasharray="3 5"
        />
      ))}


      {/* 엣지 */}
      {positions.map((n) => (
        <line
          key={`e-${n.id}`}
          x1={cx}
          y1={cy}
          x2={n.x}
          y2={n.y}
          stroke={CLUSTER_COLORS[n.cluster] ?? "#6b7280"}
          strokeWidth={Math.max(0.6, (n.similarity - 0.7) * 8)}
          strokeOpacity={0.3}
        />
      ))}

      {/* 이웃 노드 */}
      {positions.map((n) => {
        const r = 7 + Math.log2(n.skuCount + 1) * 1.0
        const isTop = Math.sin(n.angle) < 0
        const labelOffsetY = isTop ? -r - 12 : r + 16
        return (
          <g
            key={n.id}
            style={{cursor: "pointer"}}
            onClick={() => {
              if (pz.wasDragging()) return
              onNeighborClick(n)
            }}
          >
            {/* hover 영역 확장 */}
            <circle cx={n.x} cy={n.y} r={r + 6} fill="transparent" />
            {/* 시각 */}
            <circle
              cx={n.x}
              cy={n.y}
              r={r}
              fill={CLUSTER_COLORS[n.cluster] ?? "#6b7280"}
              fillOpacity={n.cluster === "empty" ? 0.4 : 0.85}
              stroke={n.cluster === "empty" ? "rgba(251, 191, 36, 0.5)" : "none"}
              strokeWidth={n.cluster === "empty" ? 1 : 0}
              strokeDasharray={n.cluster === "empty" ? "2 2" : undefined}
              className="transition-all hover:fill-opacity-100"
            />
            <text
              x={n.x}
              y={n.y + labelOffsetY}
              textAnchor="middle"
              fill="rgba(255,255,255,0.9)"
              fontSize="13"
              fontWeight={500}
              fontFamily="Pretendard, sans-serif"
              style={{pointerEvents: "none"}}
            >
              {n.name}
            </text>
            <text
              x={n.x}
              y={n.y + labelOffsetY + 14}
              textAnchor="middle"
              fill="rgba(255,255,255,0.4)"
              fontSize="11"
              fontFamily="Pretendard, sans-serif"
              style={{pointerEvents: "none"}}
            >
              {n.similarity.toFixed(3)}
              {n.skuCount > 0 && ` · SKU ${n.skuCount}`}
            </text>
          </g>
        )
      })}

      {/* 중심 노드 */}
      <g>
        <circle
          cx={cx}
          cy={cy}
          r={28}
          fill="none"
          stroke="rgba(251, 191, 36, 0.4)"
          strokeWidth={1.5}
        />
        <circle
          cx={cx}
          cy={cy}
          r={20}
          fill={CLUSTER_COLORS[center.cluster] ?? "#6b7280"}
          fillOpacity={1}
        />
        <text
          x={cx}
          y={cy + 50}
          textAnchor="middle"
          fill="#fbbf24"
          fontSize="18"
          fontWeight={700}
          fontFamily="Pretendard, sans-serif"
        >
          {center.name}
        </text>
        <text
          x={cx}
          y={cy + 70}
          textAnchor="middle"
          fill="rgba(255,255,255,0.5)"
          fontSize="12"
          fontFamily="Pretendard, sans-serif"
        >
          {CLUSTER_LABEL[center.cluster] ?? center.cluster}
          {center.skuCount > 0 && ` · SKU ${center.skuCount.toLocaleString()}`}
        </text>
      </g>

      {/* 로딩 / 빈 상태 */}
      {loading && (
        <text
          x={cx}
          y={cy + 110}
          textAnchor="middle"
          fill="rgba(255,255,255,0.4)"
          fontSize="12"
          fontFamily="Pretendard, sans-serif"
        >
          유사 브랜드 로딩 중...
        </text>
      )}
      {!loading && neighbors.length === 0 && (
        <text
          x={cx}
          y={cy + 110}
          textAnchor="middle"
          fill="rgba(251, 191, 36, 0.6)"
          fontSize="12"
          fontFamily="Pretendard, sans-serif"
        >
          이 브랜드는 brand_similar 그래프 source 가 아닙니다.
        </text>
      )}
    </svg>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Skeleton className="h-9 w-72 rounded-md" />
        <div className="flex-1" />
        <div className="flex items-center gap-2 flex-wrap">
          {Array.from({length: 8}).map((_, i) => (
            <Skeleton key={i} className="h-6 w-24 rounded-full" />
          ))}
        </div>
      </div>
      <div className="relative flex-1 bg-card rounded-lg border border-border overflow-hidden min-h-[600px]">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="grid grid-cols-12 gap-6 opacity-30">
            {Array.from({length: 60}).map((_, i) => {
              const size = 6 + (i % 5) * 4
              return (
                <Skeleton
                  key={i}
                  className="rounded-full"
                  style={{width: size, height: size}}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
