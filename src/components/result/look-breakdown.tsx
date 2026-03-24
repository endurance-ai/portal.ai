"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Product {
  brand: string
  price: string
  platform: string
  imageUrl: string
  link: string
  title?: string
}

export interface LookItem {
  id: string
  category: string
  name: string
  detail?: string
  fabric?: string
  color?: string
  fit?: string
  thumbnailUrl: string
  products: Product[]
}

export interface MoodMeta {
  summary?: string
  vibe?: string
  season?: string
  occasion?: string
  style?: { fit: string; aesthetic: string; gender: string }
}

interface LookBreakdownProps {
  imageUrl: string
  moodTags: { label: string; score: number }[]
  palette: { hex: string; label: string }[]
  items: LookItem[]
  moodMeta?: MoodMeta
  onTryAnother: () => void
}

// Vertical positions for hotspots based on clothing type
const CATEGORY_POSITIONS: Record<string, { top: number; left: number }> = {
  outer: { top: 22, left: 45 },
  top: { top: 38, left: 48 },
  bottom: { top: 58, left: 44 },
  shoes: { top: 82, left: 42 },
  accessory: { top: 45, left: 25 },
  hat: { top: 8, left: 50 },
}

function getHotspotPosition(id: string) {
  const normalized = id.toLowerCase()
  return CATEGORY_POSITIONS[normalized] ?? { top: 50, left: 50 }
}

