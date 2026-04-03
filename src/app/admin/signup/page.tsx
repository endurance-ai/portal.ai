"use client"

import { useState } from "react"
import Link from "next/link"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Clock } from "lucide-react"

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

    // 1. Supabase Auth에 유저 생성
    const { error: authError } = await supabase.auth.signUp({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // 2. admin_users 테이블에 승인 대기 상태로 등록
    const { error: dbError } = await supabase.from("users").insert({
      email,
      role: "member",
      status: "pending",
    })

    if (dbError && !dbError.message.includes("duplicate")) {
      setError(dbError.message)
      setLoading(false)
      return
    }

    // 3. 바로 로그아웃 (승인 전까지 접근 불가)
    await supabase.auth.signOut()

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Clock className="size-5 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-bold">Pending approval</h1>
          <p className="text-sm text-muted-foreground">
            Your account <strong>{email}</strong> has been registered.<br />
            An admin will approve your access.
          </p>
          <Link href="/admin/login">
            <Button variant="outline" className="mt-4">Back to login</Button>
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
          <h1 className="text-xl font-bold tracking-tight">Request access</h1>
          <p className="text-sm text-muted-foreground">Submit a request to join portal.ai admin</p>
        </div>
        <form onSubmit={handleSignup} className="space-y-4 border border-border rounded-lg p-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" minLength={6} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={loading}>
            {loading ? "Submitting..." : "Request access"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already approved?{" "}
          <Link href="/admin/login" className="text-foreground underline underline-offset-4 hover:text-primary">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
