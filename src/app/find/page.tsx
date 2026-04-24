import type {Metadata} from "next"
import Link from "next/link"
import {Wordmark} from "@/components/ui/wordmark"
import {FindClient} from "./_components/find-client"

export const metadata: Metadata = {
  title: "Find — PORTAL",
  description: "Paste any Instagram post. We'll tell you where to buy the fit.",
}

export default function FindLandingPage() {
  return (
    <main className="min-h-screen bg-cream text-ink flex flex-col">
      <header className="px-6 md:px-14 py-5 flex items-center justify-between border-b border-line">
        <div className="flex items-center gap-4">
          <Wordmark href="/" />
          <span className="text-[10px] tracking-[0.24em] uppercase text-ink-quiet">
            / find
          </span>
        </div>
        <Link
          href="/"
          className="text-[11px] tracking-[0.14em] uppercase text-ink-quiet hover:text-ink transition-colors"
        >
          back to index
        </Link>
      </header>

      <FindClient />

      <footer className="px-6 md:px-14 py-6 flex items-center justify-between text-[10px] tracking-[0.14em] uppercase text-ink-quiet border-t border-line">
        <span>PORTAL · FIND</span>
        <span>POC</span>
      </footer>
    </main>
  )
}
