"use client"

import {useCallback, useState} from "react"
import {useRouter} from "next/navigation"
import {Loader2, Play} from "lucide-react"

type Result = {
  ok: boolean
  processed: number
  classified?: number
  queued?: number
  failed?: number
  message?: string
}

export function ProcessRerunsButton({pendingCount}: {pendingCount: number}) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (!confirm(`${pendingCount}개 rerun 처리할까요? (동시성 4, OpenAI 호출)`)) return
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/admin/brand-node-review/process-reruns", {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "process failed")
      setResult(data)
      setTimeout(() => router.refresh(), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }, [pendingCount, router])

  if (pendingCount === 0) return null

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={running}
        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 text-white px-3 py-1.5 text-sm hover:bg-blue-700 disabled:opacity-50"
      >
        {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        Process {pendingCount} Reruns
      </button>
      {result && (
        <span className="text-xs text-emerald-500">
          ✓ {result.processed}건 처리 (classified {result.classified}, queued {result.queued}, failed {result.failed})
        </span>
      )}
      {error && <span className="text-xs text-destructive">❌ {error}</span>}
    </div>
  )
}
