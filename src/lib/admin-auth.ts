import "server-only"
import {cache} from "react"
import {NextResponse} from "next/server"
import {createSupabaseServer} from "@/lib/supabase-server"
import {supabase as supabaseAdmin} from "@/lib/supabase"
import type {User} from "@supabase/supabase-js"

export type AdminStatus = "pending" | "approved" | "rejected"

export type AdminStatusResult =
  | { user: null; status: null }
  | { user: User; status: AdminStatus | null }

/**
 * Fetch the current admin's status from admin_profiles.
 * Returns status = null if the user row is missing (treat as not approved).
 * Memoized per-request via React.cache so layout + API routes share a single DB hit.
 */
export const getAdminStatus = cache(async (): Promise<AdminStatusResult> => {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) return { user: null, status: null }

  const { data } = await supabaseAdmin
    .from("admin_profiles")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle()

  return { user, status: (data?.status as AdminStatus) ?? null }
})

/**
 * API route guard: returns a NextResponse error when not approved, or { user } when OK.
 * Usage:
 *   const gate = await requireApprovedAdmin()
 *   if (gate instanceof NextResponse) return gate
 *   const { user } = gate
 */
export async function requireApprovedAdmin(): Promise<NextResponse | { user: User }> {
  const { user, status } = await getAdminStatus()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (status !== "approved") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return { user }
}
