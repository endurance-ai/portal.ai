"use client"

import {useCallback, useEffect, useState} from "react"
import {useParams, useRouter} from "next/navigation"
import Link from "next/link"
import {ArrowLeft, Loader2, Save, Trash2} from "lucide-react"

type Node = {
  id: number
  code: string
  name_en: string
  name_ko: string
  mood: string | null
  include_rule: string | null
  exclude_rule: string | null
  keywords_en: string[]
  keywords_ko: string[]
  is_active: boolean
}

type Form = Omit<Node, "id" | "code">

export default function StyleNodeEditPage() {
  const router = useRouter()
  const params = useParams<{code: string}>()
  const code = params.code

  const [original, setOriginal] = useState<Node | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/style-nodes/${code}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) {
          throw new Error(d.error ?? `failed to load ${code}`)
        }
        return d.node as Node
      })
      .then((node) => {
        setOriginal(node)
        setForm({
          name_en: node.name_en,
          name_ko: node.name_ko,
          mood: node.mood,
          include_rule: node.include_rule,
          exclude_rule: node.exclude_rule,
          keywords_en: node.keywords_en,
          keywords_ko: node.keywords_ko,
          is_active: node.is_active,
        })
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
  }, [code])

  const save = useCallback(async () => {
    if (!form) return
    setSaving(true)
    setError(null)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/style-nodes/${code}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? "save failed")
      }
      setOriginal(data.node)
      setMsg("저장됨")
      setTimeout(() => setMsg(null), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }, [code, form])

  const deactivate = useCallback(async () => {
    if (!form) return
    if (!confirm(`정말 ${code} 노드를 비활성화 하시겠습니까?`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/style-nodes/${code}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "deactivate failed")
      }
      router.push("/admin/style-nodes")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }, [code, form, router])

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
        {error ?? "노드를 찾을 수 없음"}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/admin/style-nodes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          돌아가기
        </Link>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-emerald-500">{msg}</span>}
          {error && <span className="text-xs text-destructive">{error}</span>}
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
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            저장
          </button>
        </div>
      </div>

      <div className="mb-6">
        <div className="font-mono text-3xl font-bold tracking-tight">{code}</div>
        <div className="text-xs text-muted-foreground mt-0.5">code 는 변경 불가</div>
      </div>

      <div className="space-y-5">
        <Row label="name_en" htmlFor="f-name-en">
          <input
            id="f-name-en"
            type="text"
            value={form.name_en}
            onChange={(e) => setForm({...form, name_en: e.target.value})}
            className="input"
          />
        </Row>

        <Row label="name_ko" htmlFor="f-name-ko">
          <input
            id="f-name-ko"
            type="text"
            value={form.name_ko}
            onChange={(e) => setForm({...form, name_ko: e.target.value})}
            className="input"
          />
        </Row>

        <Row label="mood" htmlFor="f-mood" hint="한 줄 무드 (en). VLM prompt 에 주입됨">
          <input
            id="f-mood"
            type="text"
            value={form.mood ?? ""}
            onChange={(e) => setForm({...form, mood: e.target.value || null})}
            className="input"
          />
        </Row>

        <Row label="include_rule" htmlFor="f-include" hint="포함 기준 (en). 구체적 시그널">
          <textarea
            id="f-include"
            rows={4}
            value={form.include_rule ?? ""}
            onChange={(e) => setForm({...form, include_rule: e.target.value || null})}
            className="input"
          />
        </Row>

        <Row label="exclude_rule" htmlFor="f-exclude" hint="제외 기준 + dispatch (e.g. → B). 경계 disambiguation">
          <textarea
            id="f-exclude"
            rows={4}
            value={form.exclude_rule ?? ""}
            onChange={(e) => setForm({...form, exclude_rule: e.target.value || null})}
            className="input"
          />
        </Row>

        <Row label="keywords_en" hint="VLM 매칭 단서. Enter 또는 콤마로 구분">
          <TagInput
            value={form.keywords_en}
            onChange={(v) => setForm({...form, keywords_en: v})}
          />
        </Row>

        <Row label="keywords_ko" hint="admin 한글 보조 (VLM 미사용)">
          <TagInput
            value={form.keywords_ko}
            onChange={(v) => setForm({...form, keywords_ko: v})}
          />
        </Row>

        <Row label="is_active">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({...form, is_active: e.target.checked})}
            />
            <span>{form.is_active ? "활성" : "비활성"}</span>
          </label>
        </Row>
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          background: transparent;
          border: 1px solid hsl(var(--border));
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 14px;
          color: hsl(var(--foreground));
        }
        :global(.input:focus) {
          outline: none;
          border-color: hsl(var(--foreground) / 0.3);
        }
      `}</style>
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
        {hint && <span className="text-[11px] text-muted-foreground/60">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function TagInput({
  value,
  onChange,
}: {
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [input, setInput] = useState("")
  const add = (t: string) => {
    const trimmed = t.trim()
    if (!trimmed) return
    if (value.includes(trimmed)) return
    onChange([...value, trimmed])
    setInput("")
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            add(input)
          } else if (e.key === "Backspace" && input === "" && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => add(input)}
        placeholder="Enter 또는 , 로 추가"
        className="input"
      />
    </div>
  )
}
