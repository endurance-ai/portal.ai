import type {Metadata} from "next"
import {Analytics} from "@vercel/analytics/next"
import {ThemeProvider} from "@/components/admin/theme-provider"
import {LocaleProvider} from "@/lib/i18n"
import {Toaster} from "@/components/ui/sonner"
import "./globals.css"

export const metadata: Metadata = {
  title: "PORTAL — The look you love, piece by piece.",
  description:
    "Upload a photograph or describe a mood. We return every piece that could belong.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="light h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <ThemeProvider>
          <LocaleProvider>
            {children}
          </LocaleProvider>
        </ThemeProvider>
        <Toaster richColors position="bottom-right" />
        <Analytics />
      </body>
    </html>
  )
}
