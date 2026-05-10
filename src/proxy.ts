// Next.js 16 proxy convention.
// Auth.js v5 의 authorized 콜백을 1차 가드로 등록 — admin layout 의 getAdminStatus() 가 2차.
//
// Next.js 16 proxy 는:
//  - 항상 Node.js runtime 에서 동작 (bcryptjs / pg 등 Node-only 모듈 OK)
//  - `export const config` 자체가 금지 — matcher / runtime 모두 옵션 없음
//
// 모든 request 가 이 함수를 거치며, path 필터링은 auth.ts 의 authorized 콜백에서 처리.
// admin 외 path 는 콜백 첫 줄에서 `return true` 로 즉시 통과.
export { auth as proxy } from "@/auth"
