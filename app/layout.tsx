/* 
  Root layout utama untuk PWA Mans Cell.
  File ini mengaktifkan metadata aplikasi, manifest, icon iPhone/Android, theme color,
  dan membungkus seluruh halaman dengan ClientLayout agar service worker, tombol install,
  dan panduan install iPhone bisa berjalan global.
*/

import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import ClientLayout from "./ClientLayout"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "Mans Cell",
    template: "%s | Mans Cell",
  },
  description: "Sistem absensi karyawan",
  applicationName: "Mans Cell",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mans Cell",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/icons/icon-192.png"],
  },
}

export const viewport: Viewport = {
  themeColor: "#047857",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id">
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen flex flex-col antialiased bg-white text-slate-900`}
      >
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}