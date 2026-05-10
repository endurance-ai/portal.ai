import type {DefaultSession} from "next-auth"

// AdminStatus 타입은 src/auth.ts 의 단일 진실. 변경 시 함께 업데이트.
type AdminStatus = "pending" | "approved" | "rejected"

declare module "next-auth" {
  interface User {
    status?: AdminStatus
  }
  interface Session {
    user: {
      id: string
      status: AdminStatus
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    status?: AdminStatus
  }
}
