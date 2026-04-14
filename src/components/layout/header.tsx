"use client"

import Link from "next/link"
import {usePathname} from "next/navigation"
import {Wordmark} from "@/components/ui/wordmark"
import {cn} from "@/lib/utils"

const NAV = [
  {href: "/", label: "Index"},
  {href: "/archive", label: "Archive"},
  {href: "/about", label: "About"},
]

export function Header() {
  const pathname = usePathname()

  return (
    <header className="fixed top-0 w-full z-50 bg-cream border-b border-line">
      <nav className="flex justify-between items-center px-12 md:px-14 py-5 max-w-[1280px] mx-auto">
        <Wordmark />
        <div className="flex items-center gap-[22px]">
          {NAV.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-[13px] font-medium tracking-[-0.01em] transition-colors",
                  isActive ? "text-ink" : "text-ink-soft hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            )
          })}
          <span className="text-[13px] font-medium text-ink-soft tracking-[-0.01em]">
            EN
          </span>
        </div>
      </nav>
    </header>
  )
}
