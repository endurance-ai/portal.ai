import Link from "next/link"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {Plus} from "lucide-react"

type Row = {
  id: number
  code: string
  name_en: string
  name_ko: string
  mood: string | null
  keywords_en: string[]
  keywords_ko: string[]
  is_active: boolean
  updated_at: string
}

export default async function StyleNodesPage() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        관리자 권한이 필요합니다.
      </div>
    )
  }

  const {data, error} = await supabase
    .from("style_nodes")
    .select(
      "id, code, name_en, name_ko, mood, keywords_en, keywords_ko, is_active, updated_at",
    )
    .order("code")

  if (error) {
    return (
      <div className="p-6 text-sm text-destructive">
        오류: {error.message}
      </div>
    )
  }

  const rows = (data ?? []) as Row[]
  const activeCount = rows.filter((r) => r.is_active).length

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">스타일 노드</h1>
          <p className="text-sm text-muted-foreground mt-1">
            전체 {rows.length}개 · 활성 {activeCount}개. 클릭해서 편집.
          </p>
        </div>
        <Link
          href="/admin/style-nodes/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background px-3 py-1.5 text-sm hover:opacity-90"
        >
          <Plus className="size-4" />
          새 노드
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5 w-16">code</th>
              <th className="text-left px-4 py-2.5">name (en / ko)</th>
              <th className="text-left px-4 py-2.5 hidden md:table-cell">mood</th>
              <th className="text-left px-4 py-2.5 w-32 hidden lg:table-cell">keywords</th>
              <th className="text-left px-4 py-2.5 w-20">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.code}
                className="border-t border-border hover:bg-muted/30"
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/style-nodes/${r.code}`}
                    className="font-mono font-semibold underline-offset-2 hover:underline"
                  >
                    {r.code}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/style-nodes/${r.code}`}
                    className="block hover:text-foreground"
                  >
                    <div className="font-medium">{r.name_en}</div>
                    <div className="text-xs text-muted-foreground">{r.name_ko}</div>
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell max-w-md truncate">
                  {r.mood ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">
                  en {r.keywords_en.length} · ko {r.keywords_ko.length}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      r.is_active
                        ? "inline-flex items-center gap-1 text-emerald-500 text-xs"
                        : "inline-flex items-center gap-1 text-muted-foreground text-xs"
                    }
                  >
                    <span
                      className={
                        r.is_active
                          ? "size-1.5 rounded-full bg-emerald-500"
                          : "size-1.5 rounded-full bg-muted-foreground"
                      }
                    />
                    {r.is_active ? "활성" : "비활성"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
