import Link from "next/link"
import {NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"
import {Plus} from "lucide-react"

type Row = {
  id: number
  situation: string
  version: string
  is_active: boolean
  model_id: string | null
  max_tokens: number
  temperature: number
  notes: string | null
  created_by: string | null
  updated_at: string
}

export default async function PromptsPage() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        관리자 권한이 필요합니다.
      </div>
    )
  }

  const {data, error} = await supabase
    .from("prompts")
    .select(
      "id, situation, version, is_active, model_id, max_tokens, temperature, notes, created_by, updated_at",
    )
    .order("situation")
    .order("is_active", {ascending: false})
    .order("created_at", {ascending: false})

  if (error) {
    return (
      <div className="p-6 text-sm text-destructive">오류: {error.message}</div>
    )
  }

  const rows = (data ?? []) as Row[]
  const grouped = new Map<string, Row[]>()
  for (const r of rows) {
    const list = grouped.get(r.situation) ?? []
    list.push(r)
    grouped.set(r.situation, list)
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">프롬프트</h1>
          <p className="text-sm text-muted-foreground mt-1">
            이미지 분류·검색 프롬프트 관리. 용도별 활성 1개 유지.
          </p>
        </div>
        <Link
          href="/admin/prompts/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background px-3 py-1.5 text-sm hover:opacity-90"
        >
          <Plus className="size-4" />
          새 버전
        </Link>
      </div>

      <div className="space-y-8">
        {[...grouped.entries()].map(([situation, list]) => (
          <section key={situation}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-mono text-sm font-semibold">{situation}</h2>
              <span className="text-xs text-muted-foreground">
                {list.length} version · active{" "}
                {list.filter((r) => r.is_active).length}
              </span>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 w-24">version</th>
                    <th className="text-left px-4 py-2 w-20">상태</th>
                    <th className="text-left px-4 py-2 hidden md:table-cell">model</th>
                    <th className="text-left px-4 py-2 hidden lg:table-cell w-32">notes</th>
                    <th className="text-left px-4 py-2 hidden lg:table-cell w-40">created_by · updated</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-border hover:bg-muted/30"
                    >
                      <td className="px-4 py-2 font-mono">
                        <Link
                          href={`/admin/prompts/${r.id}`}
                          className="underline-offset-2 hover:underline font-medium"
                        >
                          {r.version}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
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
                      <td className="px-4 py-2 text-xs text-muted-foreground hidden md:table-cell">
                        {r.model_id ?? "—"} · tok {r.max_tokens} · t {r.temperature}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground hidden lg:table-cell max-w-xs truncate">
                        {r.notes ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground hidden lg:table-cell">
                        {r.created_by ?? "—"}
                        <br />
                        {new Date(r.updated_at).toLocaleString("ko-KR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
