"use client"

import {LogOut, Moon, Sun} from "lucide-react"
import {useTheme} from "next-themes"
import {signOut} from "next-auth/react"
import {Button} from "@/components/ui/button"

export function Header({ email }: { email?: string }) {
  const { theme, setTheme } = useTheme()

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/admin/login" })
  }

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-3 bg-background">
      <span className="text-sm text-muted-foreground md:hidden font-bold">
        portal.ai <span className="font-normal">admin</span>
      </span>
      <div className="flex items-center gap-2 ml-auto">
        <span className="text-sm text-muted-foreground hidden sm:block">{email}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="테마 전환"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="size-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="로그아웃"
          onClick={handleLogout}
        >
          <LogOut className="size-3.5" />
        </Button>
      </div>
    </header>
  )
}
