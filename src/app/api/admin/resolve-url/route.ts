import "server-only"
import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {resolveUrl} from "@/domains/admin-tools/search-debug/ai-client"
import {isAllowedSocialPostUrl} from "@/domains/admin-tools/search-debug/url-allow"

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate
  const body = (await request.json().catch(() => ({}))) as {url?: string}
  if (!body.url || typeof body.url !== "string") {
    return NextResponse.json({ok: false, error: "url required"}, {status: 400})
  }
  // SSRF 방어: ai/ 서버로 forward 되기 전에 IG/Pinterest 도메인만 허용
  if (!isAllowedSocialPostUrl(body.url)) {
    return NextResponse.json(
      {ok: false, error: "only Instagram or Pinterest URLs are allowed"},
      {status: 403}
    )
  }
  const result = await resolveUrl({url: body.url})
  return NextResponse.json(result)
}
