import "server-only"
import {NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {listAiModels} from "@/domains/admin-tools/search-debug/ai-client"

export async function GET() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate
  const result = await listAiModels()
  return NextResponse.json(result)
}
