"use client"

import {useCallback, useEffect, useState} from "react"
import {useParams, useRouter} from "next/navigation"
import Link from "next/link"
import {ArrowLeft, Loader2, Save, Trash2, Zap} from "lucide-react"

type Prompt = {
  id: number
  situation: string
  version: string
  is_active: boolean
  system_md: string
  user_md: string
  placeholders: Record<string, unknown>
  model_id: string | null
  max_tokens: number
  temperature: number
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type Form = {
  system_md: string
  user_md: string
  placeholders_json: string
  model_id: string
  max_tokens: number
  temperature: number
  notes: string
  is_active: boolean
}

export default function PromptEditPage() {
  const router = useRouter()
  const {id} = useParams<{id: string}>()

  const [original, setOriginal] = useState<Prompt | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/prompts/${id}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? `failed to load ${id}`)
        return d.prompt as Prompt
      })
      .then((p) => {
        setOriginal(p)
        setForm({
          system_md: p.system_md,
          user_md: p.user_md,
          placeholders_json: JSON.stringify(p.placeholders ?? {}, null, 2),
          model_id: p.model_id ?? "",
          max_tokens: p.max_tokens,
          temperature: p.temperature,
          notes: p.notes ?? "",
          is_active: p.is_active,
        })
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
  }, [id])

  const save = useCallback(async () => {
    if (!form) return
    setSaving(true)
    setError(null)
    setMsg(null)

    let placeholders: unknown
    try {
      placeholders = JSON.parse(form.placeholders_json)
      if (typeof placeholders !== "object" || placeholders === null) {
        throw new Error("placeholders must be a JSON object")
      }
    } catch (e) {
      setError(`placeholders JSON parse error: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
      return
    }

    try {
      const res = await fetch(`/api/admin/prompts/${id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          system_md: form.system_md,
          user_md: form.user_md,
          placeholders,
          model_id: form.model_id || null,
          max_tokens: form.max_tokens,
          temperature: form.temperature,
          notes: form.notes || null,
          is_active: form.is_active,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "save failed")
      setOriginal(data.prompt)
      setMsg("저장됨")
      setTimeout(() => setMsg(null), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }, [form, id])

  const activate = useCallback(async () => {
    if (!confirm("이 버전을 active 로 전환합니까? 같은 situation 의 다른 버전은 자동 비활성됩니다.")) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/prompts/${id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({is_active: true}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "activate failed")
      setOriginal(data.prompt)
      setForm((f) => (f ? {...f, is_active: true} : f))
      setMsg("activate 완료")
      setTimeout(() => setMsg(null), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }, [id])

  const deactivate = useCallback(async () => {
    if (!confirm("비활성화 하시겠습니까?")) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/prompts/${id}`, {method: "DELETE"})
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "deactivate failed")
      }
      router.push("/admin/prompts")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }, [id, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  if (!form || !original) {
    return (
      <div className="p-6 text-destructive text-sm">
        {error ?? "프롬프트를 찾을 수 없음"}
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
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-emerald-500">{msg}</span>}
          {error && <span className="text-xs text-destructive">{error}</span>}
          {!original.is_active && (
            <button
              onClick={activate}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 text-emerald-500 px-2.5 py-1 text-xs hover:bg-emerald-500/10 disabled:opacity-40"
            >
              <Zap className="size-3.5" />
              Activate
            </button>
          )}
          <button
            onClick={deactivate}
            disabled={saving || !original.is_active}
            className="inline-flex items-center gap-1 rounded-md border border-destructive/40 text-destructive px-2.5 py-1 text-xs hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
            비활성
          </button>
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
            저장
          </button>
        </div>
      </div>

      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <div className="font-mono text-xs text-muted-foreground">{original.situation}</div>
          <div className="font-mono text-2xl font-bold tracking-tight">{original.version}</div>
        </div>
        <div className="text-xs text-right text-muted-foreground">
          <div>
            상태:{" "}
            <span
              className={
                original.is_active ? "text-emerald-500" : "text-muted-foreground"
              }
            >
              {original.is_active ? "활성" : "비활성"}
            </span>
          </div>
          <div className="font-mono mt-0.5">id={original.id}</div>
        </div>
      </div>

      <div className="space-y-5">
        <Row label="system_md" htmlFor="f-system" hint="VLM 시스템 프롬프트 본문 (placeholder 포함)">
          <textarea
            id="f-system"
            rows={18}
            value={form.system_md}
            onChange={(e) => setForm({...form, system_md: e.target.value})}
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-xs font-mono"
            spellCheck={false}
          />
        </Row>

        <Row label="user_md" htmlFor="f-user" hint="user role 프롬프트 (placeholder 포함)">
          <textarea
            id="f-user"
            rows={6}
            value={form.user_md}
            onChange={(e) => setForm({...form, user_md: e.target.value})}
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-xs font-mono"
            spellCheck={false}
          />
        </Row>

        <Row
          label="placeholders (JSON)"
          htmlFor="f-placeholders"
          hint='{TOKEN: {source: "style_nodes"|"static"|"enums"|"runtime", field?: ...}}'
        >
          <textarea
            id="f-placeholders"
            rows={10}
            value={form.placeholders_json}
            onChange={(e) =>
              setForm({...form, placeholders_json: e.target.value})
            }
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-xs font-mono"
            spellCheck={false}
          />
        </Row>

        <div className="grid grid-cols-3 gap-4">
          <Row label="model_id" htmlFor="f-model">
            <input
              id="f-model"
              type="text"
              value={form.model_id}
              onChange={(e) => setForm({...form, model_id: e.target.value})}
              placeholder="e.g. gpt-4o-mini"
              className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm"
            />
          </Row>
          <Row label="max_tokens" htmlFor="f-tokens">
            <input
              id="f-tokens"
              type="number"
              value={form.max_tokens}
              onChange={(e) =>
                setForm({...form, max_tokens: parseInt(e.target.value) || 0})
              }
              className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm"
            />
          </Row>
          <Row label="temperature" htmlFor="f-temp">
            <input
              id="f-temp"
              type="number"
              step="0.05"
              min="0"
              max="2"
              value={form.temperature}
              onChange={(e) =>
                setForm({...form, temperature: parseFloat(e.target.value) || 0})
              }
              className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm"
            />
          </Row>
        </div>

        <Row label="notes" htmlFor="f-notes" hint="변경 사유 / 메모">
          <textarea
            id="f-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({...form, notes: e.target.value})}
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm"
          />
        </Row>
      </div>
    </div>
  )
}

function Row({
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
          <span className="text-[11px] text-muted-foreground/60 font-mono">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
