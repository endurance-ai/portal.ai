import {redirect} from "next/navigation"
import {Clock} from "lucide-react"
import {getAdminStatus} from "@/lib/admin-auth"
import {LogoutButton} from "./logout-button"

export default async function PendingPage() {
  const { user, status } = await getAdminStatus()

  if (!user) {
    redirect("/admin/login")
  }

  if (status === "approved") {
    redirect("/admin/genome")
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
            <Clock className="size-5 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-balance">관리자 승인 대기 중</h1>
          <p className="text-sm text-muted-foreground">
            가입이 완료되었습니다. 관리자 승인 후 접근 가능합니다.
          </p>
        </div>
        <div className="space-y-4 border border-border rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground break-all">{user.email}</p>
          <LogoutButton />
        </div>
      </div>
    </div>
  )
}
