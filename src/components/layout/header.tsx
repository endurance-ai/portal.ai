"use client"

import { UserCircle } from "lucide-react"

export function Header() {
  return (
    <header className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-xl">
      <nav className="flex justify-between items-center px-8 py-5 max-w-7xl mx-auto">
        <div className="text-2xl font-black tracking-tighter text-moodfit-on-surface">
          MOODFIT
        </div>
        <div className="flex items-center gap-6">
          <UserCircle className="size-6 text-moodfit-primary cursor-pointer hover:opacity-80 transition-opacity active:scale-95" />
        </div>
      </nav>
    </header>
  )
}
