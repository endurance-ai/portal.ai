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

    // 승인 상태 확인
    const { data: user } = await supabase
      .from("users")
      .select("status, role")
      .eq("email", email)
      .single()

    if (!user) {
      await supabase.auth.signOut()
      setError("No admin account found for this email. Request access first.")
      setLoading(false)
      return
    }

    if (user.status === "pending") {
      await supabase.auth.signOut()
      setError("Your account is pending approval. Please wait for an admin to approve.")
      setLoading(false)
      return
    }

    if (user.status === "rejected") {
      await supabase.auth.signOut()
      setError("Your access request was rejected.")
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
          <h1 className="text-xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Sign in to portal.ai admin</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4 border border-border rounded-lg p-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/admin/signup" className="text-foreground underline underline-offset-4 hover:text-primary">Request access</Link>
        </p>
      </div>
    </div>
  )
}
