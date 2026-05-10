import "server-only"
import {createClient} from "@supabase/supabase-js"

// Next.js production build 시 page data collection 단계에서 모든 라우트 모듈이
// import 됨. Docker 빌드 환경엔 SUPABASE_* env 가 없어서 module-load throw 가
// 빌드를 깨뜨림 (#37 deploy-dev 첫 빌드에서 노출).
//
// 정책: 빌드 시엔 placeholder 로 client 생성 (실 사용 X), 런타임에만 env 검증.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!isBuildPhase) {
  if (!supabaseUrl) {
    throw new Error("Missing environment variable: SUPABASE_URL")
  }
  if (!supabaseKey) {
    throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY")
  }
}

// `||` (not `??`) so empty-string env vars also fall back to placeholder.
// CI 의 secrets.SUPABASE_URL 이 비어있는 (또는 미설정) 경우에도 build 통과.
export const supabase = createClient(
  supabaseUrl || "https://build-time-placeholder.supabase.co",
  supabaseKey || "build-time-placeholder-key"
)
