/* 
  Halaman admin untuk sinkron, reset password, dan hapus akun pelanggan.
  Generate akun sekarang lewat API server agar email existing di Firebase Auth bisa langsung disinkronkan.
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore"
import {
  UserPlus,
  Cpu,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Mail,
  AlertCircle,
  Check,
  Users,
  Zap,
  RotateCcw,
  Trash2,
  Phone,
  CreditCard,
  ShieldCheck,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type Pelanggan = {
  id: string
  uid?: string
  nama: string
  telepon: string
  email: string
  alamat: string
  nomorKartu: string
  kodePelanggan: string
  aktif: boolean
  tipeMember: "Reguler" | "Silver" | "Gold" | "Platinum"
  poin: number
  totalTransaksi: number
  tanggalBergabung: number
  tanggalKedaluwarsa?: number | null
  diskon?: number
  tanggalLahir?: string
  jenisKelamin?: "L" | "P" | ""
  fotoUrl?: string
  catatan?: string
  createdAt: number
  createdBy: string
  updatedAt?: number
  updatedBy?: string
}

type UserMap = {
  [pelangganId: string]: {
    uid: string
    email: string
    roles: string[]
  }
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 0, label: "Semua" },
]

const MEMBER_OPTIONS = ["Reguler", "Silver", "Gold", "Platinum"] as const

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
            strokeWidth={2}
          />
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${
            Icon ? "pl-8" : "pl-3"
          } pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20`}
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

export default function BuatAkunPelangganPage() {
  const [data, setData] = useState<Pelanggan[]>([])
  const [users, setUsers] = useState<UserMap>({})
  const [loading, setLoading] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [selectedMember, setSelectedMember] = useState("")
  const [selectedAktif, setSelectedAktif] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "generated" | "not_generated">("all")
  const [limit, setLimit] = useState(10)
  const [page, setPage] = useState(1)

  const defaultPassword = "12345678"

  const showSuccess = (message: string) => {
    setSuccessMsg(message)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const showError = (message: string) => {
    setErrorMsg(message)
    setTimeout(() => setErrorMsg(null), 4000)
  }

  const fetchPelanggan = async () => {
    setLoading(true)
    try {
      const qRef = query(collection(db, "pelanggan"), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: Pelanggan[] = snap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          uid: x?.uid || "",
          nama: x?.nama || "",
          telepon: x?.telepon || "",
          email: x?.email || "",
          alamat: x?.alamat || "",
          nomorKartu: x?.nomorKartu || "",
          kodePelanggan: x?.kodePelanggan || "",
          aktif: Boolean(x?.aktif),
          tipeMember: x?.tipeMember || "Reguler",
          poin: Number(x?.poin || 0),
          totalTransaksi: Number(x?.totalTransaksi || 0),
          tanggalBergabung: Number(x?.tanggalBergabung || 0),
          tanggalKedaluwarsa: x?.tanggalKedaluwarsa ? Number(x?.tanggalKedaluwarsa) : null,
          diskon: Number(x?.diskon || 0),
          tanggalLahir: x?.tanggalLahir || "",
          jenisKelamin: x?.jenisKelamin || "",
          fotoUrl: x?.fotoUrl || "",
          catatan: x?.catatan || "",
          createdAt: Number(x?.createdAt || 0),
          createdBy: x?.createdBy || "",
          updatedAt: x?.updatedAt ? Number(x?.updatedAt) : undefined,
          updatedBy: x?.updatedBy || "",
        }
      })

      setData(list)
      await fetchUsers(list)
    } catch (e) {
      console.error(e)
      setData([])
      setUsers({})
      showError("Gagal memuat data pelanggan")
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async (pelangganList: Pelanggan[]) => {
    if (!pelangganList.length) {
      setUsers({})
      return
    }

    try {
      const ids = pelangganList.map((item) => item.id)
      const chunks: string[][] = []

      for (let i = 0; i < ids.length; i += 10) {
        chunks.push(ids.slice(i, i + 10))
      }

      const map: UserMap = {}

      for (const chunk of chunks) {
        const snap = await getDocs(
          query(collection(db, "users"), where("pelangganId", "in", chunk))
        )

        snap.docs.forEach((d) => {
          const x = d.data() as any
          if (x?.pelangganId) {
            map[x.pelangganId] = {
              uid: x?.uid || d.id,
              email: x?.email || "",
              roles: Array.isArray(x?.roles) ? x.roles : [],
            }
          }
        })
      }

      setUsers(map)
    } catch (e) {
      console.error(e)
      setUsers({})
      showError("Gagal memuat mapping user pelanggan")
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) fetchPelanggan()
    })
    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    return data.filter((d) => {
      const q = search.toLowerCase().trim()

      const matchSearch =
        !q ||
        d.nama.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q) ||
        d.telepon.toLowerCase().includes(q) ||
        d.nomorKartu.toLowerCase().includes(q) ||
        d.kodePelanggan.toLowerCase().includes(q)

      const matchMember = !selectedMember || d.tipeMember === selectedMember
      const matchAktif =
        !selectedAktif ||
        (selectedAktif === "aktif" && d.aktif) ||
        (selectedAktif === "nonaktif" && !d.aktif)

      if (statusFilter === "generated" && !users[d.id]) return false
      if (statusFilter === "not_generated" && users[d.id]) return false

      return matchSearch && matchMember && matchAktif
    })
  }, [data, search, selectedMember, selectedAktif, statusFilter, users])

  const totalPages = limit === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / limit))
  const paged = limit === 0 ? filtered : filtered.slice((page - 1) * limit, page * limit)

  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  const postAdminApi = async (url: string, body: Record<string, any>) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const text = await res.text()

    let data: any = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      throw new Error(`Endpoint ${url} tidak mengembalikan JSON. Status ${res.status}`)
    }

    if (!res.ok) {
      throw new Error(data?.message || `Request gagal. Status ${res.status}`)
    }

    return data
  }

  const handleGenerate = async (pelanggan: Pelanggan) => {
    setLoadingId(`${pelanggan.id}:generate`)
    setErrorMsg(null)

    if (!pelanggan.aktif) {
      showError(`Pelanggan ${pelanggan.nama} sedang nonaktif`)
      setLoadingId(null)
      return
    }

    const existingUser = users[pelanggan.id]
    if (existingUser) {
      showError(`Akun ${pelanggan.nama} sudah ada`)
      setLoadingId(null)
      return
    }

    try {
      const result = await postAdminApi("/api/pelanggan/sync-user", {
        pelangganId: pelanggan.id,
        nama: pelanggan.nama,
        email: pelanggan.email,
        telepon: pelanggan.telepon,
        nomorKartu: pelanggan.nomorKartu,
        kodePelanggan: pelanggan.kodePelanggan,
        aktif: pelanggan.aktif,
        password: defaultPassword,
        adminUid: auth.currentUser?.uid || "",
      })

      setUsers((prev) => ({
        ...prev,
        [pelanggan.id]: {
          uid: result.uid,
          email: result.email,
          roles: ["pelanggan"],
        },
      }))

      setData((prev) =>
        prev.map((item) =>
          item.id === pelanggan.id
            ? {
                ...item,
                uid: result.uid,
                updatedAt: Date.now(),
                updatedBy: auth.currentUser?.uid || "",
              }
            : item
        )
      )

      showSuccess(
        result?.action === "synced"
          ? `Akun ${pelanggan.nama} berhasil disinkronkan`
          : `Akun ${pelanggan.nama} berhasil dibuat`
      )
    } catch (e: any) {
      console.error(e)
      showError(e?.message || `Gagal sinkron akun ${pelanggan.nama}`)
    } finally {
      setLoadingId(null)
    }
  }

  const handleResetPassword = async (pelanggan: Pelanggan) => {
    const user = users[pelanggan.id]
    if (!user) {
      showError(`Akun ${pelanggan.nama} belum dibuat`)
      return
    }

    if (!confirm(`Reset password ${pelanggan.nama} ke default 12345678?`)) return

    setLoadingId(`${pelanggan.id}:reset`)
    setErrorMsg(null)

    try {
      await postAdminApi("/api/pelanggan/reset-password", {
        uid: user.uid,
        password: defaultPassword,
      })

      showSuccess(`Password ${pelanggan.nama} berhasil direset`)
    } catch (e: any) {
      console.error(e)
      showError(e?.message || `Gagal reset password ${pelanggan.nama}`)
    } finally {
      setLoadingId(null)
    }
  }

  const handleDeleteAccount = async (pelanggan: Pelanggan) => {
    const user = users[pelanggan.id]
    if (!user) {
      showError(`Akun ${pelanggan.nama} belum ada`)
      return
    }

    if (
      !confirm(
        `Hapus akun ${pelanggan.nama}?\n\nAuth Firebase, mapping users, dan uid di pelanggan akan dihapus.`
      )
    ) {
      return
    }

    setLoadingId(`${pelanggan.id}:delete`)
    setErrorMsg(null)

    try {
      await postAdminApi("/api/pelanggan/delete-user", {
        uid: user.uid,
        pelangganId: pelanggan.id,
      })

      setUsers((prev) => {
        const next = { ...prev }
        delete next[pelanggan.id]
        return next
      })

      setData((prev) =>
        prev.map((item) =>
          item.id === pelanggan.id
            ? {
                ...item,
                uid: "",
                updatedAt: Date.now(),
                updatedBy: auth.currentUser?.uid || "",
              }
            : item
        )
      )

      showSuccess(`Akun ${pelanggan.nama} berhasil dihapus`)
    } catch (e: any) {
      console.error(e)
      showError(e?.message || `Gagal hapus akun ${pelanggan.nama}`)
    } finally {
      setLoadingId(null)
    }
  }

  const handleGenerateAll = async () => {
    const notGenerated = filtered.filter((item) => !users[item.id] && item.aktif)

    if (!notGenerated.length) {
      showError("Semua pelanggan pada filter ini sudah punya akun atau sedang nonaktif")
      return
    }

    if (!confirm(`Sinkron akun untuk ${notGenerated.length} pelanggan?`)) return

    for (const item of notGenerated) {
      await handleGenerate(item)
    }

    showSuccess("Sinkron massal selesai")
  }

  return (
    <div className="space-y-4 text-slate-900 sm:space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-violet-500 bg-white p-4 shadow-sm sm:p-5"
      >
       <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
  <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-purple-500 shadow-lg shadow-violet-200/50 sm:h-14 sm:w-14">
    <UserPlus size={22} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
  </div>

  <div className="min-w-0 self-center sm:self-auto">
    <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
      Akun Pelanggan
    </h1>
    <p className="mt-1 hidden max-w-[180px] text-[10px] font-bold uppercase leading-[1.35] tracking-[0.22em] text-slate-400 sm:block sm:max-w-none">
      Buat atau sinkronkan akun login pelanggan
    </p>
  </div>
</div>

  <div className="flex items-center justify-between gap-2 sm:flex-shrink-0 sm:flex-wrap sm:justify-end">
    <div className="flex items-center gap-2">
      {filtered.length > 0 && (
        <div className="flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-violet-500 px-2.5 shadow-sm shadow-violet-200/50">
          <span className="text-xs font-black text-white">
            {limit === 0 ? filtered.length : paged.length}
          </span>
        </div>
      )}

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleGenerateAll}
        className="flex h-8 items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-400 to-purple-500 px-3 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-violet-200/50 transition-all hover:shadow-md"
      >
        <Zap size={13} strokeWidth={3} />
        <span className="sm:hidden">Sinkron</span>
        <span className="hidden sm:inline">Sinkron Semua</span>
      </motion.button>
    </div>

    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={fetchPelanggan}
      disabled={loading}
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 disabled:opacity-50"
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

        <div className="pointer-events-none absolute right-0 top-0 opacity-[0.03]">
          <Cpu size={140} strokeWidth={1} />
        </div>
      </motion.div>

      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
              <Check size={11} className="text-white" strokeWidth={3} />
            </div>
            <p className="text-[11px] font-bold text-emerald-700">{successMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500">
              <AlertCircle size={11} className="text-white" strokeWidth={3} />
            </div>
            <p className="text-[11px] font-bold text-red-700">{errorMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="col-span-2 sm:col-span-2">
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Cari Pelanggan
            </label>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Nama, email, telepon, kartu..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          <FilterSelect
            label="Tipe Member"
            value={selectedMember}
            onChange={(v) => {
              setSelectedMember(v)
              setPage(1)
            }}
            icon={ShieldCheck}
          >
            <option value="">Semua Member</option>
            {MEMBER_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Status Pelanggan"
            value={selectedAktif}
            onChange={(v) => {
              setSelectedAktif(v)
              setPage(1)
            }}
          >
            <option value="">Semua Status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </FilterSelect>

          <FilterSelect
            label="Status Akun"
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v as "all" | "generated" | "not_generated")
              setPage(1)
            }}
          >
            <option value="all">Semua Akun</option>
            <option value="generated">Sudah Generate</option>
            <option value="not_generated">Belum Generate</option>
          </FilterSelect>

          <FilterSelect
            label="Tampilkan"
            value={limit}
            onChange={(v) => {
              setLimit(Number(v))
              setPage(1)
            }}
          >
            {ITEMS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} data
              </option>
            ))}
          </FilterSelect>
        </div>
      </motion.div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-violet-500"
            />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Memuat data...
            </p>
          </div>
        </div>
      )}

      {!loading && paged.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3 py-16"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Users size={28} className="text-slate-300" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Tidak ada data pelanggan
          </p>
        </motion.div>
      )}

      {!loading && paged.length > 0 && (
        <div className="space-y-2 sm:hidden">
          {paged.map((d, idx) => {
            const user = users[d.id]
            const isGenerating = loadingId === `${d.id}:generate`
            const isResetting = loadingId === `${d.id}:reset`
            const isDeleting = loadingId === `${d.id}:delete`

            return (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-800">{d.nama}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {d.kodePelanggan || "-"} · {d.tipeMember}
                    </p>
                  </div>
                  {user && (
                    <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                      Aktif
                    </span>
                  )}
                </div>

                <div className="mb-2 space-y-1 text-xs font-semibold text-slate-600">
                  <div className="flex items-center gap-1">
                    <Phone size={11} strokeWidth={2.5} />
                    <p>{d.telepon || "-"}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <CreditCard size={11} strokeWidth={2.5} />
                    <p>{d.nomorKartu || "-"}</p>
                  </div>
                  <p>{d.email || "-"}</p>
                  {user && (
                    <div className="flex items-center gap-1 text-slate-500">
                      <Mail size={11} strokeWidth={2.5} />
                      <span>{user.email}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                  {!user ? (
                    <button
                      onClick={() => handleGenerate(d)}
                      disabled={!!loadingId}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-400 to-purple-500 px-3 py-2 text-[10px] font-black text-white shadow-sm disabled:opacity-60"
                    >
                      {isGenerating ? (
                        <>
                          <motion.span
                            animate={{ rotate: 360 }}
                            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                          >
                            <RefreshCw size={11} strokeWidth={2.5} />
                          </motion.span>
                          Memproses...
                        </>
                      ) : (
                        <>
                          <UserPlus size={11} strokeWidth={2.5} />
                          Sinkron Akun
                        </>
                      )}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleResetPassword(d)}
                        disabled={!!loadingId}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-700 disabled:opacity-60"
                      >
                        {isResetting ? (
                          <>
                            <motion.span
                              animate={{ rotate: 360 }}
                              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                            >
                              <RefreshCw size={11} strokeWidth={2.5} />
                            </motion.span>
                            Proses...
                          </>
                        ) : (
                          <>
                            <RotateCcw size={11} strokeWidth={2.5} />
                            Reset Password
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleDeleteAccount(d)}
                        disabled={!!loadingId}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-black text-red-700 disabled:opacity-60"
                      >
                        {isDeleting ? (
                          <>
                            <motion.span
                              animate={{ rotate: 360 }}
                              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                            >
                              <RefreshCw size={11} strokeWidth={2.5} />
                            </motion.span>
                            Proses...
                          </>
                        ) : (
                          <>
                            <Trash2 size={11} strokeWidth={2.5} />
                            Hapus Akun
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {!loading && paged.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white/60 shadow-sm backdrop-blur-xl sm:block"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 bg-white/80">
                <tr>
                  {[
                    "No",
                    "Nama",
                    "Telepon",
                    "Member",
                    "No Kartu",
                    "Email Pelanggan",
                    "Email Login",
                    "Aksi",
                  ].map((h) => (
                    <th
                      key={h}
                      className={`whitespace-nowrap px-3 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 ${
                        h === "No" || h === "Aksi" ? "text-center" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((d, i) => {
                  const user = users[d.id]
                  const isGenerating = loadingId === `${d.id}:generate`
                  const isResetting = loadingId === `${d.id}:reset`
                  const isDeleting = loadingId === `${d.id}:delete`

                  return (
                    <motion.tr
                      key={d.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.015 }}
                      className="border-t border-slate-100 transition-colors hover:bg-slate-50/60"
                    >
                      <td className="px-3 py-2.5 text-center font-bold text-slate-400">
                        {limit === 0 ? i + 1 : (page - 1) * limit + i + 1}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-bold text-slate-800">
                        {d.nama}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">
                        {d.telepon || "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">
                        {d.tipeMember || "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">
                        {d.nomorKartu || "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">
                        {d.email || "-"}
                      </td>
                      <td className="px-3 py-2.5">
                        {user ? (
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100">
                              <Mail size={12} className="text-emerald-600" strokeWidth={2.5} />
                            </div>
                            <span className="font-semibold text-slate-700">{user.email}</span>
                          </div>
                        ) : (
                          <span className="text-xs italic text-slate-300">Belum ada akun</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-center gap-1.5">
                          {!user ? (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleGenerate(d)}
                              disabled={!!loadingId}
                              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-400 to-purple-500 px-3 py-1.5 text-[10px] font-black text-white shadow-sm disabled:opacity-60"
                            >
                              {isGenerating ? (
                                <>
                                  <motion.span
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                                  >
                                    <RefreshCw size={11} strokeWidth={2.5} />
                                  </motion.span>
                                  Memproses...
                                </>
                              ) : (
                                <>
                                  <UserPlus size={11} strokeWidth={2.5} />
                                  Sinkron
                                </>
                              )}
                            </motion.button>
                          ) : (
                            <>
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleResetPassword(d)}
                                disabled={!!loadingId}
                                className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-black text-amber-700 shadow-sm disabled:opacity-60"
                              >
                                {isResetting ? (
                                  <>
                                    <motion.span
                                      animate={{ rotate: 360 }}
                                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                                    >
                                      <RefreshCw size={11} strokeWidth={2.5} />
                                    </motion.span>
                                    Proses...
                                  </>
                                ) : (
                                  <>
                                    <RotateCcw size={11} strokeWidth={2.5} />
                                    Reset
                                  </>
                                )}
                              </motion.button>

                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleDeleteAccount(d)}
                                disabled={!!loadingId}
                                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-black text-red-700 shadow-sm disabled:opacity-60"
                              >
                                {isDeleting ? (
                                  <>
                                    <motion.span
                                      animate={{ rotate: 360 }}
                                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                                    >
                                      <RefreshCw size={11} strokeWidth={2.5} />
                                    </motion.span>
                                    Proses...
                                  </>
                                ) : (
                                  <>
                                    <Trash2 size={11} strokeWidth={2.5} />
                                    Hapus
                                  </>
                                )}
                              </motion.button>
                            </>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {!loading && filtered.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {limit === 0 ? `${filtered.length} data` : `Hal ${page}/${totalPages} · ${filtered.length} data`}
          </p>

          {limit !== 0 && totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => goPage(page - 1)}
                disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
              </motion.button>

              {Array.from({ length: totalPages })
                .slice(Math.max(0, page - 3), Math.min(totalPages, page + 2))
                .map((_, idx) => {
                  const visibleStart = Math.max(0, page - 3)
                  const num = visibleStart + idx + 1
                  const active = num === page

                  return (
                    <motion.button
                      key={num}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => goPage(num)}
                      className={`flex h-8 min-w-[2rem] items-center justify-center rounded-xl px-2 text-xs font-black shadow-sm ${
                        active
                          ? "bg-gradient-to-r from-violet-400 to-purple-500 text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {num}
                    </motion.button>
                  )
                })}

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => goPage(page + 1)}
                disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight size={14} strokeWidth={2.5} />
              </motion.button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}