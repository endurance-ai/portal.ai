import type {Metadata} from "next"
import {Header} from "@/components/layout/header"
import {Footer} from "@/components/layout/footer"
import {SectionMarker} from "@/components/ui/section-marker"

export const metadata: Metadata = {
  title: "PORTAL — About",
  description:
    "PORTAL reads the look inside a photograph — fabric, cut, proportion — and returns the wardrobe behind it.",
}

export default function AboutPage() {
  return (
    <>
      <Header />
      <main className="flex-grow px-6 md:px-14 pt-28 pb-20 min-h-screen">
        <div className="max-w-[640px] mx-auto">
          <SectionMarker numeral="I." title="What it is" aside="PORTAL / 2026" />

          <h1 className="text-[52px] md:text-[72px] font-medium text-ink tracking-[-0.045em] leading-[0.96] mb-12">
            Read the look.
            <br />
            <span className="font-bold">Return the pieces.</span>
          </h1>

          <div className="space-y-5 text-[15px] font-normal text-ink-muted leading-[1.65] tracking-[-0.01em]">
            <p>
              PORTAL takes a single image — a photograph, an editorial, a screenshot —
              and reads the outfit inside it. Fabric, cut, proportion, the weather it
              belongs to.
            </p>
            <p>
              Then it returns the wardrobe behind it, drawn from a quiet index of
              ateliers. You lock what matters, loosen what does not, and the search
              narrows to what could belong.
            </p>
          </div>

          <div className="mt-14 pt-6 border-t border-line grid grid-cols-3 gap-6 text-[13px] font-medium tracking-[-0.01em]">
            <div>
              <div className="text-ink-quiet text-[11px] uppercase tracking-[0.1em] mb-1">Index</div>
              <div className="text-ink font-semibold">22 ateliers</div>
            </div>
            <div>
              <div className="text-ink-quiet text-[11px] uppercase tracking-[0.1em] mb-1">Located</div>
              <div className="text-ink font-semibold">Seoul</div>
            </div>
            <div>
              <div className="text-ink-quiet text-[11px] uppercase tracking-[0.1em] mb-1">Season</div>
              <div className="text-ink font-semibold">Spring 2026</div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
