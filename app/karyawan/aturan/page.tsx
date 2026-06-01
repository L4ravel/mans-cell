"use client"

/*
  Halaman karyawan aturan toko.
  - Membaca aturan dari collection aturan_toko
  - Menampilkan aturan global semua toko dan aturan khusus toko karyawan
  - Toko karyawan diambil dari koleksi users berdasarkan uid login
  - Layout konsisten dengan halaman karyawan/admin bertema biru modern
*/

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore"
import {
  AlertCircle,
  BookOpenText,
  CheckCircle2,
  Cpu,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type UserProfile = {
  uid: string
  nama: string
  email: string
  role: string
  roles: string[]
  tokoId: string
  tokoNama: string
}

type AturanToko = {
  id: string
  judul: string
  isi: string
  tokoId: string
  tokoNama: string
  berlakuSemuaToko: boolean
  isActive: boolean
  createdAt: number
  updatedAt?: number
}

const normalizeRoles = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) =>
      String(item || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
}

const formatTanggal = (value?: number) => {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

export default function KaryawanAturanPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [aturanList, setAturanList] = useState<AturanToko[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)

  const fetchCurrentUserProfile = async (uid: string, emailFallback?: string | null) => {
    try {
      const snap = await getDoc(doc(db, "users", uid))
      if (snap.exists()) {
        const x = snap.data() as any
        const nextProfile: UserProfile = {
          uid,
          nama: String(x?.nama || "").trim() || "Tanpa Nama",
          email:
            String(x?.email || "").trim() ||
            String(emailFallback || "").trim() ||
            "-",
          role: String(x?.role || "")
            .trim()
            .toLowerCase(),
          roles: normalizeRoles(x?.roles),
          tokoId: String(x?.tokoId || "").trim(),
          tokoNama: String(x?.tokoNama || "").trim(),
        }

        setProfile(nextProfile)
        return nextProfile
      }
    } catch (e) {
      console.error("Gagal membaca profil karyawan:", e)
    }

    const fallback: UserProfile = {
      uid,
      nama: "Tanpa Nama",
      email: String(emailFallback || "").trim() || "-",
      role: "",
      roles: [],
      tokoId: "",
      tokoNama: "",
    }

    setProfile(fallback)
    return fallback
  }

  const normalizeAturan = (id: string, x: any): AturanToko => ({
    id,
    judul: String(x?.judul || ""),
    isi: String(x?.isi || ""),
    tokoId: String(x?.tokoId || ""),
    tokoNama: String(x?.tokoNama || ""),
    berlakuSemuaToko: Boolean(x?.berlakuSemuaToko),
    isActive: x?.isActive !== false,
    createdAt: Number(x?.createdAt || 0),
    updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
  })

  const fetchAturan = async (tokoId: string) => {
    setLoading(true)
    setError(null)

    try {
      const globalSnap = await getDocs(
        query(
          collection(db, "aturan_toko"),
          where("isActive", "==", true),
          where("berlakuSemuaToko", "==", true),
          orderBy("createdAt", "desc"),
        ),
      )

      const khususSnap = tokoId
        ? await getDocs(
            query(
              collection(db, "aturan_toko"),
              where("isActive", "==", true),
              where("tokoId", "==", tokoId),
              orderBy("createdAt", "desc"),
            ),
          )
        : null

      const map = new Map<string, AturanToko>()

      globalSnap.docs.forEach((d) => {
        const item = normalizeAturan(d.id, d.data())
        if (item.judul && item.isActive) map.set(item.id, item)
      })

      khususSnap?.docs.forEach((d) => {
        const item = normalizeAturan(d.id, d.data())
        if (item.judul && item.isActive) map.set(item.id, item)
      })

      const list = Array.from(map.values()).sort((a, b) => {
        if (a.berlakuSemuaToko !== b.berlakuSemuaToko) {
          return a.berlakuSemuaToko ? -1 : 1
        }

        return Number(b.createdAt || 0) - Number(a.createdAt || 0)
      })

      setAturanList(list)
    } catch (e) {
      console.error("Gagal membaca aturan toko:", e)
      setAturanList([])
      setError("Gagal memuat aturan toko")
    } finally {
      setLoading(false)
    }
  }

  const fetchAll = async () => {
    const user = auth.currentUser
    if (!user) return

    const nextProfile = await fetchCurrentUserProfile(user.uid, user.email)
    await fetchAturan(nextProfile.tokoId)
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        setProfile(null)
        setAturanList([])
        setLoading(false)
        return
      }

      const nextProfile = await fetchCurrentUserProfile(u.uid, u.email)
      await fetchAturan(nextProfile.tokoId)
    })

    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return aturanList.filter((item) => {
      if (!q) return true

      return (
        item.judul.toLowerCase().includes(q) ||
        item.isi.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q)
      )
    })
  }, [aturanList, search])

  const stats = useMemo(() => {
    const total = aturanList.length
    const global = aturanList.filter((item) => item.berlakuSemuaToko).length
    const khusus = aturanList.filter((item) => !item.berlakuSemuaToko).length

    return { total, global, khusus }
  }, [aturanList])

  return (
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
      <main className="relative w-full space-y-4 pb-28">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <BookOpenText size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Aturan Toko
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Baca aturan operasional yang berlaku untuk karyawan dan toko tempat bertugas.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={fetchAll}
                disabled={loading}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15 disabled:opacity-60"
                title="Refresh"
              >
                <RefreshCw size={12} strokeWidth={2.8} className={loading ? "animate-spin" : ""} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.04]">
            <Cpu size={150} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
            >
              <AlertCircle size={16} className="text-red-500" strokeWidth={2.5} />
              <p className="max-w-xs text-xs font-black text-red-600">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>       

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Toko Aktif
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                {profile?.tokoNama || "Toko belum terhubung"}
              </p>             
            </div>

            <div className="flex w-full gap-2 sm:max-w-sm">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  strokeWidth={2.4}
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari aturan..."
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>

              <button
                type="button"
                onClick={fetchAll}
                disabled={loading}
                className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 transition hover:bg-sky-100 disabled:opacity-60 sm:hidden"
                title="Refresh"
              >
                <RefreshCw size={16} strokeWidth={2.5} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        </motion.div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
              />
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Memuat aturan...
              </p>
            </div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3 py-16"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <BookOpenText size={28} className="text-slate-300" strokeWidth={2} />
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada aturan aktif
              </p>
              <p className="mt-1 max-w-sm text-xs font-semibold leading-relaxed text-slate-500">
                Aturan akan tampil setelah admin menambahkan aturan global atau aturan khusus toko.
              </p>
            </div>
          </motion.div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {filtered.map((item, idx) => (
              <motion.article
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-800 sm:text-base">
                        {item.judul}
                      </p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                        {item.berlakuSemuaToko
                          ? "Berlaku untuk semua toko"
                          : item.tokoNama || "Toko khusus"}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
                        item.berlakuSemuaToko
                          ? "bg-blue-50 text-blue-700"
                          : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {item.berlakuSemuaToko ? "Global" : "Toko"}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <div className="whitespace-pre-wrap rounded-2xl border border-slate-100 bg-white p-3 text-sm font-semibold leading-relaxed text-slate-700">
                    {item.isi}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700">
                      <CheckCircle2 size={12} strokeWidth={2.5} />
                      Aktif
                    </div>

                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                      Diperbarui {formatTanggal(item.updatedAt || item.createdAt)}
                    </p>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
