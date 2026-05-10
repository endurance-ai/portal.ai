// Next.js 16 proxy convention (구 middleware.ts deprecated).
// Auth.js v5 의 authorized 콜백을 1차 가드로 등록 — admin layout 의 getAdminStatus() 가 2차.
//
// runtime: 'nodejs' 강제 — auth.ts 가 bcryptjs + pg (Node-only crypto/socket) 사용하므로
// 기본 edge runtime 에서 못 돔.
export { auth as proxy } from "@/auth"

export const config = {
  matcher: ["/admin/:path*"],
  runtime: "nodejs",
}
