import "server-only"
import {Pool} from "pg"

declare global {
  var __pgPool: Pool | undefined
}

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"

function createPool(): Pool {
  const raw = process.env.DATABASE_URL
  if (!raw) {
    if (isBuildPhase) {
      return new Pool({ connectionString: "postgresql://build:build@localhost:5432/build" })
    }
    throw new Error("Missing environment variable: DATABASE_URL")
  }

  // pg v8.16+ 가 connection string 의 `sslmode=require` 를 verify-full 로 격상.
  // dev-app Postgres 는 self-signed cert 라 verify-full 통과 못 함.
  // → connection string 에서 sslmode 파라미터를 분리하고, ssl 옵션을 명시적으로 우리가 제어.
  const url = new URL(raw)
  const sslmode = url.searchParams.get("sslmode")
  url.searchParams.delete("sslmode")
  const cleaned = url.toString()

  // 기본: SSL 켜고 self-signed 허용. 명시적 disable 만 평문.
  const ssl = sslmode === "disable" ? false : { rejectUnauthorized: false }

  return new Pool({ connectionString: cleaned, ssl, max: 10 })
}

export const pool: Pool = globalThis.__pgPool ?? createPool()
if (process.env.NODE_ENV !== "production" && !isBuildPhase) {
  globalThis.__pgPool = pool
}

// idle client 에러는 uncaughtException 으로 프로세스 종료할 수 있음 (pg 공식 권고)
pool.on("error", (err) => {
  console.error("[db] idle client error", err)
})
