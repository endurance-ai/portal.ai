import { createSupabaseServer } from "@/lib/supabase-server"
import { Sidebar } from "@/components/admin/sidebar"
import { Header } from "@/components/admin/header"
import { ThemeProvider } from "@/components/admin/theme-provider"

export const metadata = { title: "portal.ai Admin" }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <ThemeProvider>
        <div className="min-h-dvh bg-background text-foreground">
          {children}
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <div className="flex h-dvh bg-background text-foreground">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header email={user.email} />
          <main className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4">
            {children}
          </main>
        </div>
      </div>
    </ThemeProvider>
  )
}
