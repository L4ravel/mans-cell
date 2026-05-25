// Halaman admin untuk generate, reset password, dan hapus akun karyawan.
// Layout diseragamkan 100% dengan halaman akun/data pelanggan: tema biru muda, card mobile satu lapis, filter collapse, toast fixed, dan tabel rapi.

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore"
import { initializeApp, getApps } from "firebase/app"
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  type Auth,
} from "firebase/auth"
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
  Users,
  Zap,
  Store,
  RotateCcw,
  Trash2,
  CheckCircle2,
  ListFilter,
  Phone,
  Briefcase,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type Karyawan = {
  id: string
  nama: string
  email: string
  jabatan: string
  tokoId: string
  tokoNama: string
  noHp: string
  alamat: string
  role: string
  tahunMasuk: number
  aktif: boolean
  createdAt: number
}

type UserMap = {
  [karyawanId: string]: {
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

const normalizeText = (value: unknown) => String(value || "").trim()

function getSecondaryAuth(): Auth {
  const appName = "secondary-karyawan-auth"
  const existing = getApps().find((app) => app.name === appName)

  const secondaryApp =
    existing ??
    initializeApp(
      {
        apiKey: auth.app.options.apiKey,
        authDomain: auth.app.options.authDomain,
        projectId: auth.app.options.projectId,
        storageBucket: auth.app.options.storageBucket,
        messagingSenderId: auth.app.options.messagingSenderId,
        appId: auth.app.options.appId,
      },
      appName
    )

  return getAuth(secondaryApp)
}

function sanitizeEmailBase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim()
}

function generateEmailCandidates(karyawan: Karyawan) {
  const rawEmail = normalizeText(karyawan.email).toLowerCase()

  if (rawEmail && rawEmail.includes("@")) return [rawEmail]

  const fromNama = sanitizeEmailBase(karyawan.nama || "")
  if (!fromNama) return []

  return [
    `${fromNama}@karyawan.id`,
    `${fromNama}${String(karyawan.tahunMasuk || "").slice(-2)}@karyawan.id`,
    `${fromNama}${Date.now().toString().slice(-4)}@karyawan.id`,
  ]
}

export default function BuatAkunKaryawanPage() {
  const [data, setData] = useState<Karyawan[]>([])
  const [users, setUsers] = useState<UserMap>({})
  const [loading, setLoading] = useState(true)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [selectedToko, setSelectedToko] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "generated" | "not_generated">("all")
  const [tokoList, setTokoList] = useState<string[]>([])
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [limit, setLimit] = useState(10)
  const [page, setPage] = useState(1)

  const defaultPassword = "12345678"

  const showSuccess = (message: string) => {
    setSuccessMsg(message)
    setErrorMsg(null)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const showError = (message: string) => {
    setErrorMsg(message)
    setSuccessMsg(null)
    setTimeout(() => setErrorMsg(null), 4000)
  }

  const fetchKaryawan = async () => {
    setLoading(true)
    try {
      const qRef = query(collection(db, "karyawan"), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: Karyawan[] = snap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: normalizeText(x?.nama),
          email: normalizeText(x?.email),
          jabatan: normalizeText(x?.jabatan),
          tokoId: normalizeText(x?.tokoId),
          tokoNama: normalizeText(x?.tokoNama),
          noHp: normalizeText(x?.noHp),
          alamat: normalizeText(x?.alamat),
          role: normalizeText(x?.role) || "karyawan",
          tahunMasuk: Number(x?.tahunMasuk || 0),
          aktif: x?.aktif ?? true,
          createdAt: Number(x?.createdAt || 0),
        }
      })

      setData(list)
      setTokoList(
        [...new Set(list.map((item) => item.tokoNama).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b, "id")
        )
      )

      await fetchUsers(list)
    } catch (e) {
      console.error(e)
      setData([])
      setUsers({})
      showError("Gagal memuat data karyawan")
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async (karyawanList: Karyawan[]) => {
    if (!karyawanList.length) {
      setUsers({})
      return
    }

    try {
      const ids = karyawanList.map((item) => item.id)
      const chunks: string[][] = []

      for (let i = 0; i < ids.length; i += 10) {
        chunks.push(ids.slice(i, i + 10))
      }

      const map: UserMap = {}

      for (const chunk of chunks) {
        const snap = await getDocs(
          query(collection(db, "users"), where("karyawanId", "in", chunk))
        )

        snap.docs.forEach((d) => {
          const x = d.data() as any
          if (x?.karyawanId) {
            map[x.karyawanId] = {
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
      showError("Gagal memuat mapping user")
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) fetchKaryawan()
      else setLoading(false)
    })
    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return data.filter((item) => {
      const matchSearch =
        !q ||
        [item.nama, item.email, item.jabatan, item.tokoNama, item.noHp, item.alamat].some((value) =>
          value.toLowerCase().includes(q)
        )

      const matchToko = !selectedToko || item.tokoNama === selectedToko

      if (statusFilter === "generated" && !users[item.id]) return false
      if (statusFilter === "not_generated" && users[item.id]) return false

      return matchSearch && matchToko
    })
  }, [data, search, selectedToko, statusFilter, users])

  const stats = useMemo(() => {
    const total = data.length
    const generated = data.filter((item) => users[item.id]).length
    const notGenerated = Math.max(0, total - generated)

    return { total, generated, notGenerated }
  }, [data, users])

  const totalPages = limit === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / limit))
  const paged = limit === 0 ? filtered : filtered.slice((page - 1) * limit, page * limit)
  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const handleGenerate = async (karyawan: Karyawan) => {
    if (loadingId) return

    setLoadingId(`${karyawan.id}:generate`)
    setErrorMsg(null)

    const secondaryAuth = getSecondaryAuth()
    const emailCandidates = generateEmailCandidates(karyawan)

    if (!emailCandidates.length) {
      showError(`Email untuk ${karyawan.nama} tidak valid`)
      setLoadingId(null)
      return
    }

    try {
      let createdUser: { uid: string; email: string } | null = null
      let lastErrorMessage = ""

      for (const email of emailCandidates) {
        try {
          const cred = await createUserWithEmailAndPassword(
            secondaryAuth,
            email,
            defaultPassword
          )

          createdUser = {
            uid: cred.user.uid,
            email: cred.user.email || email,
          }

          await signOut(secondaryAuth)
          break
        } catch (err: any) {
          lastErrorMessage = err?.message || "Gagal membuat akun auth"
        }
      }

      if (!createdUser) {
        throw new Error(lastErrorMessage || "Semua kandidat email gagal dibuat")
      }

      await setDoc(doc(db, "users", createdUser.uid), {
        uid: createdUser.uid,
        email: createdUser.email,
        nama: karyawan.nama,
        karyawanId: karyawan.id,
        role: "karyawan",
        roles: ["karyawan"],
        tokoId: karyawan.tokoId || "",
        tokoNama: karyawan.tokoNama || "",
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || "",
      })

      setUsers((prev) => ({
        ...prev,
        [karyawan.id]: {
          uid: createdUser.uid,
          email: createdUser.email,
          roles: ["karyawan"],
        },
      }))

      showSuccess(`Akun ${karyawan.nama} berhasil dibuat`)
    } catch (e: any) {
      console.error(e)
      showError(e?.message || `Gagal membuat akun ${karyawan.nama}`)
    } finally {
      setLoadingId(null)
    }
  }

  async function postAdminApi(url: string, body: Record<string, any>) {
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

  const handleResetPassword = async (karyawan: Karyawan) => {
    const user = users[karyawan.id]
    if (!user) {
      showError(`Akun ${karyawan.nama} belum dibuat`)
      return
    }

    if (!confirm(`Reset password ${karyawan.nama} ke default 12345678?`)) return

    setLoadingId(`${karyawan.id}:reset`)
    setErrorMsg(null)

    try {
      await postAdminApi("/api/reset-password", {
        uid: user.uid,
        password: defaultPassword,
      })

      showSuccess(`Password ${karyawan.nama} berhasil direset`)
    } catch (e: any) {
      console.error(e)
      showError(e?.message || `Gagal reset password ${karyawan.nama}`)
    } finally {
      setLoadingId(null)
    }
  }

  const handleDeleteAccount = async (karyawan: Karyawan) => {
    const user = users[karyawan.id]
    if (!user) {
      showError(`Akun ${karyawan.nama} belum ada`)
      return
    }

    if (!confirm(`Hapus akun ${karyawan.nama}?\n\nAuth Firebase dan mapping users akan dihapus permanen.`)) {
      return
    }

    setLoadingId(`${karyawan.id}:delete`)
    setErrorMsg(null)

    try {
      await postAdminApi("/api/delete-user", { uid: user.uid })

      setUsers((prev) => {
        const next = { ...prev }
        delete next[karyawan.id]
        return next
      })

      showSuccess(`Akun ${karyawan.nama} berhasil dihapus`)
    } catch (e: any) {
      console.error(e)
      showError(e?.message || `Gagal hapus akun ${karyawan.nama}`)
    } finally {
      setLoadingId(null)
    }
  }

  const handleGenerateAll = async () => {
    const notGenerated = filtered.filter((item) => !users[item.id])

    if (!notGenerated.length) {
      showError("Semua karyawan pada filter ini sudah punya akun")
      return
    }

    if (!confirm(`Generate akun untuk ${notGenerated.length} karyawan?`)) return

    for (const item of notGenerated) {
      await handleGenerate(item)
    }

    showSuccess("Generate massal selesai")
  }

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
                <UserPlus size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Akun Karyawan
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Generate, reset password, dan hapus akun login karyawan.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <HeaderButton onClick={handleGenerateAll} icon={Zap} label="Generate Semua" />
              <button
                type="button"
                onClick={fetchKaryawan}
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

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard label="Total Karyawan" value={stats.total} icon={Users} tone="slate" />
          <StatCard label="Akun Dibuat" value={stats.generated} icon={CheckCircle2} tone="sky" />
          <StatCard label="Belum Akun" value={stats.notGenerated} icon={UserPlus} tone="blue" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Cari Karyawan
              </p>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  placeholder="Nama, email, jabatan..."
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>
            </div>

            <div className="hidden sm:contents">
              <FilterSelect label="Toko" value={selectedToko} onChange={(v) => { setSelectedToko(v); setPage(1) }} icon={Store}>
                <option value="">Semua Toko</option>
                {tokoList.map((nama) => (
                  <option key={nama} value={nama}>{nama}</option>
                ))}
              </FilterSelect>

              <FilterSelect label="Status" value={statusFilter} onChange={(v) => { setStatusFilter(v as "all" | "generated" | "not_generated"); setPage(1) }}>
                <option value="all">Semua Status</option>
                <option value="generated">Sudah Generate</option>
                <option value="not_generated">Belum Generate</option>
              </FilterSelect>

              <FilterSelect label="Tampilkan" value={limit} onChange={(v) => { setLimit(Number(v)); setPage(1) }}>
                {ITEMS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </FilterSelect>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:hidden">
            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={handleGenerateAll}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-white shadow-sm shadow-sky-500/15"
              type="button"
            >
              <Zap size={14} strokeWidth={2.5} />
              Generate
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={fetchKaryawan}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700 disabled:opacity-60"
              type="button"
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
              type="button"
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
                  <FilterSelect label="Toko" value={selectedToko} onChange={(v) => { setSelectedToko(v); setPage(1) }} icon={Store}>
                    <option value="">Semua Toko</option>
                    {tokoList.map((nama) => (
                      <option key={nama} value={nama}>{nama}</option>
                    ))}
                  </FilterSelect>

                  <FilterSelect label="Status" value={statusFilter} onChange={(v) => { setStatusFilter(v as "all" | "generated" | "not_generated"); setPage(1) }}>
                    <option value="all">Semua Status</option>
                    <option value="generated">Sudah Generate</option>
                    <option value="not_generated">Belum Generate</option>
                  </FilterSelect>

                  <FilterSelect label="Tampilkan" value={limit} onChange={(v) => { setLimit(Number(v)); setPage(1) }}>
                    {ITEMS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </FilterSelect>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <AkunKaryawanSection
          loading={loading}
          paged={paged}
          filtered={filtered}
          page={page}
          totalPages={totalPages}
          limit={limit}
          users={users}
          loadingId={loadingId}
          goPage={goPage}
          handleGenerate={handleGenerate}
          handleResetPassword={handleResetPassword}
          handleDeleteAccount={handleDeleteAccount}
        />
      </main>
    </div>
  )
}

function HeaderButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: any
  label: string
  onClick: () => void
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      onClick={onClick}
      className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15"
      title={label}
      type="button"
    >
      <Icon size={12} strokeWidth={2.8} />
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

function FieldBox({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
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
        {Icon && <Icon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${Icon ? "pl-9" : "pl-3"} py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20`}
        >
          {children}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
      </div>
    </FieldBox>
  )
}

function AkunKaryawanSection({
  loading,
  paged,
  filtered,
  page,
  totalPages,
  limit,
  users,
  loadingId,
  goPage,
  handleGenerate,
  handleResetPassword,
  handleDeleteAccount,
}: {
  loading: boolean
  paged: Karyawan[]
  filtered: Karyawan[]
  page: number
  totalPages: number
  limit: number
  users: UserMap
  loadingId: string | null
  goPage: (page: number) => void
  handleGenerate: (item: Karyawan) => void
  handleResetPassword: (item: Karyawan) => void
  handleDeleteAccount: (item: Karyawan) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
          />
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Memuat akun karyawan...
          </p>
        </div>
      </div>
    )
  }

  if (paged.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <Users size={28} className="text-slate-300" strokeWidth={2} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Tidak ada data karyawan
        </p>
      </div>
    )
  }

  return (
    <>
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
                        {item.tokoNama || "-"} · {item.jabatan || "-"}
                      </p>
                    </div>

                    <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${user ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
                      {user ? "Ada Akun" : "Belum"}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                    <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                      <Briefcase size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                      <span className="truncate">{item.jabatan || "-"}</span>
                    </p>
                    <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                      <Mail size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                      <span className="truncate">{item.email || "-"}</span>
                    </p>
                    <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                      <Phone size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                      <span className="truncate">{item.noHp || "-"}</span>
                    </p>
                    {user && (
                      <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                        <CheckCircle2 size={13} className="shrink-0 text-sky-500" strokeWidth={2.5} />
                        <span className="truncate">{user.email || "-"}</span>
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {!user ? (
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        transition={{ duration: 0.12, ease: "easeOut" }}
                        onClick={() => handleGenerate(item)}
                        disabled={!!loadingId}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-sky-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                      >
                        {isGenerating ? <RefreshCw size={13} className="animate-spin" strokeWidth={2.6} /> : <UserPlus size={13} strokeWidth={2.6} />}
                        {isGenerating ? "Memproses..." : "Generate Akun"}
                      </motion.button>
                    ) : (
                      <>
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          transition={{ duration: 0.12, ease: "easeOut" }}
                          onClick={() => handleResetPassword(item)}
                          disabled={!!loadingId}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-sky-700 shadow-sm transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                        >
                          {isResetting ? <RefreshCw size={13} className="animate-spin" strokeWidth={2.6} /> : <RotateCcw size={13} strokeWidth={2.6} />}
                          {isResetting ? "Proses..." : "Reset"}
                        </motion.button>

                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          transition={{ duration: 0.12, ease: "easeOut" }}
                          onClick={() => handleDeleteAccount(item)}
                          disabled={!!loadingId}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-300/70 bg-rose-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                        >
                          {isDeleting ? <RefreshCw size={13} className="animate-spin" strokeWidth={2.6} /> : <Trash2 size={13} strokeWidth={2.6} />}
                          {isDeleting ? "Proses..." : "Hapus"}
                        </motion.button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

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
                {["No", "Nama", "Toko", "Jabatan", "Email Karyawan", "Email Login", "Aksi"].map((head) => (
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
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.tokoNama || "-"}</td>
                    <td className="px-3 py-3">
                      <span className="whitespace-nowrap rounded-lg bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">
                        {item.jabatan || "-"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.email || "-"}</td>
                    <td className="px-3 py-3">
                      {user ? (
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                            <Mail size={13} strokeWidth={2.5} />
                          </div>
                          <span className="font-semibold text-slate-700">{user.email}</span>
                        </div>
                      ) : (
                        <span className="text-xs italic text-slate-300">Belum ada akun</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex justify-center gap-1.5">
                        {!user ? (
                          <button
                            type="button"
                            onClick={() => handleGenerate(item)}
                            disabled={!!loadingId}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-sky-500/15 transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isGenerating ? <RefreshCw size={13} className="animate-spin" strokeWidth={2.6} /> : <UserPlus size={13} strokeWidth={2.6} />}
                            {isGenerating ? "Proses" : "Generate"}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleResetPassword(item)}
                              disabled={!!loadingId}
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-sky-700 shadow-sm transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isResetting ? <RefreshCw size={13} className="animate-spin" strokeWidth={2.6} /> : <RotateCcw size={13} strokeWidth={2.6} />}
                              {isResetting ? "Proses" : "Reset"}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteAccount(item)}
                              disabled={!!loadingId}
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300/70 bg-rose-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isDeleting ? <RefreshCw size={13} className="animate-spin" strokeWidth={2.6} /> : <Trash2 size={13} strokeWidth={2.6} />}
                              {isDeleting ? "Proses" : "Hapus"}
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

      {limit !== 0 && totalPages > 1 && (
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
    </>
  )
}
