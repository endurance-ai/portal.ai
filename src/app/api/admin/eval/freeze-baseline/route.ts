import { NextResponse } from "next/server"
import { requireApprovedAdmin } from "@/lib/admin-auth"
import { freezeBaseline } from "@/lib/eval/run-snapshot"

// SPEC-V6-EVAL T-013 — Baseline freeze (REQ-V6-EVAL-004)

export async function POST() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const result = await freezeBaseline()
    return NextResponse.json(result)
  } catch (e) {
    const msg = (e as Error).message
    if (/no v4 aggregate row/.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 404 })
    }
    if (/baseline already frozen/.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
