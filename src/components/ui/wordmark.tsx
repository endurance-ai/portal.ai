import {cn} from "@/lib/utils"

interface WordmarkProps {
  href?: string
  className?: string
  size?: "sm" | "md"
}

/**
 * PORTAL tracked caps wordmark.
 * docs/design/system.md §4.1 참조. 데스크탑 16px, 모바일 14px.
 */
export function Wordmark({href = "/", className, size = "md"}: WordmarkProps) {
  const inner = (
    <span
      className={cn(
        "font-semibold text-ink uppercase tracking-[0.32em]",
        size === "md" ? "text-base" : "text-sm",
        className,
      )}
    >
      PORTAL
    </span>
  )

  if (!href) return inner
  return (
    <a href={href} className="hover:opacity-70 transition-opacity">
      {inner}
    </a>
  )
}
