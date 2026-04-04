/*
  Footer ini membaca pengaturan jam absensi dari struktur baru: karyawan -> toko -> default.
  Jika tidak ada jadwal valid atau status hari ini libur, tombol jadi nonaktif dan tampil "Tidak ada jadwal".
*/

"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Fingerprint } from "lucide-react"
import { motion } from "framer-motion"
import { auth, db } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"

type DaySchedule = {
  enabled: boolean
  jamMasuk: string
  jamPulang: string
}

const DEFAULT_DAY_SCHEDULE: DaySchedule = {
  enabled: true,
  jamMasuk: "07:30",
  jamPulang: "14:00",
}

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7)
}

function createDefaultWeeklySchedule(): Record<number, DaySchedule> {
  return {
    0: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
    1: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
    2: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
    3: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
    4: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
    5: { enabled: false, jamMasuk: "07:30", jamPulang: "14:00" },
    6: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
  }
}

function normalizeWeeklySchedule(data: any): Record<number, DaySchedule> {
  const defaults = createDefaultWeeklySchedule()

  if (data?.weeklySchedule && typeof data.weeklySchedule === "object") {
    const normalized: Record<number, DaySchedule> = { ...defaults }

    for (let i = 0; i < 7; i++) {
      const raw = data.weeklySchedule?.[i] ?? data.weeklySchedule?.[String(i)]
      if (raw) {
        normalized[i] = {
          enabled:
            typeof raw.enabled === "boolean" ? raw.enabled : defaults[i].enabled,
          jamMasuk: raw.jamMasuk || defaults[i].jamMasuk,
          jamPulang: raw.jamPulang || defaults[i].jamPulang,
        }
      }
    }

    return normalized
  }

  const jamMasuk = data?.jamMasuk || "07:30"
  const jamPulang = data?.jamPulang || "14:00"
  const hariLibur = Array.isArray(data?.hariLibur) ? data.hariLibur : [5]

  const migrated: Record<number, DaySchedule> = { ...defaults }
  for (let i = 0; i < 7; i++) {
    migrated[i] = {
      enabled: !hariLibur.includes(i),
      jamMasuk,
      jamPulang,
    }
  }

  return migrated
}

function getResolvedScheduleFromData(data: any, dateString: string): DaySchedule | null {
  if (!data) return null

  const weeklySchedule = normalizeWeeklySchedule(data)
  const hariKe = new Date(dateString).getDay()
  const monthKey = getMonthKey(dateString)

  const monthlyOverride =
    data?.monthlyOverrides?.[monthKey]?.[dateString] ||
    data?.monthlyOverrides?.[monthKey]?.[String(dateString)]

  if (monthlyOverride && typeof monthlyOverride === "object") {
    return {
      enabled:
        typeof monthlyOverride.enabled === "boolean"
          ? monthlyOverride.enabled
          : weeklySchedule[hariKe]?.enabled ?? DEFAULT_DAY_SCHEDULE.enabled,
      jamMasuk:
        monthlyOverride.jamMasuk ||
        weeklySchedule[hariKe]?.jamMasuk ||
        DEFAULT_DAY_SCHEDULE.jamMasuk,
      jamPulang:
        monthlyOverride.jamPulang ||
        weeklySchedule[hariKe]?.jamPulang ||
        DEFAULT_DAY_SCHEDULE.jamPulang,
    }
  }

  return weeklySchedule[hariKe] || DEFAULT_DAY_SCHEDULE
}

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
        const today = new Date()
        const yyyy = today.getFullYear()
        const mm = String(today.getMonth() + 1).padStart(2, "0")
        const dd = String(today.getDate()).padStart(2, "0")
        const tanggal = `${yyyy}-${mm}-${dd}`

        const userSnap = await getDoc(doc(db, "users", user.uid))
        if (!userSnap.exists()) {
          setBolehAbsensi(false)
          setReady(true)
          return
        }

        const userData = userSnap.data()

        const karyawanId =
          userData?.permissions?.karyawanId ||
          userData?.permissions?.karyawanid ||
          userData?.karyawanId ||
          ""

        const tokoId =
          userData?.permissions?.tokoId ||
          userData?.tokoId ||
          userData?.toko?.id ||
          ""

        if (!karyawanId) {
          setBolehAbsensi(false)
          setReady(true)
          return
        }

        const karyawanSnap = await getDoc(
          doc(db, "pengaturan_jam_absensi", `karyawan_${karyawanId}`)
        )

        if (karyawanSnap.exists()) {
          const schedule = getResolvedScheduleFromData(karyawanSnap.data(), tanggal)
          setBolehAbsensi(!!schedule?.enabled)
          setReady(true)
          return
        }

        if (tokoId) {
          const tokoSnap = await getDoc(
            doc(db, "pengaturan_jam_absensi", `toko_${tokoId}`)
          )

          if (tokoSnap.exists()) {
            const schedule = getResolvedScheduleFromData(tokoSnap.data(), tanggal)
            setBolehAbsensi(!!schedule?.enabled)
            setReady(true)
            return
          }
        }

        const defaultSnap = await getDoc(doc(db, "pengaturan_jam_absensi", "default"))

        if (defaultSnap.exists()) {
          const schedule = getResolvedScheduleFromData(defaultSnap.data(), tanggal)
          setBolehAbsensi(!!schedule?.enabled)
          setReady(true)
          return
        }

        setBolehAbsensi(false)
      } catch (error) {
        console.error("Gagal cek jadwal absensi footer:", error)
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
        {bolehAbsensi ? <Link href="/karyawan/absensi">{tombol}</Link> : tombol}

        <div className="mt-4 text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Mans-Cell Versi Beta © 2026
          </p>
        </div>
      </div>
    </div>
  )
}