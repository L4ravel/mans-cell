// app/karyawan/page.tsx
"use client"

/*
  Halaman ini menampilkan riwayat absensi karyawan beserta rekap bulanannya.
  Menggunakan tema dan pola UI seperti halaman PTK, tetapi disesuaikan untuk role dan data karyawan.
*/

import { useEffect, useMemo, useState } from "react"
import {
  Cpu,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  ChevronDown,
  AlertCircle,
  HeartPulse,
  Hand,
  Check,
  Filter,
} from "lucide-react"
import { auth } from "@/lib/firebase"
import { onAuthStateChanged } from "firebase/auth"
import { motion } from "framer-motion"
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  doc,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  getDoc,
} from "firebase/firestore"
import Footer from "./footer"

const getHari = (tanggal: string) => {
  return new Date(tanggal).toLocaleDateString("id-ID", {
    weekday: "long",
  })
}

const getDaysInMonth = (bulan: number, tahun: number) => {
  return new Date(tahun, bulan, 0).getDate()
}

const formatDateKey = (tahun: number, bulan: number, hari: number) => {
  return `${tahun}-${String(bulan).padStart(2, "0")}-${String(hari).padStart(2, "0")}`
}

const formatNamaKaryawan = (nama: string) => {
  return nama
    .split(/\s+/)
    .map((kata) => kata.toUpperCase())
    .join(" ")
}

type Absensi = {
  id: string
  tanggal: string
  status: string
  approvalStatus?: "pending" | "approved" | "rejected"
  jamMasuk: string | null
  jamPulang: string | null
  alasanMasuk?: string | null
  keteranganMasuk?: string | null
  alasanPulang?: string | null
  keteranganPulang?: string | null
  alasanIzin?: string | null
  keteranganIzin?: string | null
}

type RekapAbsensi = {
  hadir: number
  izin: number
  sakit: number
  terlambat: number
  pulangCepat: number
  kedatangan: number
  bulan: number
  tahun: number
}

const CACHE_KEY = "absensi_karyawan_cache"
const CACHE_REKAP_KEY = "absensi_karyawan_rekap_cache"
const ITEMS_PER_PAGE = 7

const saveCache = (rows: Absensi[]) => {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      ts: Date.now(),
      rows,
    })
  )
}

const loadCache = (): Absensi[] | null => {
  const raw = localStorage.getItem(CACHE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.rows) ? (parsed.rows as Absensi[]) : []
  } catch {
    return null
  }
}

const saveRekapCache = (rekap: RekapAbsensi, bulan: number, tahun: number) => {
  const key = `${CACHE_REKAP_KEY}_${bulan}_${tahun}`
  localStorage.setItem(
    key,
    JSON.stringify({
      ts: Date.now(),
      rekap,
    })
  )
}

const loadRekapCache = (bulan: number, tahun: number): RekapAbsensi | null => {
  const key = `${CACHE_REKAP_KEY}_${bulan}_${tahun}`
  const raw = localStorage.getItem(key)
  if (!raw) return null

  try {
    const data = JSON.parse(raw)
    if (Date.now() - data.ts < 5 * 60 * 1000) {
      return data.rekap as RekapAbsensi
    }
    return null
  } catch {
    return null
  }
}

