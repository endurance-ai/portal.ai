"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { HotspotImage, type Hotspot } from "./hotspot-image"
import { ProductCard, type Product } from "./product-card"

export interface LookItem {
  id: string
  category: string
  name: string
  thumbnailUrl: string
  products: Product[]
}

interface LookBreakdownProps {
  imageUrl: string
  moodTags: { label: string; score: number }[]
  palette: { hex: string; label: string }[]
  items: LookItem[]
  onTryAnother: () => void
}

// Map item categories to hotspot positions
const HOTSPOT_POSITIONS: Record<string, { top: string; left: string }> = {
  outer: { top: "25%", left: "45%" },
  top: { top: "40%", left: "48%" },
  bottom: { top: "58%", left: "45%" },
  shoes: { top: "85%", left: "42%" },
}

export function LookBreakdown({
  imageUrl,
  moodTags,
  palette,
  items,
  onTryAnother,
}: LookBreakdownProps) {
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null)

  const hotspots: Hotspot[] = items.map((item) => ({
    id: item.id,
    label: item.category,
    top: HOTSPOT_POSITIONS[item.id]?.top ?? "50%",
    left: HOTSPOT_POSITIONS[item.id]?.left ?? "50%",
  }))

  return (
    <div className="w-full max-w-7xl mx-auto space-y-12">
      {/* Mood bar + palette */}
      <motion.section
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-6"
      >
        <div className="flex flex-wrap gap-3">
          {moodTags.map((tag) => (
            <span
              key={tag.label}
              className="px-5 py-2 rounded-full bg-gradient-to-r from-moodfit-primary-container/50 to-moodfit-secondary-container/50 text-moodfit-on-primary-container text-sm font-semibold tracking-wide shadow-sm"
            >
              {tag.label} {tag.score}%
            </span>
          ))}
        </div>

        <div className="flex items-center gap-4 p-2 bg-white/70 backdrop-blur-xl border border-moodfit-outline/10 rounded-full px-6">
          <div className="flex -space-x-2">
            {palette.map((color) => (
              <div
                key={color.hex}
                className="w-8 h-8 rounded-full border-2 border-moodfit-surface"
                style={{ backgroundColor: color.hex }}
                title={color.hex}
              />
            ))}
          </div>
          <span className="text-xs font-bold tracking-widest text-moodfit-on-surface-variant uppercase">
            Extracted Palette
          </span>
        </div>
      </motion.section>

      {/* Main grid: image + breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start relative">
        {/* SVG connector lines (desktop) */}
        <svg
          className="absolute inset-0 pointer-events-none hidden lg:block"
          width="100%"
          height="100%"
          style={{ overflow: "visible" }}
        >
          {items.map((item, i) => {
            const yStart = 150 + i * 200
            const yEnd = 100 + i * 220
            return (
              <motion.path
                key={item.id}
                d={`M 420 ${yStart} Q 520 ${yStart} 540 ${yEnd}`}
                stroke="#adb3b6"
                strokeWidth="1"
                fill="none"
                strokeDasharray="4"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: 1,
                  opacity: activeHotspot === item.id ? 0.8 : 0.3,
                }}
                transition={{ duration: 0.8, delay: i * 0.15 }}
              />
            )
          })}
        </svg>

        {/* Left: outfit image with hotspots */}
        <motion.div
          className="lg:col-span-5"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <HotspotImage
            imageUrl={imageUrl}
            hotspots={hotspots}
            activeHotspot={activeHotspot}
            onHotspotClick={setActiveHotspot}
          />
        </motion.div>

        {/* Right: item breakdown */}
        <div className="lg:col-span-7 space-y-10">
          <AnimatePresence>
            {items.map((item, itemIndex) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  scale: activeHotspot === item.id ? 1.02 : 1,
                }}
                transition={{ delay: itemIndex * 0.15, duration: 0.5 }}
                className="space-y-4"
              >
                {/* Item header */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-moodfit-surface-container overflow-hidden relative">
                    <img
                      src={item.thumbnailUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-moodfit-primary uppercase tracking-widest">
                      {item.category}
                    </p>
                    <h3 className="text-sm font-bold text-moodfit-on-surface">
                      {item.name}
                    </h3>
                  </div>
                </div>

                {/* Product grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {item.products.map((product, productIndex) => (
                    <ProductCard
                      key={`${product.brand}-${product.price}`}
                      product={product}
                      index={productIndex}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Action buttons */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
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
