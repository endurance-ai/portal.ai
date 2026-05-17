import "server-only"
import {createClient} from "@supabase/supabase-js"

// Next.js production build 시 page data collection 단계에서 모든 라우트 모듈이
// import 됨. Docker 빌드 환경엔 DB_* env 가 없어서 module-load throw 가
// 빌드를 깨뜨림 (#37 deploy-dev 첫 빌드에서 노출).
//
// 정책: 빌드 시엔 placeholder 로 client 생성 (실 사용 X), 런타임에만 env 검증.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"

const dbUrl = process.env.DB_URL
const dbToken = process.env.DB_TOKEN

if (!isBuildPhase) {
  if (!dbUrl) {
    throw new Error("Missing environment variable: DB_URL")
  }
  if (!dbToken) {
    throw new Error("Missing environment variable: DB_TOKEN")
  }
}

// `||` (not `??`) so empty-string env vars also fall back to placeholder.
// CI 의 secrets.DB_URL 이 비어있는 (또는 미설정) 경우에도 build 통과.
export const supabase = createClient(
  dbUrl || "http://build-time-placeholder.local",
  dbToken || "build-time-placeholder-token"
)
