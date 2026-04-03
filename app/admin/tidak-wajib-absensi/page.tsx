"use client"

/*
  Halaman ini untuk mengatur daftar karyawan yang tidak wajib absen.
  Jika dicentang, data masuk ke koleksi karyawan_tidak_wajib_absen. Jika dilepas, data dihapus dari koleksi.
*/

import React, { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore"
import {
  AlertCircle,
  Check,
  Cpu,
  RefreshCw,
  Search,
  Users,
  UserX,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type Karyawan = {
  id: string
  nama: string
  email: string
  status: string
}

type KaryawanTidakWajibAbsen = {
  id: string
  karyawanId: string
  nama: string
  email: string
}

export default function KaryawanTidakWajibAbsenPage() {
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([])
  const [tidakWajibMap, setTidakWajibMap] = useState<Record<string, KaryawanTidakWajibAbsen>>({})

  const [search, setSearch] = useState("")
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 2500)
  }

  const loadKaryawan = async () => {
    const snap = await getDocs(query(collection(db, "karyawan"), orderBy("nama", "asc")))
    const rows: Karyawan[] = snap.docs.map((d) => {
      const x = d.data() as any
      return {
        id: d.id,
        nama: x.nama ?? "",
        email: x.email ?? "",
        status: x.status ?? "aktif",
      }
    })

    setKaryawanList(rows.filter((k) => k.status === "aktif" || !k.status))
  }

  const loadTidakWajibAbsen = async () => {
    const snap = await getDocs(
      query(collection(db, "karyawan_tidak_wajib_absen"), orderBy("nama", "asc"))
    )

    const mapped: Record<string, KaryawanTidakWajibAbsen> = {}

    snap.docs.forEach((d) => {
      const x = d.data() as any
      const karyawanId = x.karyawanId ?? d.id

      mapped[karyawanId] = {
        id: d.id,
        karyawanId,
        nama: x.nama ?? "",
        email: x.email ?? "",
      }
    })

    setTidakWajibMap(mapped)
  }

  const loadAll = async () => {
    setLoading(true)
    setError(null)

    try {
      await Promise.all([loadKaryawan(), loadTidakWajibAbsen()])
    } catch (e) {
      console.error(e)
      setError("Gagal memuat data.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) loadAll()
    })

    return () => unsub()
  }, [])

  const handleToggle = async (karyawan: Karyawan, checked: boolean) => {
    const user = auth.currentUser
    if (!user) {
      setError("User belum login.")
      return
    }

    setSavingId(karyawan.id)
    setError(null)

    try {
      const ref = doc(db, "karyawan_tidak_wajib_absen", karyawan.id)

      if (checked) {
        await setDoc(ref, {
          karyawanId: karyawan.id,
          nama: karyawan.nama,
          email: karyawan.email ?? "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        })

        setTidakWajibMap((prev) => ({
          ...prev,
          [karyawan.id]: {
            id: karyawan.id,
            karyawanId: karyawan.id,
            nama: karyawan.nama,
            email: karyawan.email ?? "",
          },
        }))

        showSuccess(`${karyawan.nama} ditandai tidak wajib absen.`)
      } else {
        await deleteDoc(ref)

        setTidakWajibMap((prev) => {
          const next = { ...prev }
          delete next[karyawan.id]
          return next
        })

        showSuccess(`${karyawan.nama} dihapus dari daftar tidak wajib absen.`)
      }
    } catch (e) {
      console.error(e)
      setError("Gagal menyimpan perubahan.")
    } finally {
      setSavingId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return karyawanList

    return karyawanList.filter((k) =>
      `${k.nama} ${k.email} ${k.id}`.toLowerCase().includes(q)
    )
  }, [karyawanList, search])

  const totalTidakWajib = Object.keys(tidakWajibMap).length
  const totalWajib = karyawanList.length - totalTidakWajib

  return (
    <div className="space-y-4 sm:space-y-5 text-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border-l-4 border-l-rose-500 border-t border-r border-b border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex h-11 w-11 sm:h-14 sm:w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 shadow-lg shadow-rose-200/50">
              <UserX size={22} className="text-white sm:w-7 sm:h-7" strokeWidth={2.5} />
            </div>

            <div>
              <h1 className="text-lg sm:text-2xl font-black text-slate-800 tracking-tight leading-none">
                Karyawan Tidak Wajib Absen
              </h1>
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-1">
                Checklist sederhana ke koleksi karyawan_tidak_wajib_absen
              </p>

              <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-bold">
                <span className="text-slate-500">
                  Total karyawan:{" "}
                  <span className="text-slate-800 font-black">{karyawanList.length}</span>
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">
                  Tidak wajib absen:{" "}
                  <span className="text-red-600 font-black">{totalTidakWajib}</span>
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">
                  Masih wajib absen:{" "}
                  <span className="text-emerald-600 font-black">{totalWajib}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={loadAll}
              disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 disabled:opacity-50"
              title="Reload"
            >
              <motion.span
                animate={loading ? { rotate: 360 } : {}}
                transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}
              >
                <RefreshCw size={14} className="text-slate-500" strokeWidth={2.5} />
              </motion.span>
            </motion.button>
          </div>
        </div>

        <div className="absolute right-0 top-0 opacity-[0.03] pointer-events-none">
          <Cpu size={140} strokeWidth={1} />
        </div>
      </motion.div>

      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
              <Check size={11} className="text-white" strokeWidth={3} />
            </div>
            <p className="text-[11px] font-bold text-emerald-700">{successMsg}</p>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200"
          >
            <AlertCircle size={13} className="text-red-500" strokeWidth={2.5} />
            <p className="text-[11px] font-bold text-red-600">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
          Cari Karyawan
        </label>

        <div className="relative">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            strokeWidth={2}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nama / Email / ID..."
            className="w-full rounded-xl border-2 border-slate-200 bg-white pl-8 pr-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 placeholder:font-normal transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
          />
        </div>
      </motion.div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-rose-500"
            />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Memuat data...
            </p>
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center py-16 gap-3"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Users size={28} className="text-slate-300" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Tidak ada data karyawan
          </p>
        </motion.div>
      )}

      {!loading && filtered.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["No", "Nama", "Email", "Tidak Wajib Absen"].map((h) => (
                    <th
                      key={h}
                      className={`px-3 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 whitespace-nowrap ${
                        h === "No" || h === "Tidak Wajib Absen" ? "text-center" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filtered.map((k, i) => {
                  const checked = !!tidakWajibMap[k.id]
                  const saving = savingId === k.id

                  return (
                    <motion.tr
                      key={k.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="px-3 py-3 text-center font-bold text-slate-400">{i + 1}</td>

                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 flex-shrink-0">
                            <span className="text-[10px] font-black text-slate-500">
                              {k.nama.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-black text-slate-800 text-[11px]">{k.nama}</p>
                            <p className="text-[10px] font-bold text-slate-400">{k.id}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3 font-semibold text-slate-500 text-[11px]">
                        {k.email || "-"}
                      </td>

                      <td className="px-3 py-3 text-center">
                        <label className="inline-flex items-center justify-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={saving}
                            onChange={(e) => handleToggle(k, e.target.checked)}
                            className="h-5 w-5 rounded border-slate-300 text-rose-500 focus:ring-rose-500 disabled:opacity-50"
                          />
                        </label>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden p-3 space-y-3">
            {filtered.map((k, i) => {
              const checked = !!tidakWajibMap[k.id]
              const saving = savingId === k.id

              return (
                <motion.div
                  key={k.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 flex-shrink-0">
                        <span className="text-sm font-black text-slate-500">
                          {k.nama.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{k.nama}</p>
                        <p className="text-[10px] font-bold text-slate-400 truncate">
                          {k.email || "-"}
                        </p>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={saving}
                      onChange={(e) => handleToggle(k, e.target.checked)}
                      className="h-5 w-5 rounded border-slate-300 text-rose-500 focus:ring-rose-500 disabled:opacity-50 flex-shrink-0"
                    />
                  </div>

                  <div className="mt-2">
                    <span
                      className={`inline-flex px-2 py-1 rounded-lg text-[10px] font-black border ${
                        checked
                          ? "bg-red-50 border-red-200 text-red-600"
                          : "bg-emerald-50 border-emerald-200 text-emerald-700"
                      }`}
                    >
                      {checked ? "TIDAK WAJIB ABSEN" : "WAJIB ABSEN"}
                    </span>
                  </div>
                </motion.div>
              )
            })}
          </div>

          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60">
            <p className="text-[10px] font-bold text-slate-400">
              Menampilkan {filtered.length} dari {karyawanList.length} karyawan
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}