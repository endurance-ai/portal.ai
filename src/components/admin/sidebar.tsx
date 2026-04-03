"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Database, BarChart3, FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  {
    href: "/admin/genome",
    label: "브랜드 DB",
    description: "브랜드/노드 관리",
    icon: Database,
  },
  {
    href: "/admin/analytics",
    label: "분석 로그",
    description: "분석 기록 & 활동",
    icon: BarChart3,
  },
  {
    href: "/admin/eval",
    label: "품질 평가",
    description: "품질 평가 허브",
    icon: FlaskConical,
  },
] as const

export function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-52 flex-col border-r border-border bg-sidebar p-4 gap-1">
        <Link
          href="/admin"
          className="text-base font-bold tracking-tight text-sidebar-foreground mb-6 px-2"
        >
          portal.ai{" "}
          <span className="text-muted-foreground font-normal text-sm">admin</span>
        </Link>

        {NAV_ITEMS.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors",
              pathname.startsWith(href)
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}
          >
            <Icon className="size-4 shrink-0" />
            <div>
              <span className="text-sm leading-none">{label}</span>
              <span className="block text-[11px] text-muted-foreground/70 mt-0.5 leading-none">
                {description}
              </span>
            </div>
          </Link>
        ))}
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)]">
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
