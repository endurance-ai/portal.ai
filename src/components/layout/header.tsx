"use client"

import Link from "next/link"
import {UserCircle} from "lucide-react"
import {useLocale} from "@/lib/i18n"
import {cn} from "@/lib/utils"

export function Header() {
  const {locale, setLocale} = useLocale()

  return (
    <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <nav className="flex justify-between items-center px-8 py-4 max-w-7xl mx-auto">
        <Link href="/" className="text-xl font-extrabold tracking-tighter text-foreground hover:opacity-80 transition-opacity">
          portal<span className="text-muted-foreground">.ai</span>
        </Link>
        <div className="flex items-center gap-4">
          {/* Language Toggle */}
          <div className="flex items-center bg-card border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setLocale("en")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono font-medium transition-colors",
                locale === "en"
                  ? "bg-primary text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="text-sm leading-none">🇺🇸</span>
              EN
            </button>
            <button
              onClick={() => setLocale("ko")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono font-medium transition-colors",
                locale === "ko"
                  ? "bg-primary text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="text-sm leading-none">🇰🇷</span>
              KO
            </button>
          </div>

          <button aria-label="Account">
            <UserCircle className="size-5 text-outline cursor-pointer hover:text-primary transition-colors active:scale-95" />
          </button>
        </div>
      </nav>
    </header>
  )
}
