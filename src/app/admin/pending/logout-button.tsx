"use client"

import {useState} from "react"
import {useRouter} from "next/navigation"
import {createSupabaseBrowser} from "@/lib/supabase-browser"
import {Button} from "@/components/ui/button"

export function LogoutButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createSupabaseBrowser()

  const handleLogout = async () => {
    setLoading(true)
    try {
      await supabase.auth.signOut()
      router.push("/admin/login")
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleLogout} variant="outline" className="w-full" disabled={loading}>
      {loading ? "로그아웃 중..." : "로그아웃"}
    </Button>
  )
}
