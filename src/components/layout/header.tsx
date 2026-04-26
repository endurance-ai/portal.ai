"use client"

import Link from "next/link"
import {usePathname} from "next/navigation"
import {Wordmark} from "@/components/ui/wordmark"
import {cn} from "@/lib/utils"
import {useLocale} from "@/lib/i18n"

const NAV = [
  {href: "/", label: "Index"},
]

export function Header() {
  const pathname = usePathname()
  const {locale, setLocale} = useLocale()

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
          <button
            type="button"
            onClick={() => setLocale(locale === "en" ? "ko" : "en")}
            className="text-[13px] font-medium tracking-[-0.01em] text-ink-soft hover:text-ink transition-colors"
          >
            {locale === "en" ? "EN" : "KO"}
          </button>
        </div>
      </nav>
    </header>
  )
}
