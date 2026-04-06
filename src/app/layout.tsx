import type {Metadata} from "next"
import {Roboto, Roboto_Mono} from "next/font/google"
import {Analytics} from "@vercel/analytics/next"
import {ThemeProvider} from "@/components/admin/theme-provider"
import {Toaster} from "@/components/ui/sonner"
import "./globals.css"

const roboto = Roboto({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
})

const robotoMono = Roboto_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "portal.ai | One Photo. Every Option.",
  description:
    "Upload one outfit photo — we break down every piece and find it across platforms.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${roboto.variable} ${robotoMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Toaster richColors position="bottom-right" />
        <Analytics />
      </body>
    </html>
  )
}
