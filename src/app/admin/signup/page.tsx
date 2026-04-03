"use client"

import { useState } from "react"
import Link from "next/link"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Mail } from "lucide-react"

export default function SignupPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createSupabaseBrowser()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error: authError } = await supabase.auth.signUp({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Mail className="size-5 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-bold text-balance">이메일을 확인해주세요</h1>
          <p className="text-sm text-muted-foreground">
            <strong>{email}</strong>으로 확인 링크를 보냈습니다.<br />
            링크를 클릭하여 계정을 활성화하세요.
          </p>
          <Link href="/admin/login">
            <Button variant="outline" className="mt-4">로그인으로 돌아가기</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-10 h-10 rounded-lg border-2 border-dashed border-muted-foreground flex items-center justify-center mb-2">
            <span className="text-muted-foreground font-bold text-sm">+</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-balance">계정 만들기</h1>
          <p className="text-sm text-muted-foreground">portal.ai 어드민 계정 만들기</p>
        </div>
        <form onSubmit={handleSignup} className="space-y-4 border border-border rounded-lg p-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6자 이상" minLength={6} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "생성 중..." : "회원가입"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          이미 계정이 있으신가요?{" "}
          <Link href="/admin/login" className="text-foreground underline underline-offset-4 hover:text-primary">로그인</Link>
        </p>
      </div>
    </div>
  )
}
