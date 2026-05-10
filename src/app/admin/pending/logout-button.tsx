"use client"

import {useState} from "react"
import {signOut} from "next-auth/react"
import {Button} from "@/components/ui/button"

export function LogoutButton() {
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    setLoading(true)
    try {
      await signOut({ callbackUrl: "/admin/login" })
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
