import { createSupabaseServer } from "@/lib/supabase-server"
import { ThemeProvider } from "@/components/admin/theme-provider"
import { Sidebar } from "@/components/admin/sidebar"
import { Header } from "@/components/admin/header"

export const metadata = {
  title: "portal.ai Admin",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "portal.ai",
  },
}

export const viewport = {
  themeColor: "#09090B",
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <ThemeProvider>
        <div className="dark min-h-dvh bg-background text-foreground">
          {children}
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <div className="dark flex h-dvh bg-background text-foreground">
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
