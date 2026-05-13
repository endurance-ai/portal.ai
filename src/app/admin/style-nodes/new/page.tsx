"use client"

import {useCallback, useState} from "react"
import {useRouter} from "next/navigation"
import Link from "next/link"
import {ArrowLeft, Loader2, Save} from "lucide-react"

export default function NewStyleNodePage() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [nameEn, setNameEn] = useState("")
  const [nameKo, setNameKo] = useState("")
  const [mood, setMood] = useState("")
  const [includeRule, setIncludeRule] = useState("")
  const [excludeRule, setExcludeRule] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(async () => {
    setError(null)
    if (!/^[A-Z]{1,3}$/.test(code)) {
      setError("code 는 대문자 1~3자 (A, AB 등)")
      return
    }
    if (!nameEn.trim() || !nameKo.trim()) {
      setError("name_en, name_ko 필수")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/admin/style-nodes", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          code,
          name_en: nameEn,
          name_ko: nameKo,
          mood: mood || null,
          include_rule: includeRule || null,
          exclude_rule: excludeRule || null,
          keywords_en: [],
          keywords_ko: [],
          is_active: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "create failed")
      router.push(`/admin/style-nodes/${code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }, [code, nameEn, nameKo, mood, includeRule, excludeRule, router])

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/admin/style-nodes"
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
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          생성
        </button>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight mb-6">새 스타일 노드</h1>
      {error && <div className="mb-4 text-sm text-destructive">{error}</div>}

      <div className="space-y-4">
        <Field label="code" hint="대문자 1~3자, immutable (e.g. U, AA)">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="U"
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm font-mono"
            maxLength={3}
          />
        </Field>
        <Field label="name_en">
          <input
            type="text"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="e.g. Athleisure"
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm"
          />
        </Field>
        <Field label="name_ko">
          <input
            type="text"
            value={nameKo}
            onChange={(e) => setNameKo(e.target.value)}
            placeholder="e.g. 애슬레저"
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm"
          />
        </Field>
        <Field label="mood" hint="선택. 생성 후 편집 가능">
          <input
            type="text"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm"
          />
        </Field>
        <Field label="include_rule">
          <textarea
            rows={3}
            value={includeRule}
            onChange={(e) => setIncludeRule(e.target.value)}
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm"
          />
        </Field>
        <Field label="exclude_rule">
          <textarea
            rows={3}
            value={excludeRule}
            onChange={(e) => setExcludeRule(e.target.value)}
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm"
          />
        </Field>
      </div>
    </div>
  )
}

function Field({label, hint, children}: {label: string; hint?: string; children: React.ReactNode}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
          {label}
        </label>
        {hint && <span className="text-[11px] text-muted-foreground/60">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
