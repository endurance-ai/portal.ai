import {cn} from "@/lib/utils"

interface SectionMarkerProps {
  numeral: string      // "I.", "II.", "III."
  title: string        // "A look, broken into its parts"
  aside?: string       // "Preview" / date / etc.
  className?: string
}

/**
 * Roman numeral section marker. DESIGN.md §4.4.
 * border-top 1px #111 + padding-top 18px + margin-bottom 28px.
 */
export function SectionMarker({numeral, title, aside, className}: SectionMarkerProps) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between border-t border-ink pt-[18px] mb-7",
        className,
      )}
    >
      <span className="text-sm font-bold text-ink tracking-[-0.01em]">{numeral}</span>
      <span className="text-sm font-medium text-ink tracking-[-0.01em]">{title}</span>
      {aside ? (
        <span className="text-xs font-medium text-ink-quiet tracking-[-0.01em]">
          {aside}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  )
}
