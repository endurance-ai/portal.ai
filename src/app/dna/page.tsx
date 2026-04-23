import type {Metadata} from "next"
import Link from "next/link"
import {Wordmark} from "@/components/ui/wordmark"
import {DnaInput} from "./_components/dna-input"

export const metadata: Metadata = {
  title: "Your Style DNA — PORTAL",
  description: "Drop your Instagram. We'll decode your look.",
}

export default function DnaLandingPage() {
  return (
    <main className="min-h-screen bg-cream text-ink flex flex-col">
      <header className="px-8 md:px-14 py-6 flex items-center justify-between">
        <Wordmark href="/dna" />
        <Link
          href="/"
          className="text-[12px] tracking-[0.12em] uppercase text-ink-quiet hover:text-ink transition-colors"
        >
          Back to index
        </Link>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
        <div className="w-full max-w-[640px] flex flex-col items-center text-center">
          <p className="text-[11px] tracking-[0.32em] uppercase text-ink-quiet mb-10">
            — Style Decoder —
          </p>

          <h1 className="font-sans text-[clamp(44px,9vw,96px)] leading-[0.95] tracking-[-0.03em] text-ink">
            Your Style DNA.
          </h1>

          <p className="mt-8 text-[17px] md:text-[18px] leading-[1.55] text-ink-soft max-w-[420px]">
            Drop your Instagram.
            <br />
            We&apos;ll decode your look.
          </p>

          <div className="w-full mt-14">
            <DnaInput />
          </div>

          <p className="mt-10 text-[11px] tracking-[0.08em] text-ink-quiet max-w-[360px]">
            Public profiles only. We save decoded results to improve recommendations.
          </p>
        </div>
      </section>

      <footer className="px-8 md:px-14 py-6 flex items-center justify-between text-[11px] tracking-[0.12em] uppercase text-ink-quiet">
        <span>PORTAL · DNA</span>
        <span>POC</span>
      </footer>
    </main>
  )
}
