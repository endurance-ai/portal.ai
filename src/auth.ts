import "server-only"
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import {pool} from "@/lib/db"
import {type AdminStatus, authConfig} from "@/auth.config"

export type {AdminStatus}

// Full Auth.js 인스턴스 — Credentials provider + DB lookup 포함 (Node.js 전용).
// proxy.ts 는 이 파일을 import 하지 않음 (auth.config.ts 만 사용).
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.trim().toLowerCase()
        const password = credentials?.password as string | undefined
        // bcrypt 는 72 바이트 초과 입력을 잘라서 처리 (DoS 가능성). 8~72 범위만 허용.
        if (!email || !password || password.length < 8 || password.length > 72) return null

        const { rows } = await pool.query<{
          user_id: string
          email: string
          password_hash: string | null
          status: AdminStatus
        }>(
          "SELECT user_id, email, password_hash, status FROM admin_profiles WHERE lower(email) = $1 LIMIT 1",
          [email]
        )
        const row = rows[0]
        if (!row || !row.password_hash) return null
        // rejected 계정은 JWT 발급 자체를 거부 (재로그인으로 토큰 갱신 차단)
        if (row.status === "rejected") return null

        const ok = await bcrypt.compare(password, row.password_hash)
        if (!ok) return null

        return {
          id: row.user_id,
          email: row.email,
          status: row.status,
        }
      },
    }),
  ],
})
