/* 
  Root layout utama untuk PWA Mans Cell.
  Revisi:
  - metadata manifest dan icon disamakan dengan icon v2
  - background root/html/body dipaksa putih agar transisi PWA tidak hitam
  - theme color tetap konsisten dengan layout Mans Cell
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
  description:
    "Sistem operasional Mans Cell untuk transaksi, stok, laporan, dan absensi karyawan.",
  applicationName: "Mans Cell",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mans Cell",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192-v4.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512-v4.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcut: ["/icons/icon-192-v4.png"],
  },
}

export const viewport: Viewport = {
  themeColor: "#3d78eb",
  colorScheme: "light",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} bg-white`}
      style={{ backgroundColor: "#ffffff", colorScheme: "light" }}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen bg-white text-slate-900 antialiased"
        style={{ backgroundColor: "#ffffff" }}
      >
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}