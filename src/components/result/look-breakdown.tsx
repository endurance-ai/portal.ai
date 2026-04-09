"use client"

import {useRef, useState} from "react"
import {AnimatePresence, motion} from "framer-motion"
import Image from "next/image"
import {ChevronDown} from "lucide-react"
import {cn} from "@/lib/utils"
import {ProductCard} from "@/components/result/product-card"
import {EmptyResults} from "@/components/result/empty-results"


export interface Product {
  brand: string
  price: string
  platform: string
  imageUrl: string
  link: string
  title?: string
  description?: string
  material?: string
  reviewCount?: number
  matchReasons?: { field: string; value: string }[]
}

export interface LookItem {
  id: string
  category: string
  name: string
  detail?: string
  fabric?: string
  color?: string
  fit?: string
  position?: { top: number; left: number }
  products: Product[]
  productsLoaded?: boolean
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
  onTryAnother?: () => void
  onSuggestionClick?: (text: string) => void
}

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
  onSuggestionClick,
}: LookBreakdownProps) {
  const hasImage = !!imageUrl
  const [expandedIdx, setExpandedIdx] = useState<number | null>(
    items.length > 0 ? 0 : null
  )
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const toggleItem = (idx: number) => {
    const next = expandedIdx === idx ? null : idx
    setExpandedIdx(next)
    if (next !== null) {
      setTimeout(() => {
        itemRefs.current[next]?.scrollIntoView({ behavior: "smooth", block: "nearest" })
      }, 300)
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Top bar: mood tags + palette — only shown when image is present */}
      {hasImage && (moodTags.length > 0 || palette.length > 0) && (
        <motion.section
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3"
        >
          <div className="flex flex-wrap gap-2">
            {moodTags.map((tag, i) => (
              <span
                key={tag.label}
                className={cn(
                  "px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-wider",
                  i === 0
                    ? "bg-primary-container text-primary"
                    : "bg-border text-muted-foreground"
                )}
              >
                {tag.label.toUpperCase()} {tag.score}%
              </span>
            ))}
          </div>
          {moodMeta?.style && (
            <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold bg-primary/10 text-primary tracking-wider">
              {moodMeta.style.aesthetic}
            </span>
          )}
          <div className="flex-1" />
          {palette.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono font-bold text-on-surface-variant tracking-widest uppercase">
                Color Map
              </span>
              <div className="flex -space-x-1">
                {palette.map((color) => (
                  <div
                    key={color.hex}
                    className="w-5 h-5 rounded border border-border"
                    style={{ backgroundColor: color.hex }}
                    title={`${color.label} (${color.hex})`}
                  />
                ))}
              </div>
            </div>
          )}
        </motion.section>
      )}

      {/* Main layout: image left + accordion right */}
      <div className={cn("grid grid-cols-1 gap-6 items-start", hasImage && "lg:grid-cols-12")}>
        {/* Left: Sticky image with hotspots — only shown when image is present */}
        {hasImage && (
          <motion.div
            className="lg:col-span-4 lg:sticky lg:top-24"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-card border border-border rounded-lg overflow-hidden corner-brackets">
              <div className="relative aspect-[3/4]">
                <Image
                  src={imageUrl}
                  alt="Uploaded outfit"
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="object-cover"
                />

                {/* Hotspot dots */}
                {items.map((item, i) => {
                  const pos = item.position ?? getHotspotPosition(item.id)
                  const isActive = expandedIdx === i
                  return (
                    <button
                      key={`hotspot-${i}`}
                      className="absolute z-20"
                      style={{
                        top: `${pos.top}%`,
                        left: `${pos.left}%`,
                        transform: "translate(-50%, -50%)",
                      }}
                      onClick={() => toggleItem(i)}
                      aria-label={`View ${item.category}: ${item.name}`}
                      aria-expanded={isActive}
                    >
                      <span
                        className={cn(
                          "relative flex items-center justify-center w-7 h-7 rounded-full text-[9px] font-mono font-bold transition-all duration-200",
                          isActive
                            ? "bg-primary text-background shadow-[0_0_12px_rgba(255,255,255,0.3)]"
                            : "bg-background/90 text-foreground border border-foreground/40 hover:bg-primary hover:text-background hover:border-primary shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
                        )}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="px-3 py-2 border-t border-border flex justify-between items-center">
                <span className="text-[9px] font-mono font-bold text-outline tracking-widest uppercase">
                  The Look
                </span>
                <span className="text-[9px] font-mono font-bold text-on-surface-variant tracking-widest uppercase">
                  AI Scan
                </span>
              </div>
            </div>

            {/* Vibe card below image */}
            {moodMeta?.vibe && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="mt-3 p-3 bg-card border border-border rounded-lg"
              >
                <div className="text-[9px] font-mono font-bold text-primary tracking-widest uppercase">
                  Style Summary
                </div>
                <p className="text-xs font-semibold text-foreground italic mt-1">
                  &ldquo;{moodMeta.vibe}&rdquo;
                </p>
                {moodMeta.summary && (
                  <p className="text-[10px] text-outline mt-2 leading-relaxed">
                    {moodMeta.summary}
                  </p>
                )}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Right: Accordion — takes full width when no image */}
        <div className={cn("space-y-3", hasImage ? "lg:col-span-8" : "col-span-1")}>
          {/* Section heading */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono font-bold text-on-surface-variant tracking-[0.2em] uppercase">
              Garment Index
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {items.map((item, itemIndex) => {
            const isExpanded = expandedIdx === itemIndex
            const hasProducts = item.products.length > 0
            const isLoading = !item.productsLoaded && !hasProducts

            return (
              <motion.div
                key={`item-${itemIndex}`}
                ref={(el) => { itemRefs.current[itemIndex] = el }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: itemIndex * 0.08 }}
                className={cn(
                  "bg-card border rounded-lg overflow-hidden transition-colors duration-200",
                  isExpanded
                    ? "border-outline-focus"
                    : "border-border hover:border-outline/30"
                )}
              >
                {/* Accordion header */}
                <button
                  onClick={() => toggleItem(itemIndex)}
                  className="w-full flex items-center gap-4 p-4 text-left"
                  aria-expanded={isExpanded}
                  aria-controls={`panel-${itemIndex}`}
                >
                  <span
                    className={cn(
                      "text-lg font-extrabold font-mono tabular-nums w-8 transition-colors",
                      isExpanded ? "text-primary" : "text-primary-dim"
                    )}
                  >
                    {String(itemIndex + 1).padStart(2, "0")}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-mono font-bold text-on-surface-variant tracking-[0.15em] uppercase">
                      {item.category}
                    </div>
                    <div className="text-sm font-bold text-foreground truncate">
                      {item.name}
                    </div>
                  </div>

                  {!isExpanded && (item.fit || item.fabric) && (
                    <div className="hidden sm:flex gap-1.5">
                      {item.fit && (
                        <span className="px-2 py-0.5 rounded bg-border text-[9px] font-mono font-semibold text-outline">
                          {item.fit}
                        </span>
                      )}
                      {item.fabric && (
                        <span className="px-2 py-0.5 rounded bg-border text-[9px] font-mono font-semibold text-outline">
                          {item.fabric}
                        </span>
                      )}
                    </div>
                  )}

                  {!isExpanded && hasProducts && (
                    <div className="hidden sm:flex gap-1">
                      {item.products.slice(0, 3).map((p, pi) => (
                        <div
                          key={pi}
                          className="w-7 h-7 rounded bg-surface-dim border border-border overflow-hidden relative"
                        >
                          {p.imageUrl && (
                            <Image src={p.imageUrl} alt="" fill sizes="28px" className="object-cover" />
                          )}
                        </div>
                      ))}
                      {item.products.length > 3 && (
                        <span className="text-[9px] font-mono text-on-surface-variant self-center ml-1">
                          +{item.products.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  <ChevronDown
                    className={cn(
                      "size-4 text-on-surface-variant transition-transform duration-200 shrink-0",
                      isExpanded && "rotate-180"
                    )}
                  />
                </button>

                {/* Expanded content */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      id={`panel-${itemIndex}`}
                      role="region"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-4">
                        {/* Attribute chips */}
                        {(item.fit || item.fabric || item.color) && (
                          <div className="flex flex-wrap gap-2">
                            {item.fit && (
                              <span className="px-2.5 py-1 rounded bg-border text-[10px] font-mono font-semibold text-muted-foreground">
                                {item.fit}
                              </span>
                            )}
                            {item.fabric && (
                              <span className="px-2.5 py-1 rounded bg-border text-[10px] font-mono font-semibold text-muted-foreground">
                                {item.fabric}
                              </span>
                            )}
                            {item.color && (
                              <span className="px-2.5 py-1 rounded bg-border text-[10px] font-mono font-semibold text-muted-foreground flex items-center gap-1.5">
                                <span
                                  className="w-2.5 h-2.5 rounded-sm border border-border inline-block"
                                  style={{
                                    backgroundColor: item.color.toLowerCase().includes("#")
                                      ? item.color
                                      : undefined,
                                  }}
                                />
                                {item.color}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Horizontal scroll product cards */}
                        {hasProducts ? (
                          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent -mx-1 px-1 pb-2">
                            <div className="flex gap-3" style={{ minWidth: "min-content" }}>
                              {item.products.slice(0, 5).map((product, pi) => (
                                <ProductCard
                                  key={`${product.brand}-${pi}`}
                                  brand={product.brand}
                                  price={product.price}
                                  platform={product.platform}
                                  imageUrl={product.imageUrl}
                                  link={product.link}
                                  title={product.title}
                                  description={product.description}
                                  reviewCount={product.reviewCount}
                                  matchReasons={product.matchReasons}
                                  index={pi}
                                />
                              ))}
                            </div>
                          </div>
                        ) : isLoading ? (
                          /* Skeleton loading */
                          <div className="space-y-2">
                            <span className="text-[9px] font-mono text-on-surface-variant tracking-widest uppercase animate-pulse">
                              Searching products...
                            </span>
                            <div className="flex gap-3">
                              {[0, 1, 2].map((i) => (
                                <div
                                  key={i}
                                  className="bg-surface-dim border border-border rounded-lg overflow-hidden shrink-0"
                                  style={{ width: "calc(33.333% - 8px)", minWidth: "140px" }}
                                >
                                  <div className="w-full aspect-square bg-border/20 relative overflow-hidden">
                                    <motion.div
                                      className="absolute inset-0"
                                      style={{
                                        background:
                                          "linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)",
                                        backgroundSize: "200% 100%",
                                      }}
                                      animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
                                      transition={{
                                        duration: 1.5,
                                        repeat: Infinity,
                                        ease: "linear",
                                        delay: i * 0.2,
                                      }}
                                    />
                                  </div>
                                  <div className="p-3 space-y-2">
                                    <div className="h-2.5 w-16 bg-border rounded" />
                                    <div className="h-2.5 w-12 bg-border rounded" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <EmptyResults onSuggestionClick={onSuggestionClick} />
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
