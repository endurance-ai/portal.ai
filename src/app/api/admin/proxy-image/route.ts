import "server-only"
import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"

// 어드민 검색 디버거 — IG/Pinterest CDN 이미지를 브라우저에 보여주기 위한 thin proxy.
// IG CDN 은 Cross-Origin-Resource-Policy: cross-origin 을 보내 브라우저 <img> 로
// 직접 로드가 차단됨. 같은 URL 을 Modal 은 서버 fetch 로 받을 수 있음 (embed 정상).
// 이 라우트는 어드민 인증 게이트 + 호스트 화이트리스트 (SSRF 방어) 적용.

const ALLOWED_HOST_SUFFIXES = [
  "cdninstagram.com",
  "fbcdn.net",
  "pinimg.com",
  "ytimg.com",
]

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const url = request.nextUrl.searchParams.get("url")
  if (!url) return NextResponse.json({error: "url required"}, {status: 400})

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({error: "invalid url"}, {status: 400})
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({error: "only http(s)"}, {status: 400})
  }
  const host = parsed.hostname.toLowerCase()
  if (!ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) {
    return NextResponse.json({error: `host '${host}' not allowed`}, {status: 403})
  }

  // SSRF 방어: redirect 따라가지 않음 (whitelisted host 가 3xx 로 내부 IP 보낼 수 있음)
  const upstream = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; KikoAdminProxy/1.0)",
    },
    redirect: "manual",
  })
  if (upstream.status >= 300 && upstream.status < 400) {
    return NextResponse.json({error: "upstream redirect rejected"}, {status: 502})
  }
  if (!upstream.ok) {
    return NextResponse.json(
      {error: `upstream ${upstream.status}`},
      {status: 502}
    )
  }

  // content-type 화이트리스트 — image/* 만 통과시켜 HTML/JS 등 active content 차단
  const upstreamCT = upstream.headers.get("content-type") ?? "image/jpeg"
  if (!upstreamCT.toLowerCase().startsWith("image/")) {
    return NextResponse.json(
      {error: `non-image content-type: ${upstreamCT}`},
      {status: 415}
    )
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstreamCT,
      "cache-control": "private, max-age=300",
    },
  })
}
