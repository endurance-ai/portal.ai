"use client"

import {useState} from "react"
import {useRouter} from "next/navigation"
import {signIn} from "next-auth/react"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Label} from "@/components/ui/label"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })

    if (!res) {
      setError("로그인 요청에 실패했습니다. 잠시 후 다시 시도해주세요.")
      setLoading(false)
      return
    }
    if (res.error) {
      const msg = res.error === "CredentialsSignin"
        ? "이메일 또는 비밀번호가 올바르지 않거나 승인되지 않은 계정입니다."
        : "로그인 중 오류가 발생했습니다."
      setError(msg)
      setLoading(false)
      return
    }

    router.push("/admin/brand-nodes")
    router.refresh()
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-10 h-10 rounded-full bg-primary flex items-center justify-center mb-2">
            <span className="text-primary-foreground font-bold text-sm">P</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-balance">다시 오셨네요</h1>
          <p className="text-sm text-muted-foreground">portal.ai 어드민에 로그인</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4 border border-border rounded-lg p-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          계정 발급은 운영자에게 문의하세요.
        </p>
      </div>
    </div>
  )
}
