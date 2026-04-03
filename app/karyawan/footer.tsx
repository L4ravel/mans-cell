"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Fingerprint } from "lucide-react"
import { motion } from "framer-motion"
import { auth, db } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"

export default function Footer() {
  const [bolehAbsensi, setBolehAbsensi] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setBolehAbsensi(false)
        setReady(true)
        return
      }

      try {
        const uid = user.uid
        const hari = new Date().getDay() // 0–6 (5 = Jumat)

        // ===== JUMAT SELALU LIBUR =====
        if (hari === 5) {
          setBolehAbsensi(false)
          setReady(true)
          return
        }

        // ===== AMBIL USER =====
        const userSnap = await getDoc(doc(db, "users", uid))
        if (!userSnap.exists()) {
          setBolehAbsensi(false)
          setReady(true)
          return
        }

        const ptkId = userSnap.data()?.ptkId
        if (!ptkId) {
          setBolehAbsensi(false)
          setReady(true)
          return
        }

        // ===== AMBIL JADWAL PTK =====
        const jadwalSnap = await getDoc(doc(db, "jadwal_ptk", ptkId))

        // ===== JIKA TIDAK ADA JADWAL → BOLEH ABSENSI =====
        if (!jadwalSnap.exists()) {
          setBolehAbsensi(true)
          setReady(true)
          return
        }

        const hariLibur: number[] = jadwalSnap.data()?.hariLibur ?? []

        // ===== CEK HARI LIBUR =====
        if (hariLibur.includes(hari)) {
          setBolehAbsensi(false)
        } else {
          setBolehAbsensi(true)
        }
      } catch {
        setBolehAbsensi(false)
      } finally {
        setReady(true)
      }
    })

    return () => unsub()
  }, [])

  const tombol = (
    <motion.div
      whileHover={bolehAbsensi ? { scale: 1.02 } : {}}
      whileTap={bolehAbsensi ? { scale: 0.98 } : {}}
      className={`flex items-center justify-center gap-3 rounded-[2rem] py-4 px-6
        text-[11px] font-black uppercase tracking-[0.2em] shadow-sm transition-all
        ${
          bolehAbsensi
            ? "bg-gradient-to-r from-emerald-400 to-cyan-500 text-white"
            : "bg-slate-200 text-slate-500 cursor-not-allowed pointer-events-none"
        }`}
    >
      <Fingerprint size={20} strokeWidth={2.5} />
      {bolehAbsensi ? "Konfirmasi Absensi" : "Tidak ada jadwal"}
    </motion.div>
  )

  if (!ready) return null

  return (
    <div className="fixed bottom-0 left-0 w-full border-t border-slate-200 bg-white shadow-sm z-40">
      <div className="mx-auto max-w-5xl p-4">
        {bolehAbsensi ? (
          <Link href="/ptk/absensi">{tombol}</Link>
        ) : (
          tombol
        )}

        <div className="mt-4 text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Mans-Cell Versi Beta © 2026
          </p>
        </div>
      </div>
    </div>
  )
}
