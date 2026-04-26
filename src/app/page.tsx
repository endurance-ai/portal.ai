import type {Metadata} from "next"
import {Wordmark} from "@/components/ui/wordmark"
import {FindClient} from "./_components/find-client"

export const metadata: Metadata = {
  title: "PORTAL — Paste any Instagram post. We'll tell you where to buy the fit.",
  description: "Paste any Instagram post. We'll tell you where to buy the fit.",
}

export default function HomePage() {
  return (
    <main className="min-h-screen bg-cream text-ink flex flex-col">
      <header className="px-6 md:px-14 py-5 flex items-center justify-between border-b border-line">
        <Wordmark />
      </header>

      <FindClient />

      <footer className="px-6 md:px-14 py-6 flex items-center justify-between text-[10px] tracking-[0.14em] uppercase text-ink-quiet border-t border-line">
        <span>PORTAL</span>
        <span>POC</span>
      </footer>
    </main>
  )
}
