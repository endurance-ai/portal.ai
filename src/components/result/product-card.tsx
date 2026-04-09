"use client"

import {useState} from "react"
import {motion, AnimatePresence} from "framer-motion"
import Image from "next/image"
import {ArrowUpRight} from "lucide-react"

function UpgradedImage({ src, alt, fill, sizes, className }: {
  src: string; alt: string; fill?: boolean; sizes?: string; className?: string
}) {
  const [imgSrc, setImgSrc] = useState(() => src.replace("/small/", "/big/"))

  return (
    <Image
      src={imgSrc}
      alt={alt}
      fill={fill}
      sizes={sizes}
      className={className}
      onError={() => { if (imgSrc !== src) setImgSrc(src) }}
    />
  )
}

export interface MatchReason {
  field: string
  value: string
}

export interface ProductCardProps {
  brand: string
  price: string
  platform: string
  imageUrl: string
  link: string
  title?: string
  description?: string
  material?: string
  reviewCount?: number
  matchReasons?: MatchReason[]
  index: number
}

export function ProductCard({
  brand, price, platform, imageUrl, link, title,
  description, reviewCount, matchReasons, index,
}: ProductCardProps) {
  const [showOverlay, setShowOverlay] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
      className="group/card bg-surface-dim border border-border rounded-lg overflow-hidden transition-all duration-200 hover:border-outline/50 hover:-translate-y-0.5 shrink-0 cursor-pointer"
      style={{ width: "calc(33.333% - 8px)", minWidth: "140px" }}
      onMouseEnter={() => setShowOverlay(true)}
      onMouseLeave={() => setShowOverlay(false)}
      onClick={() => setShowOverlay((prev) => !prev)}
    >
      {/* Image: 3:4 aspect, no crop */}
      <div className="relative w-full aspect-[3/4] bg-border/30">
        {imageUrl ? (
          <UpgradedImage
            src={imageUrl}
            alt={title || `${brand} product`}
            fill
            sizes="200px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-border/30" />
        )}

        {/* Overlay */}
        <AnimatePresence>
          {showOverlay && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex flex-col justify-end"
              style={{
                background: "linear-gradient(transparent 0%, rgba(9,9,11,0.85) 25%, rgba(9,9,11,0.95) 100%)",
              }}
            >
              <div className="p-3 space-y-2">
                {/* Match reasons */}
                {matchReasons && matchReasons.length > 0 && (
                  <div>
                    <p className="text-[7px] font-mono font-bold text-turquoise tracking-[0.12em] uppercase mb-1.5">
                      Why this pick
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {matchReasons.map((r) => (
                        <span
                          key={`${r.field}-${r.value}`}
                          className="px-1.5 py-0.5 bg-turquoise/12 border border-turquoise/25 rounded-md text-[8px] font-mono font-semibold text-turquoise whitespace-nowrap"
                        >
                          {r.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description snippet */}
                {description && (
                  <p className="text-[8px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {description}
                  </p>
                )}

                {/* View CTA */}
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center gap-1 py-1.5 bg-primary text-background rounded-md text-[9px] font-mono font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
                >
                  View <ArrowUpRight className="size-3" />
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom info — always visible */}
      <div className="p-2.5 space-y-1">
        <div className="flex justify-between items-start">
          <span className="text-[9px] font-mono font-bold uppercase text-muted-foreground truncate max-w-[55%]">
            {brand}
          </span>
          <span className="text-[11px] font-bold text-primary">{price}</span>
        </div>
        {title && (
          <p className="text-[10px] text-outline truncate">{title}</p>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono text-on-surface-variant">
            {platform}
          </span>
          {!!reviewCount && reviewCount > 0 && (
            <>
              <span className="text-[8px] text-on-surface-variant">·</span>
              <span className="text-[8px] font-mono text-muted-foreground">
                리뷰 {reviewCount}건
              </span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}
