"use client"

import {useCallback, useEffect, useState} from "react"
import {useRouter, useSearchParams} from "next/navigation"
import Link from "next/link"
import {ArrowLeft, Loader2, Save} from "lucide-react"

type Existing = {
  id: number
  situation: string
  version: string
  system_md: string
  user_md: string
  placeholders: Record<string, unknown>
  model_id: string | null
  max_tokens: number
  temperature: number
}

const SITUATIONS = ["vision-analyze", "prompt-search", "brand-vlm"] as const

export default function NewPromptPage() {
  const router = useRouter()
  const params = useSearchParams()
  const cloneId = params.get("clone")

  const [situation, setSituation] = useState<string>(SITUATIONS[0])
  const [version, setVersion] = useState("")
  const [systemMd, setSystemMd] = useState("")
  const [userMd, setUserMd] = useState("")
  const [placeholdersJson, setPlaceholdersJson] = useState("{}")
  const [modelId, setModelId] = useState("gpt-4o-mini")
  const [maxTokens, setMaxTokens] = useState(1200)
  const [temperature, setTemperature] = useState(0.0)
  const [notes, setNotes] = useState("")
  const [activate, setActivate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingClone, setLoadingClone] = useState(!!cloneId)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!cloneId) return
    fetch(`/api/admin/prompts/${cloneId}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? "load failed")
        return d.prompt as Existing
      })
      .then((p) => {
        setSituation(p.situation)
        setVersion("")
        setSystemMd(p.system_md)
        setUserMd(p.user_md)
        setPlaceholdersJson(JSON.stringify(p.placeholders ?? {}, null, 2))
        setModelId(p.model_id ?? "")
        setMaxTokens(p.max_tokens)
        setTemperature(p.temperature)
        setLoadingClone(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e))
        setLoadingClone(false)
      })
  }, [cloneId])

  const save = useCallback(async () => {
    setError(null)
    if (!version.trim() || version.length > 30) {
      setError("version 은 1-30자")
      return
    }
    if (!systemMd.trim() || !userMd.trim()) {
      setError("system_md, user_md 필수")
      return
    }
    let placeholders: unknown
    try {
      placeholders = JSON.parse(placeholdersJson)
    } catch (e) {
      setError(`placeholders JSON parse: ${e instanceof Error ? e.message : String(e)}`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          situation,
          version,
          system_md: systemMd,
          user_md: userMd,
          placeholders,
          model_id: modelId || null,
          max_tokens: maxTokens,
          temperature,
          notes: notes || null,
          activate,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "create failed")
      router.push(`/admin/prompts/${data.prompt.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }, [
    activate,
    maxTokens,
    modelId,
    notes,
    placeholdersJson,
    router,
    situation,
    systemMd,
    temperature,
    userMd,
    version,
  ])

  if (loadingClone) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/admin/prompts"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          돌아가기
        </Link>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-foreground text-background px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          생성
        </button>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight mb-1">새 프롬프트 버전</h1>
      <p className="text-xs text-muted-foreground mb-6">
        {cloneId ? `버전 #${cloneId} 복제` : "신규 생성"}
      </p>
      {error && <div className="mb-4 text-sm text-destructive">{error}</div>}

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="situation" htmlFor="f-situation">
            <select
              id="f-situation"
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm"
            >
              {SITUATIONS.map((s) => (
                <option key={s} value={s} className="bg-background">
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="version" htmlFor="f-version" hint="자유 (예: v2, v2-strict)">
            <input
              id="f-version"
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="v2"
              maxLength={30}
              className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm font-mono"
            />
          </Field>
        </div>

        <Field label="system_md" htmlFor="f-system">
          <textarea
            id="f-system"
            rows={14}
            value={systemMd}
            onChange={(e) => setSystemMd(e.target.value)}
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-xs font-mono"
            spellCheck={false}
          />
        </Field>

        <Field label="user_md" htmlFor="f-user">
          <textarea
            id="f-user"
            rows={4}
            value={userMd}
            onChange={(e) => setUserMd(e.target.value)}
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-xs font-mono"
            spellCheck={false}
          />
        </Field>

        <Field label="placeholders (JSON)" htmlFor="f-placeholders">
          <textarea
            id="f-placeholders"
            rows={6}
            value={placeholdersJson}
            onChange={(e) => setPlaceholdersJson(e.target.value)}
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-xs font-mono"
            spellCheck={false}
          />
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <Field label="model_id" htmlFor="f-model">
            <input
              id="f-model"
              type="text"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm"
            />
          </Field>
          <Field label="max_tokens" htmlFor="f-tokens">
            <input
              id="f-tokens"
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value) || 0)}
              className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm"
            />
          </Field>
          <Field label="temperature" htmlFor="f-temp">
            <input
              id="f-temp"
              type="number"
              step="0.05"
              min="0"
              max="2"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
              className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <Field label="notes" htmlFor="f-notes">
          <input
            id="f-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="변경 사유 / 메모"
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm"
          />
        </Field>

        <Field label="activate" htmlFor="f-activate">
          <div className="inline-flex items-center gap-2 text-sm">
            <input
              id="f-activate"
              type="checkbox"
              checked={activate}
              onChange={(e) => setActivate(e.target.checked)}
            />
            <span>
              생성 직후 active 로 전환 (같은 situation 의 다른 버전 자동 비활성)
            </span>
          </div>
        </Field>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label
          htmlFor={htmlFor}
          className="text-xs uppercase tracking-wider font-medium text-muted-foreground"
        >
          {label}
        </label>
        {hint && (
          <span className="text-[11px] text-muted-foreground/60">{hint}</span>
        )}
      </div>
      {children}
    </div>
  )
}
