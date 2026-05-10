import {redirect} from "next/navigation"

export default function SignupPage() {
  // Auth.js 전환 후 셀프 가입 비활성화. 계정은 DB 에서 직접 발급.
  redirect("/admin/login")
}
