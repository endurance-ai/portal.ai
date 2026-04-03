"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createSupabaseBrowser()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    router.push("/admin/genome")
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
        <p className="text-center text-sm text-muted-foreground">
          계정이 없으신가요?{" "}
          <Link href="/admin/signup" className="text-foreground underline underline-offset-4 hover:text-primary">회원가입</Link>
        </p>
      </div>
    </div>
  )
}
