import "server-only"
import {cache} from "react"
import {NextResponse} from "next/server"
import {type AdminStatus, auth} from "@/auth"

export type { AdminStatus }

export type SessionUser = {
  id: string
  email: string
  status: AdminStatus
}

export type AdminStatusResult =
  | { user: null; status: null }
  | { user: SessionUser; status: AdminStatus }

/**
 * Auth.js JWT 세션에서 admin user + status 를 반환.
 * 세션이 없으면 user=null. React.cache 로 요청당 1회 평가.
 */
export const getAdminStatus = cache(async (): Promise<AdminStatusResult> => {
  const session = await auth()
  const user = session?.user
  if (!user?.id || !user.email || !user.status) return { user: null, status: null }
  return {
    user: { id: user.id, email: user.email, status: user.status },
    status: user.status,
  }
})

export async function requireApprovedAdmin(): Promise<NextResponse | { user: SessionUser }> {
  const { user, status } = await getAdminStatus()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (status !== "approved") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return { user }
}
