/**
 * Halaman root ringan untuk redirect user secepat mungkin menggunakan cache session lokal,
 * sambil menampilkan splash screen Mans Cell bertema biru dengan deskripsi sistem absensi karyawan.
 */
"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import Image from "next/image"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "@/lib/firebase"

type CachedSession = {
  role?: string
  redirectTo?: string
}

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    const cachedRaw = localStorage.getItem("mans_cell_session")
    const cached: CachedSession | null = cachedRaw ? JSON.parse(cachedRaw) : null

    if (cached?.redirectTo) {
      router.replace(cached.redirectTo)
      return
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      await new Promise((resolve) => setTimeout(resolve, 600))

      if (!user) {
        router.replace("/login")
        return
      }

      router.replace("/login")
    })

    return () => unsub()
  }, [router])

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center"
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="mb-6 flex items-center justify-center w-20 h-20 rounded-2xl bg-white shadow-lg"
        >
          <Image src="/logo.png" alt="Mans Cell" width={80} height={80} priority />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-white text-3xl font-black tracking-wide"
        >
          Mans Cell
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.9 }}
          transition={{ delay: 0.25 }}
          className="text-blue-500 text-sm mt-1"
        >
          Sistem absensi karyawan
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="flex gap-2 mt-8"
        >
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
              className="w-2.5 h-2.5 rounded-full bg-white"
            />
          ))}
        </motion.div>
      </motion.div>
    </main>
  )
}