import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export async function POST(request: NextRequest) {
  const { email } = await request.json()

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 })
  }

  // service role로 users 테이블에 직접 insert (RLS 무시)
  const { error } = await supabase.from("users").insert({
    email,
    role: "member",
    status: "pending",
  })

  if (error && !error.message.includes("duplicate")) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
