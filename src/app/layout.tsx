import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "MOODFIT | AI Style Analysis",
  description:
    "Upload one outfit photo and our AI extracts the mood, palette, and style DNA.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-moodfit-surface text-moodfit-on-surface font-sans">
        {children}
      </body>
    </html>
  )
}
