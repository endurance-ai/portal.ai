import {redirect} from "next/navigation"

// 공개 IG 플로우 제거 (admin 전용 전환). 루트는 어드민으로 리다이렉트.
export default function RootPage() {
  redirect("/admin")
}
