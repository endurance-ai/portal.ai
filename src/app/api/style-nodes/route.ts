import {NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {fetchActiveStyleNodes} from "@/lib/style-nodes-db"

/**
 * GET /api/style-nodes — 활성 스타일 노드 목록 (admin-gated).
 *
 * 클라이언트 (admin UI, debugger 등) 가 노드 목록 표시할 때 사용.
 * include/exclude/mood/keywords 는 비즈니스 IP 라 admin 인증 필수.
 * 비-admin 컨텍스트에서 코드+이름만 필요하면 별도 minimal endpoint 추가 고려.
 */
export async function GET() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const nodes = await fetchActiveStyleNodes()
    return NextResponse.json({nodes})
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({error: message}, {status: 500})
  }
}
