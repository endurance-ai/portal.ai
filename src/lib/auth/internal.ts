import "server-only"
import {NextResponse} from "next/server"
import {timingSafeEqual} from "node:crypto"

/**
 * Internal API auth — 크롤러 등 신뢰된 서비스가 호출하는 endpoint 보호.
 *
 * 환경변수 INTERNAL_API_KEY 필수. request header X-Internal-Key 와 정확히 일치해야 통과.
 * 양쪽 (kiko.ai-app + crawler 등) 에 동일 값 설정.
 *
 * 보안:
 * - timing-safe 비교 (crypto.timingSafeEqual) — 사이드채널 oracle 방지
 * - 최소 16자 강제 (단순 brute force 가드)
 *
 * 사용:
 *   const gate = requireInternalKey(request)
 *   if (gate instanceof NextResponse) return gate
 *   // 통과 — endpoint 본체 진행
 */
export function requireInternalKey(request: Request): NextResponse | true {
  const expected = process.env.INTERNAL_API_KEY
  if (!expected || expected.length < 16) {
    return NextResponse.json(
      {ok: false, error: "INTERNAL_API_KEY not configured on server"},
      {status: 500},
    )
  }
  const provided = request.headers.get("x-internal-key")
  if (!provided) {
    return NextResponse.json(
      {ok: false, error: "unauthorized (missing X-Internal-Key)"},
      {status: 401},
    )
  }
  // 길이 다르면 timingSafeEqual 이 throw. 길이 체크 후 비교 (timing 차이 무시 가능).
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json(
      {ok: false, error: "unauthorized (invalid X-Internal-Key)"},
      {status: 401},
    )
  }
  return true
}
