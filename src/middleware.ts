// Auth.js v5 — `authorized` 콜백을 미들웨어로 등록.
// admin layout 의 getAdminStatus() 가 2차 방어선이지만, 이 미들웨어가 1차로 차단.
export { auth as middleware } from "@/auth"

export const config = {
  matcher: ["/admin/:path*"],
}
