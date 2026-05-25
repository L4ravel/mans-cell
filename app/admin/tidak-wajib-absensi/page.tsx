// Halaman khusus untuk mengatur karyawan yang tidak wajib melakukan absensi.
// Revisi layout:
// - Layout dikonsistensikan dengan dashboard/laporan absensi terbaru.
// - Header gradient biru, wrapper aman untuk sidebar, filter collapse mobile.
// - Pagination 10/25/50/100/ALL tanpa teks ringkasan halaman.
// - Tampilan mobile memakai card flat, desktop memakai tabel.
// - Toggle status update lokal tanpa refetch penuh.

"use client"

import React, { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore"
import {
  AlertCircle,
  CalendarOff,
  CheckCircle2,
  ChevronDown,
  Cpu,
  ListFilter,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Store,
  Users,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type Karyawan = {
  id: string
  nama: string
  email: string
  status: string
  tokoNama: string
}

type KaryawanTidakWajibAbsen = {
  id: string
  karyawanId: string
  nama: string
  email: string
  tokoNama: string
}

type FilterStatus = "semua" | "tidak_wajib" | "wajib"

const LIMIT_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
]

function FilterSelect({
  value,
  onChange,
  children,
  label,
  icon: Icon,
}: {
  value: string | number
  onChange: (v: string) => void
  children: React.ReactNode
  label: string
  icon?: any
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </label>

      <div className="relative">
        {Icon && (
          <Icon
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2.3}
          />
        )}

        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${
            Icon ? "pl-8" : "pl-3"
          } pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20`}
        >
          {children}
        </select>

        <ChevronDown
          size={13}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          strokeWidth={2.5}
        />
      </div>
    </div>
  )
}

export default function KaryawanTidakWajibAbsenPage() {
  const [data, setData] = useState<Karyawan[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const [tidakWajibMap, setTidakWajibMap] = useState<
    Record<string, KaryawanTidakWajibAbsen>
  >({})

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("semua")
  const [showFilter, setShowFilter] = useState(false)

  const [limitVal, setLimitVal] = useState(10)
  const [page, setPage] = useState(1)

  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null)

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 2200)
  }

  const fetchData = async () => {
    const user = auth.currentUser
    if (!user) return

    setLoading(true)

    try {
      const karyawanRef = query(collection(db, "karyawan"), orderBy("nama", "asc"))
      const karyawanSnap = await getDocs(karyawanRef)

      const list: Karyawan[] = karyawanSnap.docs
        .map((docSnap) => {
          const d = docSnap.data() as any

          return {
            id: docSnap.id,
            nama: d.nama || "",
            email: d.email || "",
            status: d.status || "aktif",
            tokoNama: d.tokoNama || d.toko?.nama || "Tanpa Toko",
          }
        })
        .filter((item) => item.status === "aktif" || !item.status)

      const tidakWajibSnap = await getDocs(
        query(collection(db, "karyawan_tidak_wajib_absen"), orderBy("nama", "asc"))
      )

      const map: Record<string, KaryawanTidakWajibAbsen> = {}

      tidakWajibSnap.docs.forEach((docSnap) => {
        const d = docSnap.data() as any
        const karyawanId = d.karyawanId || docSnap.id

        map[karyawanId] = {
          id: docSnap.id,
          karyawanId,
          nama: d.nama || "",
          email: d.email || "",
          tokoNama: d.tokoNama || d.toko?.nama || "",
        }
      })

      setData(list)
      setTidakWajibMap(map)
    } catch (err) {
      console.error("Gagal memuat data karyawan:", err)
      showToast("err", "Gagal memuat data karyawan")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchData()
      } else {
        setData([])
        setTidakWajibMap({})
        setLoading(false)
      }
    })

    return () => unsub()
  }, [])

  const tokoOptions = useMemo(() => {
    const setToko = new Set<string>()

    data.forEach((item) => {
      if (item.tokoNama) setToko.add(item.tokoNama)
    })

    return Array.from(setToko).sort((a, b) => a.localeCompare(b, "id"))
  }, [data])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return data.filter((item) => {
      const isTidakWajib = !!tidakWajibMap[item.id]

      const matchSearch =
        !keyword ||
        item.nama.toLowerCase().includes(keyword) ||
        item.email.toLowerCase().includes(keyword) ||
        item.tokoNama.toLowerCase().includes(keyword)

      const matchToko = filterToko ? item.tokoNama === filterToko : true

      const matchStatus =
        filterStatus === "semua"
          ? true
          : filterStatus === "tidak_wajib"
            ? isTidakWajib
            : !isTidakWajib

      return matchSearch && matchToko && matchStatus
    })
  }, [data, search, filterToko, filterStatus, tidakWajibMap])

  const totalTidakWajib = useMemo(() => {
    return data.filter((item) => tidakWajibMap[item.id]).length
  }, [data, tidakWajibMap])

  const totalWajib = data.length - totalTidakWajib
  const totalPages = limitVal === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / limitVal))

  const paged = useMemo(() => {
    if (limitVal === 0) return filtered

    const start = (page - 1) * limitVal
    const end = start + limitVal

    return filtered.slice(start, end)
  }, [filtered, page, limitVal])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const toggleTidakWajib = async (karyawan: Karyawan) => {
    const user = auth.currentUser

    if (!user) {
      showToast("err", "User belum login")
      return
    }

    if (loadingId) return

    setLoadingId(karyawan.id)

    const isActive = !!tidakWajibMap[karyawan.id]
    const statusRef = doc(db, "karyawan_tidak_wajib_absen", karyawan.id)
    const counterRef = doc(db, "counter_karyawan_tidak_wajib_absen", "global")

    try {
      if (isActive) {
        await deleteDoc(statusRef)

        await setDoc(
          counterRef,
          {
            total: increment(-1),
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          },
          { merge: true }
        )

        setTidakWajibMap((prev) => {
          const copy = { ...prev }
          delete copy[karyawan.id]
          return copy
        })

        showToast("ok", "Karyawan berhasil diwajibkan absen kembali")
        return
      }

      await setDoc(
        statusRef,
        {
          karyawanId: karyawan.id,
          nama: karyawan.nama,
          email: karyawan.email || "",
          tokoNama: karyawan.tokoNama || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      )

      await setDoc(
        counterRef,
        {
          total: increment(1),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      )

      setTidakWajibMap((prev) => ({
        ...prev,
        [karyawan.id]: {
          id: karyawan.id,
          karyawanId: karyawan.id,
          nama: karyawan.nama,
          email: karyawan.email || "",
          tokoNama: karyawan.tokoNama || "",
        },
      }))

      showToast("ok", "Karyawan berhasil ditandai tidak wajib absen")
    } catch (err) {
      console.error("Gagal mengubah status tidak wajib absen:", err)
      showToast("err", "Gagal mengubah status karyawan")
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`fixed right-4 top-4 z-[70] rounded-2xl border px-4 py-3 shadow-lg ${
              toast.type === "ok"
                ? "border-sky-200 bg-sky-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === "ok" ? (
                <CheckCircle2
                  size={16}
                  className="text-sky-600"
                  strokeWidth={2.5}
                />
              ) : (
                <AlertCircle
                  size={16}
                  className="text-red-600"
                  strokeWidth={2.5}
                />
              )}

              <p
                className={`text-xs font-black ${
                  toast.type === "ok" ? "text-sky-700" : "text-red-700"
                }`}
              >
                {toast.msg}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative w-full space-y-4 pb-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
              <CalendarOff
                size={28}
                className="text-white sm:h-8 sm:w-8"
                strokeWidth={2.5}
              />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                Tidak Wajib Absen
              </h1>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                Atur karyawan yang dikecualikan dari kewajiban absensi.
              </p>
            </div>
          </div>

          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-yellow-300/10 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.05]">
            <Cpu size={170} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4"
          >
            <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left">
              <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 sm:flex sm:h-11 sm:w-11">
                <Users size={21} strokeWidth={2.5} />
              </div>
              <div>
                <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[10px] sm:tracking-widest">
                  Total Karyawan
                </p>
                <p className="text-lg font-black leading-tight text-slate-800 sm:text-2xl">{data.length}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.04 }}
            className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4"
          >
            <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left">
              <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 sm:flex sm:h-11 sm:w-11">
                <ShieldCheck size={21} strokeWidth={2.5} />
              </div>
              <div>
                <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[10px] sm:tracking-widest">
                  Wajib Absen
                </p>
                <p className="text-lg font-black leading-tight text-sky-600 sm:text-2xl">{totalWajib}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.08 }}
            className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4"
          >
            <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left">
              <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 sm:flex sm:h-11 sm:w-11">
                <ShieldOff size={21} strokeWidth={2.5} />
              </div>
              <div>
                <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[10px] sm:tracking-widest">
                  Tidak Wajib
                </p>
                <p className="text-lg font-black leading-tight text-rose-600 sm:text-2xl">{totalTidakWajib}</p>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <button
            type="button"
            onClick={() => setShowFilter((prev) => !prev)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                <Search size={18} strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-slate-700">
                  Pencarian & Filter
                </p>
              </div>
            </div>

            <ChevronDown
              size={18}
              strokeWidth={2.5}
              className={`shrink-0 text-slate-400 transition-transform ${
                showFilter ? "rotate-180" : "rotate-0"
              }`}
            />
          </button>

          <div className={`${showFilter ? "block" : "hidden"} border-t border-slate-100 lg:block`}>
            <div className="p-4">
                  <div className="grid gap-3 md:grid-cols-5">
                    <div className="md:col-span-2">
                      <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Cari Karyawan
                      </label>

                      <div className="relative">
                        <Search
                          size={16}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          strokeWidth={2.5}
                        />

                        <input
                          placeholder="Cari nama, email, toko..."
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value)
                            setPage(1)
                          }}
                          className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                        />
                      </div>
                    </div>

                    <FilterSelect
                      value={filterToko}
                      onChange={(v) => {
                        setFilterToko(v)
                        setPage(1)
                      }}
                      label="Filter Toko"
                      icon={Store}
                    >
                      <option value="">Semua toko</option>
                      {tokoOptions.map((toko) => (
                        <option key={toko} value={toko}>
                          {toko}
                        </option>
                      ))}
                    </FilterSelect>

                    <FilterSelect
                      value={filterStatus}
                      onChange={(v) => {
                        setFilterStatus(v as FilterStatus)
                        setPage(1)
                      }}
                      label="Status"
                      icon={ShieldCheck}
                    >
                      <option value="semua">Semua status</option>
                      <option value="wajib">Wajib absen</option>
                      <option value="tidak_wajib">Tidak wajib absen</option>
                    </FilterSelect>

                    <FilterSelect
                      value={limitVal}
                      onChange={(v) => {
                        setLimitVal(Number(v))
                        setPage(1)
                      }}
                      label="Tampil"
                      icon={ListFilter}
                    >
                      {LIMIT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </FilterSelect>
                  </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={fetchData}
              type="button"
              disabled={loading}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={12}
                className={loading ? "animate-spin" : ""}
                strokeWidth={2.5}
              />
              Refresh
            </motion.button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="space-y-2"
        >
          <div className="hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:block">
            <p className="text-xs font-black uppercase tracking-wide text-slate-700">
              Daftar Karyawan Absensi
            </p>
          </div>

          {loading ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-sky-500"
              />

              <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                Memuat data karyawan...
              </p>
            </motion.div>
          ) : paged.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <CalendarOff size={28} className="text-slate-300" strokeWidth={2} />
              </div>

              <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                Data karyawan belum tersedia
              </p>
            </div>
          ) : (
            <>
              <div className="w-full space-y-2 lg:hidden">
                {paged.map((item) => {
                  const isTidakWajib = !!tidakWajibMap[item.id]
                  const isLoading = loadingId === item.id

                  return (
                    <div
                      key={item.id}
                      className={`flex w-full items-start justify-between gap-2 overflow-hidden rounded-2xl bg-white p-3 shadow-sm sm:border sm:border-l-4 ${
                        isTidakWajib
                          ? "border-slate-200 border-l-rose-400"
                          : "border-slate-200 border-l-sky-400"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                              isTidakWajib
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-sky-200 bg-sky-50 text-sky-700"
                            }`}
                          >
                            {isTidakWajib ? "Tidak Wajib Absen" : "Wajib Absen"}
                          </span>
                        </div>

                        <p className="mt-2 break-words text-sm font-black leading-tight text-slate-800">
                          {item.nama || "-"}
                        </p>

                        <p className="mt-0.5 break-words text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-400">
                          {item.email || "-"} · {item.tokoNama || "-"}
                        </p>
                      </div>

                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        transition={{ duration: 0.12, ease: "easeOut" }}
                        onClick={() => toggleTidakWajib(item)}
                        disabled={!!loadingId}
                        className={`inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 text-[9px] font-black uppercase tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          isTidakWajib
                            ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                            : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        }`}
                      >
                        {isLoading ? (
                          <>
                            <RefreshCw
                              size={12}
                              className="animate-spin"
                              strokeWidth={2.5}
                            />
                            Proses
                          </>
                        ) : isTidakWajib ? (
                          <>
                            <ShieldCheck size={12} strokeWidth={2.5} />
                            Wajibkan
                          </>
                        ) : (
                          <>
                            <ShieldOff size={12} strokeWidth={2.5} />
                            Nonaktif
                          </>
                        )}
                      </motion.button>
                    </div>
                  )
                })}
              </div>

              <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="border-b border-slate-100 bg-slate-50/70">
                      <tr>
                        {["No", "Nama Karyawan", "Email", "Toko", "Status", "Aksi"].map(
                          (head, index) => (
                            <th
                              key={head}
                              className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 ${
                                index === 0 || index >= 4 ? "text-center" : "text-left"
                              }`}
                            >
                              {head}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {paged.map((item, idx) => {
                        const isTidakWajib = !!tidakWajibMap[item.id]
                        const isLoading = loadingId === item.id

                        return (
                          <tr
                            key={item.id}
                            className="border-b border-slate-100 hover:bg-slate-50/50"
                          >
                            <td className="px-4 py-3 text-center text-xs font-bold text-slate-400">
                              {limitVal === 0 ? idx + 1 : (page - 1) * limitVal + idx + 1}
                            </td>

                            <td className="px-4 py-3 font-black text-slate-800">
                              {item.nama || "-"}
                            </td>

                            <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                              <span className="inline-flex items-center gap-1.5">
                                <Mail size={12} className="text-slate-400" strokeWidth={2.4} />
                                {item.email || "-"}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                              {item.tokoNama || "-"}
                            </td>

                            <td className="px-4 py-3 text-center">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase ${
                                  isTidakWajib
                                    ? "border-rose-200 bg-rose-50 text-rose-700"
                                    : "border-sky-200 bg-sky-50 text-sky-700"
                                }`}
                              >
                                {isTidakWajib ? "Tidak Wajib" : "Wajib"}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-center">
                              <motion.button
                                whileTap={{ scale: 0.97 }}
                                transition={{ duration: 0.12, ease: "easeOut" }}
                                onClick={() => toggleTidakWajib(item)}
                                disabled={!!loadingId}
                                className={`inline-flex h-9 min-w-[132px] items-center justify-center gap-1.5 rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                  isTidakWajib
                                    ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                                    : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                }`}
                              >
                                {isLoading ? (
                                  <>
                                    <RefreshCw
                                      size={13}
                                      className="animate-spin"
                                      strokeWidth={2.5}
                                    />
                                    Memproses
                                  </>
                                ) : isTidakWajib ? (
                                  <>
                                    <ShieldCheck size={13} strokeWidth={2.5} />
                                    Wajibkan
                                  </>
                                ) : (
                                  <>
                                    <ShieldOff size={13} strokeWidth={2.5} />
                                    Tidak Wajib
                                  </>
                                )}
                              </motion.button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </motion.div>

        {!loading && filtered.length > 0 && limitVal !== 0 && totalPages > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="flex justify-end"
          >

            <div className="flex gap-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.06em] text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.06em] text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </motion.button>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  )
}
