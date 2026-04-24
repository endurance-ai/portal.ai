"use client"

import {useState, type FormEvent} from "react"

const LIME = "#D9FF00"

export type RefinementKind = "cheaper" | "same-mood" | "different-vibe" | "prompt"

export interface RefinementPayload {
  kind: RefinementKind
  prompt?: string
}

export function RefinementBar({
  onRefine,
  busy,
}: {
  onRefine: (p: RefinementPayload) => void
  busy: boolean
}) {
  const [prompt, setPrompt] = useState("")

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed || busy) return
    onRefine({kind: "prompt", prompt: trimmed})
  }

  const chips: Array<{key: RefinementKind; label: string; hint: string}> = [
    {key: "cheaper", label: "cheaper", hint: "under ₩100k"},
    {key: "same-mood", label: "same mood", hint: "diff brand"},
    {key: "different-vibe", label: "different vibe", hint: "shake it up"},
  ]

  return (
    <div className="border border-line bg-white p-5 md:p-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-[10px] tracking-[0.24em] uppercase text-ink-quiet">
          not quite?
        </span>
        <span className="text-[12px] text-ink-soft">nudge it.</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            disabled={busy}
            onClick={() => onRefine({kind: c.key})}
            className="flex items-center gap-2 px-4 py-[10px] border border-line bg-cream hover:border-ink hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-[12px] font-medium text-ink">{c.label}</span>
            <span className="text-[10px] tracking-[0.08em] text-ink-quiet">
              {c.hint}
            </span>
          </button>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-stretch gap-2 mt-1"
      >
        <input
          type="text"
          placeholder="or tell us what to tweak — e.g. 'more 90s', 'muted tones only'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
          maxLength={120}
          className="flex-1 h-[46px] px-4 bg-cream border border-line text-[13px] text-ink placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !prompt.trim()}
          style={{
            backgroundColor: busy || !prompt.trim() ? "#1a1a1a" : LIME,
            color: busy || !prompt.trim() ? "#888" : "#0a0a0a",
          }}
          className="h-[46px] px-5 text-[11px] font-semibold tracking-[0.18em] uppercase transition-colors disabled:cursor-not-allowed"
        >
          {busy ? "searching…" : "re-search"}
        </button>
      </form>
    </div>
  )
}
