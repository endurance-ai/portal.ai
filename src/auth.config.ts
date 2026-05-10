// Edge-safe Auth.js config. proxy.ts 가 이 파일만 import.
// 절대 Node-only 의존성 (bcryptjs, pg, server-only 등) import 금지.
// Credentials provider 의 authorize() 는 auth.ts 에서 추가 (DB/bcrypt 호출).
import type {NextAuthConfig} from "next-auth"

export type AdminStatus = "pending" | "approved" | "rejected"

export const authConfig = {
  providers: [], // Credentials 는 auth.ts 에서 합쳐줌
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
} satisfies NextAuthConfig
