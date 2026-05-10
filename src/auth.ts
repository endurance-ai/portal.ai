import "server-only"
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import {pool} from "@/lib/db"

export type AdminStatus = "pending" | "approved" | "rejected"

export const { handlers, auth, signIn, signOut } = NextAuth({
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
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/admin/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.status = user.status
      }
      return token
    },
    async session({ session, token }) {
      // next-auth@5 beta module augmentation 의 JWT 인터페이스 추론이 callback 인자에서
      // 깨지는 케이스가 있어 명시적 단언으로 처리.
      const id = token.id as string | undefined
      const status = token.status as AdminStatus | undefined
      if (session.user && id && status) {
        session.user.id = id
        session.user.status = status
      }
      return session
    },
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl
      if (!pathname.startsWith("/admin")) return true
      const PUBLIC = ["/admin/login", "/admin/signup", "/admin/pending"]
      if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true
      if (!session?.user) return false
      return session.user.status === "approved"
    },
  },
  trustHost: true,
})