export default function KaryawanPage() {
  const [data, setData] = useState<Absensi[]>([])
  const [loading, setLoading] = useState(true)
  const [showRekap, setShowRekap] = useState(false)
  const [rekap, setRekap] = useState<RekapAbsensi | null>(null)
  const [loadingRekap, setLoadingRekap] = useState(false)
  const now = new Date()
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [karyawanId, setKaryawanId] = useState<string | null>(null)
  const [namaKaryawan, setNamaKaryawan] = useState<string>("")
  const [liburFinalMap, setLiburFinalMap] = useState<Record<string, boolean>>({})
  const [jadwalLibur, setJadwalLibur] = useState<number[]>([])

  useEffect(() => {
    if (showRekap) {
      fetchRekap()
    }
  }, [bulan, tahun, showRekap, karyawanId])

  const fetchRekap = async () => {
    if (!karyawanId) return

    const cached = loadRekapCache(bulan, tahun)
    if (cached) {
      setRekap(cached)
    } else {
      setLoadingRekap(true)
    }

    const db = getFirestore()

    try {
      const [summarySnap, liburSnap, jadwalSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "absensi_karyawan_summary"),
            where("karyawanId", "==", karyawanId),
            where("bulan", "==", bulan),
            where("tahun", "==", tahun)
          )
        ),
        getDocs(
          query(
            collection(db, "libur_final_karyawan"),
            where("karyawanId", "==", karyawanId),
            where("bulan", "==", bulan),
            where("tahun", "==", tahun)
          )
        ),
        getDocs(query(collection(db, "jadwal_karyawan"), where("karyawanId", "==", karyawanId))),
      ])

      const liburMap: Record<string, boolean> = {}
      liburSnap.forEach((itemDoc) => {
        const item = itemDoc.data()
        if (item?.tanggal) {
          liburMap[item.tanggal] = true
        }
      })
      setLiburFinalMap(liburMap)

      if (!jadwalSnap.empty) {
        const jadwalData = jadwalSnap.docs[0].data()
        setJadwalLibur(Array.isArray(jadwalData?.hariLibur) ? jadwalData.hariLibur : [])
      } else {
        setJadwalLibur([])
      }

      if (summarySnap.empty) {
        setRekap(null)
        return
      }

      const d = summarySnap.docs[0].data()

      const rekapData: RekapAbsensi = {
        hadir: d.hadir ?? 0,
        izin: d.izin ?? 0,
        sakit: d.sakit ?? 0,
        terlambat: d.terlambat ?? 0,
        pulangCepat: d.pulangCepat ?? 0,
        kedatangan: d.kedatangan ?? 0,
        bulan: d.bulan,
        tahun: d.tahun,
      }

      setRekap(rekapData)
      saveRekapCache(rekapData, bulan, tahun)
    } catch (error) {
      console.error("Error fetching rekap:", error)
      setRekap(null)
      setLiburFinalMap({})
      setJadwalLibur([])
    } finally {
      setLoadingRekap(false)
    }
  }

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false)
        return
      }

      const cached = loadCache()
      if (cached && cached.length > 0) {
        setData(cached)
        setLoading(false)
      }

      const db = getFirestore()

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid))

        if (!userSnap.exists()) {
          setLoading(false)
          return
        }

        const raw = userSnap.data()
        setNamaKaryawan(raw?.nama || "")

        const userKaryawanId =
          raw?.karyawanId ||
          raw?.permissions?.karyawanId ||
          raw?.permissions?.karyawanid ||
          null

        if (!userKaryawanId) {
          setLoading(false)
          return
        }

        setKaryawanId(userKaryawanId)

        const q = query(
          collection(db, "absensi_karyawan"),
          where("karyawanId", "==", userKaryawanId),
          orderBy("tanggal", "desc"),
          limit(ITEMS_PER_PAGE)
        )

        const unsubAbsensi = onSnapshot(
          q,
          (snap) => {
            const rows = snap.docs.map((itemDoc) => ({
              id: itemDoc.id,
              tanggal: itemDoc.data().tanggal,
              status: itemDoc.data().status,
              approvalStatus: itemDoc.data().approvalStatus ?? null,
              jamMasuk: itemDoc.data().jamMasuk ?? null,
              jamPulang: itemDoc.data().jamPulang ?? null,
              keteranganMasuk: itemDoc.data().keteranganMasuk ?? null,
              keteranganPulang: itemDoc.data().keteranganPulang ?? null,
              keteranganIzin: itemDoc.data().keteranganIzin ?? null,
            }))

            setData(rows)
            saveCache(rows)
            setLastDoc(snap.docs[snap.docs.length - 1] ?? null)
            setHasMore(snap.docs.length === ITEMS_PER_PAGE)
            setLoading(false)
          },
          (error) => {
            console.error("Error in snapshot listener:", error)
            setLoading(false)
          }
        )

        return () => unsubAbsensi()
      } catch (error) {
        console.error("Error in auth state change:", error)
        setLoading(false)
      }
    })

    return () => unsubAuth()
  }, [])

  const loadMore = async () => {
    if (!lastDoc || loadingMore || !hasMore || !karyawanId) return

    setLoadingMore(true)
    const db = getFirestore()

    try {
      const q = query(
        collection(db, "absensi_karyawan"),
        where("karyawanId", "==", karyawanId),
        orderBy("tanggal", "desc"),
        startAfter(lastDoc),
        limit(ITEMS_PER_PAGE)
      )

      const snap = await getDocs(q)

      const rows = snap.docs.map((itemDoc) => ({
        id: itemDoc.id,
        tanggal: itemDoc.data().tanggal,
        status: itemDoc.data().status,
        approvalStatus: itemDoc.data().approvalStatus ?? null,
        jamMasuk: itemDoc.data().jamMasuk ?? null,
        jamPulang: itemDoc.data().jamPulang ?? null,
        keteranganMasuk: itemDoc.data().keteranganMasuk ?? null,
        keteranganPulang: itemDoc.data().keteranganPulang ?? null,
        keteranganIzin: itemDoc.data().keteranganIzin ?? null,
      }))

      const newData = [...data, ...rows]
      setData(newData)
      saveCache(newData)

      setLastDoc(snap.docs[snap.docs.length - 1] ?? null)
      setHasMore(snap.docs.length === ITEMS_PER_PAGE)
    } catch (error) {
      console.error("Error loading more:", error)
    } finally {
      setLoadingMore(false)
    }
  }

  const hariKerjaEfektif = useMemo(() => {
    const totalHari = getDaysInMonth(bulan, tahun)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const isCurrentMonth =
      tahun === today.getFullYear() && bulan === today.getMonth() + 1

    const isFutureMonth =
      tahun > today.getFullYear() ||
      (tahun === today.getFullYear() && bulan > today.getMonth() + 1)

    if (isFutureMonth) return 0

    let total = 0

    for (let day = 1; day <= totalHari; day++) {
      const dateObj = new Date(tahun, bulan - 1, day)
      dateObj.setHours(0, 0, 0, 0)

      if (isCurrentMonth && dateObj > today) continue

      const dateKey = formatDateKey(tahun, bulan, day)
      const dow = dateObj.getDay()

      const isLiburFinal = liburFinalMap[dateKey] === true
      const isLiburJadwalHariIni = dateObj.getTime() === today.getTime() && jadwalLibur.includes(dow)

      if (isLiburFinal || isLiburJadwalHariIni) continue

      total += 1
    }

    return total
  }, [bulan, tahun, liburFinalMap, jadwalLibur])

  const alpha = useMemo(() => {
    if (!rekap) return 0
    return Math.max(0, hariKerjaEfektif - rekap.hadir - rekap.izin - rekap.sakit)
  }, [rekap, hariKerjaEfektif])

  const visibleData = useMemo(() => data, [data])

  return (
    <div className="relative min-h-screen flex flex-col bg-[#f8fafc] text-slate-900">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute left-0 top-1/4 h-96 w-96 rounded-full bg-cyan-200/30 blur-[120px]" />
        <div className="absolute right-0 bottom-1/3 h-96 w-96 rounded-full bg-emerald-200/30 blur-[120px]" />
      </div>

      <main className="relative z-10 w-full p-3 sm:p-4 lg:p-5 pb-28 space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          onClick={() => {
            if (!showRekap) fetchRekap()
            setShowRekap((v) => !v)
          }}
          className="relative w-full overflow-hidden rounded-2xl border-l-4 border-l-blue-500 border border-slate-200 bg-white p-4 sm:p-5 sm:py-8 shadow-sm hover:shadow-md transition-shadow duration-300 cursor-pointer"
        >
          <div className="flex items-start gap-4 group">
            <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-cyan-500 shadow-lg shadow-blue-200/50 group-hover:scale-105 transition-transform duration-300">
              <Calendar size={28} className="text-white sm:w-8 sm:h-8" strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
                Riwayat Absensi
              </h1>
              <p className="text-[10px] font-bold tracking-[0.2em] text-slate-400 mt-1">
                ABSENSI KEHADIRAN {formatNamaKaryawan(namaKaryawan)}
              </p>
            </div>
            <motion.div
              animate={{ rotate: showRekap ? 180 : 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-100 group-hover:bg-slate-200 transition-colors"
            >
              <ChevronDown size={20} className="text-slate-600" strokeWidth={2.5} />
            </motion.div>
          </div>
          <div className="absolute right-0 top-0 opacity-[0.03]">
            <Cpu size={160} strokeWidth={1} />
          </div>
        </motion.div>

        {showRekap && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden space-y-4"
          >
            {loadingRekap ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
                  <p className="text-sm text-slate-500 font-medium">Memuat rekap absensi...</p>
                </div>
              </div>
            ) : rekap ? (
              <>
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                  className="rounded-xl border-l-4 border-l-purple-500 border-t border-r border-b border-slate-200 bg-white/80 backdrop-blur-sm p-3 sm:p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                      <Filter size={16} className="text-purple-600" strokeWidth={2.5} />
                    </div>
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                      Filter Periode
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                        Bulan
                      </label>
                      <div className="relative">
                        <select
                          value={bulan}
                          onChange={(e) => setBulan(Number(e.target.value))}
                          className="w-full appearance-none rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all duration-200 hover:border-purple-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                        >
                          <option value={1}>Januari</option>
                          <option value={2}>Februari</option>
                          <option value={3}>Maret</option>
                          <option value={4}>April</option>
                          <option value={5}>Mei</option>
                          <option value={6}>Juni</option>
                          <option value={7}>Juli</option>
                          <option value={8}>Agustus</option>
                          <option value={9}>September</option>
                          <option value={10}>Oktober</option>
                          <option value={11}>November</option>
                          <option value={12}>Desember</option>
                        </select>
                        <ChevronDown
                          size={16}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                          strokeWidth={2.5}
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                        Tahun
                      </label>
                      <div className="relative">
                        <select
                          value={tahun}
                          onChange={(e) => setTahun(Number(e.target.value))}
                          className="w-full appearance-none rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all duration-200 hover:border-purple-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                        >
                          <option value={2025}>2025</option>
                          <option value={2026}>2026</option>
                          <option value={2027}>2027</option>
                        </select>
                        <ChevronDown
                          size={16}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                          strokeWidth={2.5}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="grid grid-cols-2 sm:grid-cols-3 gap-2"
                >
                  <RekapItem label="Hadir" value={rekap.hadir} iconType="check" color="green" />
                  <RekapItem label="Alpha" value={alpha} iconType="x-circle" color="rose" />
                  <RekapItem label="Izin" value={rekap.izin} iconType="hand" color="blue" />
                  <RekapItem label="Sakit" value={rekap.sakit} iconType="heart-pulse" color="red" />
                  <RekapItem
                    label="Terlambat / Pulang Cepat"
                    value={`${rekap.terlambat}/${rekap.pulangCepat}`}
                    iconType="clock"
                    color="orange"
                  />
                  <RekapItem
                    label="Tidak Absen Pulang"
                    value={rekap.kedatangan}
                    iconType="alert-circle"
                    color="slate"
                  />
                </motion.div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-slate-500">Tidak ada data rekap untuk periode ini</p>
              </div>
            )}
          </motion.div>
        )}

        <div className="sm:hidden space-y-3">
          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col items-center gap-3 shadow-sm">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="h-8 w-8 rounded-full border-2 border-cyan-400 border-t-transparent"
              />
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Memuat data...
              </p>
            </div>
          )}

          {!loading && visibleData.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 flex flex-col items-center gap-3 shadow-sm">
              <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Calendar size={28} className="text-slate-300" strokeWidth={2} />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center">
                Belum ada data absensi
              </p>
            </div>
          )}

          {visibleData.map((row, idx) => (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                <span className="text-sm font-black text-slate-800 capitalize">
                  {getHari(row.tanggal)}
                </span>
                <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                  {row.tanggal}
                </span>
              </div>

              <div className="px-4 py-4 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    Masuk
                  </p>
                  <p className="text-base font-bold text-slate-800">
                    {row.jamMasuk || <span className="text-slate-300 font-normal">—</span>}
                  </p>
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    Pulang
                  </p>
                  <p className="text-base font-bold text-slate-800">
                    {row.jamPulang || <span className="text-slate-300 font-normal">—</span>}
                  </p>
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    Status
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-base font-bold text-slate-800 capitalize">
                      {row.status}
                    </span>
                    {row.approvalStatus === "pending" && (
                      <Clock size={14} className="text-orange-500" strokeWidth={2.5} />
                    )}
                    {row.approvalStatus === "approved" && (
                      <CheckCircle2 size={14} className="text-emerald-600" strokeWidth={2.5} />
                    )}
                    {row.approvalStatus === "rejected" && (
                      <XCircle size={14} className="text-red-600" strokeWidth={2.5} />
                    )}
                  </div>
                </div>
              </div>

              {(row.keteranganMasuk || row.keteranganPulang || row.keteranganIzin) && (
                <div className="px-4 pb-4">
                  <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                      Keterangan
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {row.keteranganMasuk || row.keteranganPulang || row.keteranganIzin}
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          ))}

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full mt-1 px-4 py-3 text-sm font-semibold rounded-xl bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:bg-slate-100 transition disabled:opacity-50 shadow-sm"
            >
              {loadingMore ? "Memuat..." : "Muat Data Riwayat Absensi"}
            </button>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="hidden sm:block overflow-hidden rounded-xl border border-white/50 bg-white/40 backdrop-blur-2xl shadow-[0_12px_28px_-8px_rgba(0,0,0,0.12)]"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/50 border-b border-white/80">
                <tr>
                  <th className="px-4 sm:px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Hari
                  </th>
                  <th className="px-4 sm:px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Tanggal
                  </th>
                  <th className="px-4 sm:px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Status
                  </th>
                  <th className="px-4 sm:px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Masuk
                  </th>
                  <th className="px-4 sm:px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Pulang
                  </th>
                  <th className="px-4 sm:px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Keterangan
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="inline-block h-8 w-8 rounded-full border-2 border-cyan-400 border-t-transparent"
                      />
                      <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Memuat data...
                      </p>
                    </td>
                  </tr>
                )}

                {!loading && visibleData.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <Calendar size={24} className="text-slate-300" strokeWidth={2} />
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Belum ada data absensi
                        </p>
                      </div>
                    </td>
                  </tr>
                )}

                {visibleData.map((row, idx) => (
                  <motion.tr
                    key={row.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                    className="border-t border-white/50 hover:bg-white/50 transition-colors"
                  >
                    <td className="px-4 sm:px-5 py-2.5 font-semibold text-slate-700 capitalize text-sm">
                      {getHari(row.tanggal)}
                    </td>
                    <td className="px-4 sm:px-6 py-4 font-semibold text-slate-600">
                      {row.tanggal}
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 capitalize">{row.status}</span>
                        {row.approvalStatus === "pending" && (
                          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-100">
                            <Clock size={14} className="text-orange-500" strokeWidth={2.5} />
                          </div>
                        )}
                        {row.approvalStatus === "approved" && (
                          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100">
                            <CheckCircle2 size={14} className="text-emerald-600" strokeWidth={2.5} />
                          </div>
                        )}
                        {row.approvalStatus === "rejected" && (
                          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-red-100">
                            <XCircle size={14} className="text-red-600" strokeWidth={2.5} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 font-semibold text-slate-700">
                      {row.jamMasuk || <span className="text-slate-300 font-normal">-</span>}
                    </td>
                    <td className="px-4 sm:px-6 py-4 font-semibold text-slate-700">
                      {row.jamPulang || <span className="text-slate-300 font-normal">-</span>}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-slate-500 text-xs">
                      {row.keteranganMasuk || row.keteranganPulang || row.keteranganIzin || (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  </motion.tr>
                ))}

                {hasMore && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center">
                      <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="px-4 py-1.5 text-xs rounded bg-white/5 text-slate-700 border border-slate-200 hover:bg-white/10 transition disabled:opacity-50"
                      >
                        {loadingMore ? "Memuat..." : "Muat Data Lagi"}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  )
}

function RekapItem({
  label,
  value,
  iconType,
  color,
}: {
  label: string
  value: number | string
  iconType: "check" | "hand" | "heart-pulse" | "clock" | "alert-circle" | "x-circle"
  color: "green" | "blue" | "red" | "orange" | "slate" | "rose"
}) {
  const colorConfig = {
    green: {
      border: "border-l-green-500",
      iconBg: "bg-green-500/10",
      iconColor: "text-green-600",
      bgWatermark: "text-green-500/5",
    },
    blue: {
      border: "border-l-blue-500",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600",
      bgWatermark: "text-blue-500/5",
    },
    red: {
      border: "border-l-red-500",
      iconBg: "bg-red-500/10",
      iconColor: "text-red-600",
      bgWatermark: "text-red-500/5",
    },
    orange: {
      border: "border-l-orange-500",
      iconBg: "bg-orange-500/10",
      iconColor: "text-orange-600",
      bgWatermark: "text-orange-500/5",
    },
    slate: {
      border: "border-l-slate-500",
      iconBg: "bg-slate-500/10",
      iconColor: "text-slate-600",
      bgWatermark: "text-slate-500/5",
    },
    rose: {
      border: "border-l-rose-500",
      iconBg: "bg-rose-500/10",
      iconColor: "text-rose-600",
      bgWatermark: "text-rose-500/5",
    },
  }

  const iconMap = {
    check: Check,
    hand: Hand,
    "heart-pulse": HeartPulse,
    clock: Clock,
    "alert-circle": AlertCircle,
    "x-circle": XCircle,
  }

  const Icon = iconMap[iconType]
  const colors = colorConfig[color]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`relative overflow-hidden rounded-xl border-l-4 ${colors.border} border-t border-r border-b border-slate-100 bg-white/80 backdrop-blur-sm p-2.5 sm:p-4 hover:shadow-lg hover:bg-white transition-all duration-300 group`}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        <div
          className={`flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl ${colors.iconBg} group-hover:scale-110 transition-transform duration-300`}
        >
          <Icon
            size={18}
            className={`sm:w-[22px] sm:h-[22px] ${colors.iconColor}`}
            strokeWidth={2.5}
          />
        </div>
        <div className="flex-1">
          <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0">
            {label}
          </p>
          <p className="text-xl sm:text-2xl font-black text-slate-800 group-hover:scale-105 transition-transform origin-left leading-tight">
            {value}
          </p>
        </div>
      </div>
      <div className="absolute -right-6 -bottom-6 opacity-100">
        <Icon size={80} className={colors.bgWatermark} strokeWidth={1.5} />
      </div>
    </motion.div>
  )
}