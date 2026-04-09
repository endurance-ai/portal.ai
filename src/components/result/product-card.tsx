"use client"

import {useState} from "react"
import {motion} from "framer-motion"
import Image from "next/image"
import {ArrowUpRight, Info, X} from "lucide-react"
import {cn} from "@/lib/utils"
import {useLocale} from "@/lib/i18n"

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
  const {t} = useLocale()
  const [flipped, setFlipped] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
      className="shrink-0"
      style={{ width: "calc(33.333% - 8px)", minWidth: "120px", maxWidth: "200px", perspective: "600px" }}
    >
      <motion.div
        className="relative w-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
      >
        {/* ── Front ── */}
        <div
          className={cn(
            "bg-surface-dim border border-border rounded-lg overflow-hidden transition-colors hover:border-outline/50",
            flipped && "pointer-events-none"
          )}
          style={{ backfaceVisibility: "hidden" }}
        >
          {/* Image */}
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="block relative w-full aspect-[4/5] bg-border/30"
          >
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
          </a>

          {/* Bottom info */}
          <div className="p-2 space-y-0.5">
            {title && (
              <p className="text-[11px] text-foreground font-medium line-clamp-2 leading-snug">{title}</p>
            )}
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono text-muted-foreground truncate">
                {brand}
              </span>
              <span className="text-xs font-bold text-primary shrink-0">{price}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-on-surface-variant truncate">
                {platform}
              </span>
              {(matchReasons?.length || description) && (
                <button
                  onClick={(e) => { e.preventDefault(); setFlipped(true) }}
                  className="size-5 flex items-center justify-center rounded text-muted-foreground hover:text-turquoise hover:bg-turquoise/10 transition-colors shrink-0"
                  aria-label="Details"
                >
                  <Info className="size-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Back ── */}
        <div
          className={cn(
            "absolute inset-0 bg-card border border-border rounded-lg overflow-hidden flex flex-col",
            !flipped && "pointer-events-none"
          )}
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="flex-1 p-3.5 space-y-3 overflow-y-auto">
            {/* Close */}
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono font-bold text-turquoise tracking-[0.1em] uppercase">
                {t("product.whyThisPick")}
              </p>
              <button
                onClick={() => setFlipped(false)}
                className="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Match reasons */}
            {matchReasons && matchReasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {matchReasons.map((r) => (
                  <span
                    key={`${r.field}-${r.value}`}
                    className="px-2 py-1 bg-turquoise/12 border border-turquoise/25 rounded-md text-xs font-mono font-semibold text-turquoise whitespace-nowrap"
                  >
                    {r.value}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            {description && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {description}
              </p>
            )}

            {/* Brand / Title */}
            <div className="space-y-0.5">
              <p className="text-xs font-mono font-bold uppercase text-foreground">{brand}</p>
              {title && <p className="text-xs text-outline">{title}</p>}
            </div>
          </div>

          {/* View CTA */}
          <div className="p-3 border-t border-border">
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-2 bg-primary text-background rounded-md text-xs font-mono font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
            >
              {t("product.view")} <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
