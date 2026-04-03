"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Database, BarChart3, FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/admin/genome", label: "Genome", icon: Database },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/eval", label: "Eval", icon: FlaskConical },
] as const

export function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-52 flex-col border-r border-border bg-sidebar p-4 gap-1">
        <Link href="/admin" className="text-sm font-bold tracking-tight text-sidebar-foreground mb-6 px-2">
          portal.ai <span className="text-muted-foreground font-normal">admin</span>
        </Link>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              pathname.startsWith(href)
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-sidebar">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors",
              pathname.startsWith(href)
                ? "text-sidebar-foreground"
                : "text-muted-foreground"
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  )
}
