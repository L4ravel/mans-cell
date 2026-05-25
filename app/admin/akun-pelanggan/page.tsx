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
  CheckCircle2,
  ListFilter,
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
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
]

const MEMBER_OPTIONS = ["Reguler", "Silver", "Gold", "Platinum"] as const

function FieldBox({
  label,
  children,
  className = "",
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      {children}
    </div>
  )
}

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
    <FieldBox label={label}>
      <div className="relative">
        {Icon && (
          <Icon
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2.5}
          />
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${
            Icon ? "pl-9" : "pl-3"
          } py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20`}
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          strokeWidth={2.5}
        />
      </div>
    </FieldBox>
  )
}

function HeaderButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: any
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
      title={label}
      type="button"
    >
      <Icon size={12} strokeWidth={2.8} className={disabled ? "animate-spin" : ""} />
      <span>{label}</span>
    </motion.button>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: any
  tone: "slate" | "sky" | "blue"
}) {
  const cls =
    tone === "sky"
      ? "bg-sky-50 text-sky-600"
      : tone === "blue"
        ? "bg-blue-50 text-blue-600"
        : "bg-slate-100 text-slate-500"

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
      <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left">
        <div className={`hidden h-9 w-9 items-center justify-center rounded-2xl sm:flex sm:h-11 sm:w-11 ${cls}`}>
          <Icon size={18} strokeWidth={2.5} className="sm:h-[21px] sm:w-[21px]" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          <p className="text-lg font-black leading-tight text-slate-800 sm:text-2xl">{value}</p>
        </div>
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
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
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

  const stats = useMemo(() => {
    const total = data.length
    const akunAktif = data.filter((item) => !!users[item.id]).length
    const belumAkun = data.filter((item) => !users[item.id]).length

    return { total, akunAktif, belumAkun }
  }, [data, users])

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
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
      <main className="relative w-full space-y-4 pb-28">
        {/* ── Header Banner ── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <UserPlus size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Akun Pelanggan
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Buat, sinkronkan, reset password, dan hapus akun login pelanggan.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <HeaderButton onClick={handleGenerateAll} icon={Zap} label="Sinkron Semua" disabled={!!loadingId} />
              <HeaderButton onClick={fetchPelanggan} icon={RefreshCw} label="Refresh" disabled={loading} />
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.04]">
            <Cpu size={150} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        {/* ── Toast ── */}
        <AnimatePresence>
          {(successMsg || errorMsg) && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border px-4 py-3 shadow-lg ${
                successMsg ? "border-sky-200 bg-sky-50" : "border-red-200 bg-red-50"
              }`}
            >
              {successMsg ? (
                <CheckCircle2 size={16} className="text-sky-600" strokeWidth={2.5} />
              ) : (
                <AlertCircle size={16} className="text-red-600" strokeWidth={2.5} />
              )}
              <p className={`max-w-xs text-xs font-black ${successMsg ? "text-sky-700" : "text-red-700"}`}>
                {successMsg || errorMsg}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard label="Total Pelanggan" value={stats.total} icon={Users} tone="slate" />
          <StatCard label="Akun Aktif" value={stats.akunAktif} icon={CheckCircle2} tone="sky" />
          <StatCard label="Belum Akun" value={stats.belumAkun} icon={UserPlus} tone="blue" />
        </div>

        {/* ── Search & Filter ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2 lg:col-span-1">
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Cari Pelanggan
              </p>
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  strokeWidth={2.5}
                />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  placeholder="Nama, email, telepon, kartu..."
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>
            </div>

            <div className="hidden sm:contents">
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
                {ITEMS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </FilterSelect>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:hidden">
            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={handleGenerateAll}
              disabled={!!loadingId}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-white shadow-sm shadow-sky-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Zap size={14} strokeWidth={2.5} />
              Sinkron
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={fetchPelanggan}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={14} strokeWidth={2.5} className={loading ? "animate-spin" : ""} />
              Refresh
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={() => setFilterMobileOpen((prev) => !prev)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] transition ${
                filterMobileOpen
                  ? "border-sky-200 bg-sky-100 text-sky-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <ListFilter size={14} strokeWidth={2.5} />
              Filter
            </motion.button>
          </div>

          <AnimatePresence initial={false}>
            {filterMobileOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -4 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -4 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="overflow-hidden sm:hidden"
              >
                <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
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
                    {ITEMS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
              />
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Memuat data pelanggan...
              </p>
            </div>
          </div>
        )}

        {!loading && paged.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Users size={28} className="text-slate-300" strokeWidth={2} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Tidak ada data pelanggan
            </p>
          </div>
        )}

        {!loading && paged.length > 0 && (
          <div className="space-y-2 sm:hidden">
            {paged.map((item, idx) => {
              const user = users[item.id]
              const isGenerating = loadingId === `${item.id}:generate`
              const isResetting = loadingId === `${item.id}:reset`
              const isDeleting = loadingId === `${item.id}:delete`

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.03 }}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100/70"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                      <UserPlus size={20} strokeWidth={2.5} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black leading-tight text-slate-800">
                            {item.nama}
                          </p>
                          <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                            {item.kodePelanggan || "-"} · {item.tipeMember || "-"}
                          </p>
                        </div>

                        <span
                          className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                            user ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {user ? "Akun Ada" : "Belum Akun"}
                        </span>
                      </div>

                      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                        <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                          <Phone size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                          <span className="truncate">{item.telepon || "-"}</span>
                        </p>
                        <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                          <CreditCard size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                          <span className="truncate">{item.nomorKartu || "-"}</span>
                        </p>
                        <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                          <Mail size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                          <span className="truncate">{user?.email || item.email || "-"}</span>
                        </p>
                      </div>

                      <div className="mt-3 flex flex-col gap-2">
                        {!user ? (
                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            transition={{ duration: 0.12, ease: "easeOut" }}
                            onClick={() => handleGenerate(item)}
                            disabled={!!loadingId}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-sky-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                            type="button"
                          >
                            {isGenerating ? (
                              <>
                                <RefreshCw size={13} className="animate-spin" strokeWidth={2.5} />
                                Memproses...
                              </>
                            ) : (
                              <>
                                <UserPlus size={13} strokeWidth={2.5} />
                                Sinkron Akun
                              </>
                            )}
                          </motion.button>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <motion.button
                              whileTap={{ scale: 0.97 }}
                              transition={{ duration: 0.12, ease: "easeOut" }}
                              onClick={() => handleResetPassword(item)}
                              disabled={!!loadingId}
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-sky-700 shadow-sm transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                              type="button"
                            >
                              {isResetting ? (
                                <>
                                  <RefreshCw size={13} className="animate-spin" strokeWidth={2.5} />
                                  Proses...
                                </>
                              ) : (
                                <>
                                  <RotateCcw size={13} strokeWidth={2.5} />
                                  Reset
                                </>
                              )}
                            </motion.button>

                            <motion.button
                              whileTap={{ scale: 0.97 }}
                              transition={{ duration: 0.12, ease: "easeOut" }}
                              onClick={() => handleDeleteAccount(item)}
                              disabled={!!loadingId}
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300/70 bg-rose-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                              type="button"
                            >
                              {isDeleting ? (
                                <>
                                  <RefreshCw size={13} className="animate-spin" strokeWidth={2.5} />
                                  Proses...
                                </>
                              ) : (
                                <>
                                  <Trash2 size={13} strokeWidth={2.5} />
                                  Hapus
                                </>
                              )}
                            </motion.button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {!loading && paged.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/70">
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
                    ].map((head) => (
                      <th
                        key={head}
                        className={`whitespace-nowrap px-3 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 ${
                          head === "No" || head === "Aksi" ? "text-center" : "text-left"
                        }`}
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((item, index) => {
                    const user = users[item.id]
                    const isGenerating = loadingId === `${item.id}:generate`
                    const isResetting = loadingId === `${item.id}:reset`
                    const isDeleting = loadingId === `${item.id}:delete`

                    return (
                      <tr key={item.id} className="border-t border-slate-100 transition-colors hover:bg-sky-50/40">
                        <td className="px-3 py-3 text-center font-bold text-slate-400">
                          {limit === 0 ? index + 1 : (page - 1) * limit + index + 1}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{item.nama}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.telepon || "-"}</td>
                        <td className="px-3 py-3">
                          <span className="whitespace-nowrap rounded-lg bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">
                            {item.tipeMember || "-"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.nomorKartu || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.email || "-"}</td>
                        <td className="px-3 py-3">
                          {user ? (
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                                <Mail size={13} strokeWidth={2.5} />
                              </div>
                              <span className="font-semibold text-slate-700">{user.email}</span>
                            </div>
                          ) : (
                            <span className="text-xs italic text-slate-300">Belum ada akun</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-center gap-1.5">
                            {!user ? (
                              <button
                                type="button"
                                onClick={() => handleGenerate(item)}
                                disabled={!!loadingId}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-sky-500/15 transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isGenerating ? (
                                  <>
                                    <RefreshCw size={13} className="animate-spin" strokeWidth={2.5} />
                                    Memproses...
                                  </>
                                ) : (
                                  <>
                                    <UserPlus size={13} strokeWidth={2.5} />
                                    Sinkron
                                  </>
                                )}
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleResetPassword(item)}
                                  disabled={!!loadingId}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-sky-700 shadow-sm transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isResetting ? (
                                    <>
                                      <RefreshCw size={13} className="animate-spin" strokeWidth={2.5} />
                                      Proses...
                                    </>
                                  ) : (
                                    <>
                                      <RotateCcw size={13} strokeWidth={2.5} />
                                      Reset
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteAccount(item)}
                                  disabled={!!loadingId}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300/70 bg-rose-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isDeleting ? (
                                    <>
                                      <RefreshCw size={13} className="animate-spin" strokeWidth={2.5} />
                                      Proses...
                                    </>
                                  ) : (
                                    <>
                                      <Trash2 size={13} strokeWidth={2.5} />
                                      Hapus
                                    </>
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {!loading && filtered.length > 0 && limit !== 0 && totalPages > 1 && (
          <div className="flex justify-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => goPage(page - 1)}
              disabled={page === 1}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft size={14} strokeWidth={2.5} />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                if (idx > 0 && typeof arr[idx - 1] === "number" && p - (arr[idx - 1] as number) > 1) acc.push("...")
                acc.push(p)
                return acc
              }, [])
              .map((p, idx) =>
                p === "..." ? (
                  <span key={`e-${idx}`} className="px-1 text-xs font-bold text-slate-400">···</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => goPage(p)}
                    className={`h-8 min-w-8 rounded-xl px-2 text-xs font-black transition ${
                      page === p
                        ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-sm shadow-sky-500/15"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

            <button
              type="button"
              onClick={() => goPage(page + 1)}
              disabled={page === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight size={14} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </main>
    </div>
  )
}