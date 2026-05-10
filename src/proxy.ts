// Next.js 16 proxy convention. 1차 가드.
// edge bundle 로 빠지므로 Node-only 모듈 import 금지 — auth.config.ts 만 import.
// Credentials authorize() (bcryptjs + pg) 는 auth.ts 의 별도 인스턴스에 격리.
import NextAuth from "next-auth"
import {authConfig} from "@/auth.config"

const { auth } = NextAuth(authConfig)
export { auth as proxy }
