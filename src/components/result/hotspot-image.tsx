"use client"

import { motion } from "framer-motion"
import Image from "next/image"

export interface Hotspot {
  id: string
  label: string
  top: string
  left: string
}

interface HotspotImageProps {
  imageUrl: string
  hotspots: Hotspot[]
  activeHotspot: string | null
  onHotspotClick: (id: string) => void
}

export function HotspotImage({
  imageUrl,
  hotspots,
  activeHotspot,
  onHotspotClick,
}: HotspotImageProps) {
  return (
    <div className="rounded-[2rem] overflow-hidden bg-white shadow-[0_40px_80px_rgba(46,51,54,0.08)] group">
      <div className="relative aspect-[3/4]">
        <Image
          src={imageUrl}
          alt="Uploaded outfit"
          fill
          className="object-cover group-hover:grayscale-0 transition-all duration-700"
        />

        {/* Hotspot dots */}
        {hotspots.map((spot) => (
          <motion.button
            key={spot.id}
            className="absolute w-4 h-4 z-10"
            style={{ top: spot.top, left: spot.left }}
            onClick={() => onHotspotClick(spot.id)}
            whileHover={{ scale: 1.3 }}
            whileTap={{ scale: 0.9 }}
          >
            {/* Pulse ring */}
            <motion.span
              className="absolute inset-0 rounded-full bg-white/60"
              animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            {/* Dot */}
            <span
              className={`relative block w-full h-full rounded-full shadow-lg transition-colors duration-200 ${
                activeHotspot === spot.id
                  ? "bg-moodfit-primary"
                  : "bg-white"
              }`}
            />
          </motion.button>
        ))}
      </div>

      {/* Image footer */}
      <div className="p-4 flex items-center justify-between">
        <h2 className="text-lg font-black tracking-tighter uppercase text-moodfit-on-surface">
          The Look
        </h2>
        <span className="text-xs font-medium text-moodfit-on-surface-variant tracking-widest uppercase">
          AI Analysis
        </span>
      </div>
    </div>
  )
}
