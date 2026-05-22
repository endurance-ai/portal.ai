import type {Metadata} from "next"
import {Analytics} from "@vercel/analytics/next"
import {Toaster} from "@/components/ui/sonner"
import "./globals.css"

export const metadata: Metadata = {
  title: "kiko.ai Admin",
  description: "kiko.ai 운영 어드민",
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
        {children}
        <Toaster richColors position="bottom-right" />
        <Analytics />
      </body>
    </html>
  )
}