export function LookBreakdown({
  imageUrl,
  moodTags,
  palette,
  items,
  moodMeta,
  onTryAnother,
}: LookBreakdownProps) {
  const [activeItem, setActiveItem] = useState<string | null>(null)
  const imageRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const containerRef = useRef<HTMLDivElement>(null)

  const scrollToItem = (id: string) => {
    setActiveItem(id)
    const el = itemRefs.current[id]
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }
  const [lines, setLines] = useState<
    { x1: number; y1: number; x2: number; y2: number; id: string }[]
  >([])

  // Calculate connector lines based on actual DOM positions
  useEffect(() => {
    function updateLines() {
      if (!imageRef.current || !containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const imageRect = imageRef.current.getBoundingClientRect()

      const newLines = items
        .map((item) => {
          const itemEl = itemRefs.current[item.id]
          if (!itemEl) return null

          const itemRect = itemEl.getBoundingClientRect()
          const pos = getHotspotPosition(item.id)

          return {
            id: item.id,
            x1: imageRect.left - containerRect.left + imageRect.width * (pos.left / 100),
            y1: imageRect.top - containerRect.top + imageRect.height * (pos.top / 100),
            x2: itemRect.left - containerRect.left,
            y2: itemRect.top - containerRect.top + 24,
          }
        })
        .filter(Boolean) as typeof lines

      setLines(newLines)
    }

    updateLines()
    window.addEventListener("resize", updateLines)
    // Recalculate after images load
    const timer = setTimeout(updateLines, 500)

    return () => {
      window.removeEventListener("resize", updateLines)
      clearTimeout(timer)
    }
  }, [items])

  return (
    <div className="w-full max-w-7xl mx-auto space-y-10">
      {/* Mood bar + palette */}
      <motion.section
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-6"
      >
        <div className="flex flex-wrap gap-3">
          {moodTags.map((tag, i) => (
            <motion.span
              key={tag.label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="px-5 py-2 rounded-full bg-gradient-to-r from-moodfit-primary-container/50 to-moodfit-secondary-container/50 text-moodfit-on-primary-container text-sm font-semibold tracking-wide shadow-sm"
            >
              {tag.label} {tag.score}%
            </motion.span>
          ))}
        </div>

        {palette.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-4 p-2 bg-white/70 backdrop-blur-xl border border-moodfit-outline/10 rounded-full px-6"
          >
            <div className="flex -space-x-2">
              {palette.map((color) => (
                <div
                  key={color.hex}
                  className="w-8 h-8 rounded-full border-2 border-moodfit-surface"
                  style={{ backgroundColor: color.hex }}
                  title={`${color.label} (${color.hex})`}
                />
              ))}
            </div>
            <span className="text-xs font-bold tracking-widest text-moodfit-on-surface-variant uppercase">
              Extracted Palette
            </span>
          </motion.div>
        )}
      </motion.section>

      {/* Vibe summary card */}
      {moodMeta && (moodMeta.vibe || moodMeta.summary) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/70 backdrop-blur-xl border border-moodfit-outline/10 rounded-2xl p-6 space-y-4"
        >
          {moodMeta.vibe && (
            <p className="text-lg font-bold text-moodfit-on-surface tracking-tight italic">
              &ldquo;{moodMeta.vibe}&rdquo;
            </p>
          )}
          {moodMeta.summary && (
            <p className="text-sm text-moodfit-on-surface-variant leading-relaxed">
              {moodMeta.summary}
            </p>
          )}
          <div className="flex flex-wrap gap-3 pt-1">
            {moodMeta.style && (
              <span className="px-3 py-1 rounded-full bg-moodfit-primary/10 text-moodfit-primary text-xs font-bold">
                {moodMeta.style.aesthetic}
              </span>
            )}
            {moodMeta.style && (
              <span className="px-3 py-1 rounded-full bg-moodfit-surface-container text-moodfit-on-surface-variant text-xs font-bold">
                {moodMeta.style.fit}
              </span>
            )}
            {moodMeta.season && (
              <span className="px-3 py-1 rounded-full bg-moodfit-secondary-container/40 text-moodfit-on-surface-variant text-xs font-bold">
                {moodMeta.season}
              </span>
            )}
            {moodMeta.occasion && (
              <span className="px-3 py-1 rounded-full bg-moodfit-tertiary-container/30 text-moodfit-on-surface-variant text-xs font-bold">
                {moodMeta.occasion}
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* Main grid */}
      <div
        ref={containerRef}
        className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start relative"
      >
        {/* SVG connector lines (desktop) */}
        <svg
          className="absolute inset-0 pointer-events-none hidden lg:block z-10"
          width="100%"
          height="100%"
          style={{ overflow: "visible" }}
        >
          {lines.map((line, i) => {
            const midX = line.x1 + (line.x2 - line.x1) * 0.6
            return (
              <motion.path
                key={line.id}
                d={`M ${line.x1} ${line.y1} C ${midX} ${line.y1}, ${midX} ${line.y2}, ${line.x2} ${line.y2}`}
                stroke={activeItem === line.id ? "#6e3bd8" : "#adb3b6"}
                strokeWidth={activeItem === line.id ? 1.5 : 1}
                fill="none"
                strokeDasharray={activeItem === line.id ? "none" : "6 4"}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: activeItem === line.id ? 0.9 : 0.35 }}
                transition={{ duration: 0.8, delay: i * 0.12 }}
              />
            )
          })}
        </svg>

        {/* Left: outfit image with hotspots */}
        <motion.div
          className="lg:col-span-5 lg:sticky lg:top-28"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div
            ref={imageRef}
            className="rounded-[2rem] overflow-hidden bg-white shadow-[0_40px_80px_rgba(46,51,54,0.08)] group"
          >
            <div className="relative aspect-[3/4]">
              <Image
                src={imageUrl}
                alt="Uploaded outfit"
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
              />

              {/* Hotspot dots */}
              {items.map((item) => {
                const pos = getHotspotPosition(item.id)
                return (
                  <motion.button
                    key={item.id}
                    className="absolute z-20"
                    style={{
                      top: `${pos.top}%`,
                      left: `${pos.left}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                    onMouseEnter={() => setActiveItem(item.id)}
                    onMouseLeave={() => setActiveItem(null)}
                    onClick={() => scrollToItem(item.id)}
                    whileHover={{ scale: 1.3 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {/* Pulse ring */}
                    <motion.span
                      className="absolute inset-0 w-5 h-5 rounded-full bg-white/50"
                      animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    {/* Dot */}
                    <span
                      className={cn(
                        "relative block w-5 h-5 rounded-full shadow-lg border-2 border-white transition-colors duration-200",
                        activeItem === item.id
                          ? "bg-moodfit-primary"
                          : "bg-white"
                      )}
                    />
                  </motion.button>
                )
              })}
            </div>

            <div className="p-4 flex items-center justify-between">
              <h2 className="text-lg font-black tracking-tighter uppercase text-moodfit-on-surface">
                The Look
              </h2>
              <span className="text-xs font-medium text-moodfit-on-surface-variant tracking-widest uppercase">
                AI Analysis
              </span>
            </div>
          </div>
        </motion.div>

        {/* Right: item breakdown */}
        <div className="lg:col-span-7 space-y-8">
          <AnimatePresence>
            {items.map((item, itemIndex) => {
              const hasProducts = item.products.length > 0

              return (
                <motion.div
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[item.id] = el
                  }}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: itemIndex * 0.1, duration: 0.5 }}
                  className={cn(
                    "space-y-4 rounded-2xl p-5 transition-all duration-300",
                    activeItem === item.id
                      ? "bg-moodfit-primary/5 ring-1 ring-moodfit-primary/20"
                      : "hover:bg-moodfit-surface-container-low/50"
                  )}
                  onMouseEnter={() => setActiveItem(item.id)}
                  onMouseLeave={() => setActiveItem(null)}
                >
                  {/* Item header */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-moodfit-surface-container flex items-center justify-center text-lg shrink-0">
                      {getCategoryEmoji(item.id)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-moodfit-primary uppercase tracking-widest">
                        {item.category}
                      </p>
                      <h3 className="text-sm font-bold text-moodfit-on-surface">
                        {item.name}
                      </h3>
                      {(item.fabric || item.fit || item.color) && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {item.fit && (
                            <span className="px-2 py-0.5 rounded-full bg-moodfit-surface-container text-[10px] font-semibold text-moodfit-on-surface-variant">
                              {item.fit}
                            </span>
                          )}
                          {item.fabric && (
                            <span className="px-2 py-0.5 rounded-full bg-moodfit-surface-container text-[10px] font-semibold text-moodfit-on-surface-variant">
                              {item.fabric}
                            </span>
                          )}
                          {item.color && (
                            <span className="px-2 py-0.5 rounded-full bg-moodfit-surface-container text-[10px] font-semibold text-moodfit-on-surface-variant flex items-center gap-1">
                              <span
                                className="w-2.5 h-2.5 rounded-full border border-moodfit-outline/20 inline-block"
                                style={{ backgroundColor: item.color.toLowerCase().includes("#") ? item.color : undefined }}
                              />
                              {item.color}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Product grid or skeleton loading */}
                  {hasProducts ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {item.products.map((product, pi) => (
                        <motion.a
                          key={`${product.brand}-${pi}`}
                          href={product.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: pi * 0.08 }}
                          className="group/card bg-white/70 backdrop-blur-xl border border-moodfit-outline/10 p-3 rounded-2xl transition-all duration-300 hover:shadow-xl hover:-translate-y-1 block"
                        >
                          {product.imageUrl ? (
                            <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-moodfit-surface-container-low">
                              <Image
                                src={product.imageUrl}
                                alt={product.title || `${product.brand} product`}
                                fill
                                sizes="(max-width: 640px) 100vw, 33vw"
                                className="object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-full aspect-square rounded-xl mb-3 bg-moodfit-surface-container-low" />
                          )}
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-[10px] font-black uppercase text-moodfit-on-surface-variant truncate max-w-[60%]">
                              {product.brand}
                            </span>
                            <span className="text-[10px] font-bold text-moodfit-primary">
                              {product.price}
                            </span>
                          </div>
                          <span className="text-[11px] font-bold flex items-center gap-1 group-hover/card:text-moodfit-primary transition-colors truncate">
                            {product.platform}
                            <ArrowUpRight className="size-3 shrink-0" />
                          </span>
                        </motion.a>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="bg-white/70 backdrop-blur-xl border border-moodfit-outline/10 p-3 rounded-2xl"
                        >
                          <div className="w-full aspect-square rounded-xl mb-3 bg-moodfit-surface-container-low relative overflow-hidden">
                            <motion.div
                              className="absolute inset-0"
                              style={{
                                background:
                                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
                                backgroundSize: "200% 100%",
                              }}
                              animate={{
                                backgroundPosition: ["200% 0", "-200% 0"],
                              }}
                              transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                ease: "linear",
                                delay: i * 0.2,
                              }}
                            />
                          </div>
                          <div className="h-3 w-20 bg-moodfit-surface-container rounded-full mb-2" />
                          <div className="h-3 w-14 bg-moodfit-surface-container rounded-full" />
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Action buttons */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8"
      >
        <button
          onClick={onTryAnother}
          className="w-full sm:w-auto px-10 py-4 rounded-full border border-moodfit-primary text-moodfit-primary font-bold text-sm tracking-widest uppercase hover:bg-moodfit-primary/5 transition-colors"
        >
          Try Another Look
        </button>
        <button className="w-full sm:w-auto px-10 py-4 rounded-full bg-gradient-to-r from-moodfit-primary to-moodfit-primary-dim text-white font-bold text-sm tracking-widest uppercase shadow-lg shadow-moodfit-primary/20 hover:shadow-xl hover:scale-105 transition-all">
          Save This Look
        </button>
      </motion.section>
    </div>
  )
}

function getCategoryEmoji(id: string): string {
  const map: Record<string, string> = {
    outer: "🧥",
    top: "👕",
    bottom: "👖",
    shoes: "👟",
    accessory: "👜",
    hat: "🧢",
  }
  return map[id.toLowerCase()] ?? "👔"
}
