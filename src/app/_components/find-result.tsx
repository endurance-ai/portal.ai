"use client"

const LIME = "#D9FF00"

interface Slide {
  orderIndex: number
  r2Url: string
  isVideo?: boolean
  taggedUsers?: Array<{username: string}>
}

interface MentionedUser {
  username: string
  fullName?: string | null
  source: "caption" | "tag"
}

interface MergedItem {
  category: string
  subcategory?: string
  name?: string
  colorFamily?: string
  fit?: string
  slideIndex: number
}

interface SearchProduct {
  brand: string
  title: string
  price: string
  platform: string
  imageUrl: string
  link: string
}

interface ResolvedBrand {
  handle: string
  brandName: string
  matchKind: string
}

export interface FindResultData {
  scrapeId: string
  shortcode: string
  ownerHandle: string
  caption: string | null
  slides: Slide[]
  mentionedUsers: MentionedUser[]
  mergedItems: MergedItem[]
  strongMatches: Array<{id: string; products: SearchProduct[]}>
  general: Array<{id: string; products: SearchProduct[]}>
  resolvedBrands: ResolvedBrand[]
}

export function FindResult({data}: {data: FindResultData}) {
  return (
    <div className="flex flex-col gap-12">
      <PostStrip
        ownerHandle={data.ownerHandle}
        caption={data.caption}
        slides={data.slides}
      />
      <TagRow
        mentioned={data.mentionedUsers}
        resolved={data.resolvedBrands}
      />
      <StrongMatches groups={data.strongMatches} />
      <GeneralGrid groups={data.general} slideCount={data.slides.length} />
    </div>
  )
}

function PostStrip({
  ownerHandle,
  caption,
  slides,
}: {
  ownerHandle: string
  caption: string | null
  slides: Slide[]
}) {
  if (slides.length === 0) return null
  const cols = slides.length >= 4 ? 4 : Math.max(2, slides.length)
  return (
    <div className="border border-line bg-white">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
        <span className="text-[10px] tracking-[0.24em] uppercase text-ink-quiet">
          from post
        </span>
        <span className="text-[13px] font-medium text-ink">
          @{ownerHandle}
        </span>
        <span className="text-[11px] tracking-[0.08em] uppercase text-ink-quiet">
          · {slides.length} look{slides.length > 1 ? "s" : ""}
        </span>
      </div>
      <div
        className="grid gap-[1px] bg-line"
        style={{gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`}}
      >
        {slides.map((s) => (
          <div key={s.orderIndex} className="relative aspect-[4/5] bg-white overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.r2Url}
              alt={`look ${s.orderIndex + 1}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 left-2 px-2 py-[2px] bg-ink text-cream text-[9px] tracking-[0.18em] uppercase">
              {String(s.orderIndex + 1).padStart(2, "0")}
            </div>
          </div>
        ))}
      </div>
      {caption && (
        <div className="px-5 py-4 border-t border-line text-[12px] leading-[1.6] text-ink-soft">
          <span className="text-ink-quiet mr-2">caption:</span>
          {caption.length > 400 ? `${caption.slice(0, 400)}…` : caption}
        </div>
      )}
    </div>
  )
}

function TagRow({
  mentioned,
  resolved,
}: {
  mentioned: MentionedUser[]
  resolved: ResolvedBrand[]
}) {
  if (mentioned.length === 0) return null
  const resolvedSet = new Set(resolved.map((r) => r.handle))
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] tracking-[0.24em] uppercase text-ink-quiet mr-2">
        tagged
      </span>
      {mentioned.map((u) => {
        const stocked = resolvedSet.has(u.username)
        return (
          <div
            key={u.username}
            className="flex items-center gap-2 px-3 py-[6px] border border-line bg-white text-[12px]"
          >
            <span className="text-ink font-medium">@{u.username}</span>
            {stocked ? (
              <span
                className="text-[9px] tracking-[0.18em] uppercase px-[6px] py-[1px] font-semibold"
                style={{backgroundColor: LIME, color: "#0a0a0a"}}
              >
                stocked
              </span>
            ) : (
              <span className="text-[9px] tracking-[0.18em] uppercase text-ink-quiet">
                not carried
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StrongMatches({
  groups,
}: {
  groups: Array<{id: string; products: SearchProduct[]}>
}) {
  const flat = groups.flatMap((g) => g.products).slice(0, 6)
  if (flat.length === 0) return null
  return (
    <div>
      <div className="flex items-baseline gap-3 mb-5">
        <h2 className="text-[22px] md:text-[26px] font-semibold tracking-[-0.01em] text-ink">
          prob. this exact one.
        </h2>
        <span className="text-[10px] tracking-[0.18em] uppercase text-ink-quiet">
          tagged brand match
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[1px] bg-line border border-line">
        {flat.map((p, i) => (
          <ProductCard key={`${p.link}-${i}`} product={p} strong />
        ))}
      </div>
    </div>
  )
}

function GeneralGrid({
  groups,
  slideCount,
}: {
  groups: Array<{id: string; products: SearchProduct[]}>
  slideCount: number
}) {
  const flat = groups.flatMap((g) =>
    g.products.map((p) => ({...p, _groupId: g.id}))
  )
  if (flat.length === 0) return null
  return (
    <div>
      <div className="flex items-baseline gap-3 mb-5">
        <h2 className="text-[22px] md:text-[26px] font-semibold tracking-[-0.01em] text-ink">
          or steal the vibe.
        </h2>
        <span className="text-[10px] tracking-[0.18em] uppercase text-ink-quiet">
          {flat.length} matches across {slideCount} look{slideCount > 1 ? "s" : ""}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[1px] bg-line border border-line">
        {flat.map((p, i) => (
          <ProductCard key={`${p.link}-${i}`} product={p} />
        ))}
      </div>
    </div>
  )
}

function ProductCard({
  product,
  strong = false,
}: {
  product: SearchProduct
  strong?: boolean
}) {
  return (
    <a
      href={product.link}
      target="_blank"
      rel="noreferrer"
      className="relative bg-white group"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={product.imageUrl}
        alt={product.title}
        className="w-full aspect-[4/5] object-cover"
      />
      {strong && (
        <div
          className="absolute top-3 left-3 px-2 py-[3px] text-[9px] tracking-[0.18em] uppercase font-semibold"
          style={{backgroundColor: LIME, color: "#0a0a0a"}}
        >
          tagged
        </div>
      )}
      <div
        className={
          strong
            ? "p-4 flex flex-col gap-1 border-t border-line"
            : "p-3 flex flex-col gap-[2px]"
        }
      >
        <span className="text-[9px] tracking-[0.18em] uppercase text-ink-quiet">
          {product.brand}
        </span>
        <span
          className={
            strong
              ? "text-[14px] text-ink leading-tight"
              : "text-[12px] text-ink leading-tight truncate"
          }
        >
          {product.title.replace(`${product.brand} `, "")}
        </span>
        <span
          className={
            strong
              ? "text-[13px] font-mono text-ink mt-1"
              : "text-[11px] font-mono text-ink mt-[2px]"
          }
        >
          {product.price}
        </span>
      </div>
    </a>
  )
}
