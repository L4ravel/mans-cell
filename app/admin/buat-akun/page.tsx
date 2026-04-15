// Halaman admin untuk generate, reset password, dan hapus akun karyawan.
// Aksi sensitif Firebase Auth diproses lewat API server agar aman dan bisa mengubah user lain.

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
  Check,
  Users,
  Zap,
  Store,
  RotateCcw,
  Trash2,
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
  { value: 0, label: "Semua" },
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
      <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
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
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          strokeWidth={2.5}
        />
      </div>
    </div>
  )
}

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
  const rawEmail = (karyawan.email || "").trim().toLowerCase()

  if (rawEmail && rawEmail.includes("@")) {
    return [rawEmail]
  }

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
  const [loading, setLoading] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [selectedToko, setSelectedToko] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "generated" | "not_generated">("all")
  const [tokoList, setTokoList] = useState<string[]>([])
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

  const fetchKaryawan = async () => {
    setLoading(true)
    try {
      const qRef = query(collection(db, "karyawan"), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: Karyawan[] = snap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: x?.nama || "",
          email: x?.email || "",
          jabatan: x?.jabatan || "",
          tokoId: x?.tokoId || "",
          tokoNama: x?.tokoNama || "",
          noHp: x?.noHp || "",
          alamat: x?.alamat || "",
          role: x?.role || "karyawan",
          tahunMasuk: Number(x?.tahunMasuk || 0),
          aktif: Boolean(x?.aktif),
          createdAt: Number(x?.createdAt || 0),
        }
      })

      setData(list)
      setTokoList(
        [...new Set(list.map((item) => item.tokoNama).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b)
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
        d.jabatan.toLowerCase().includes(q) ||
        d.tokoNama.toLowerCase().includes(q)

      const matchToko = !selectedToko || d.tokoNama === selectedToko

      if (statusFilter === "generated" && !users[d.id]) return false
      if (statusFilter === "not_generated" && users[d.id]) return false

      return matchSearch && matchToko
    })
  }, [data, search, selectedToko, statusFilter, users])

  const totalPages = limit === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / limit))
  const paged = limit === 0 ? filtered : filtered.slice((page - 1) * limit, page * limit)

  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  const handleGenerate = async (karyawan: Karyawan) => {
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
        password: "12345678",
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

    if (
      !confirm(
        `Hapus akun ${karyawan.nama}?\n\nAuth Firebase dan mapping users akan dihapus permanen.`
      )
    ) {
      return
    }

    setLoadingId(`${karyawan.id}:delete`)
    setErrorMsg(null)

    try {
      await postAdminApi("/api/delete-user", {
        uid: user.uid,
      })

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
    <div className="space-y-4 sm:space-y-5 text-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border-l-4 border-l-violet-500 border-t border-r border-b border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      >
       <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
  <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-purple-500 shadow-lg shadow-violet-200/50 sm:h-14 sm:w-14">
      <UserPlus size={22} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
    </div>

    <div className="min-w-0 self-center sm:self-auto">
      <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
        Buat Akun Karyawan
      </h1>
      <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
        Generate akun login karyawan
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
        <span className="sm:hidden">Generate</span>
        <span className="hidden sm:inline">Generate Semua</span>
      </motion.button>
    </div>

    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={fetchKaryawan}
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
      </AnimatePresence>

      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200"
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
        className="rounded-xl border-l-4 border-l-blue-500 border-t border-r border-b border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2 sm:col-span-1">
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
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Nama, email, jabatan..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white pl-8 pr-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 placeholder:font-normal transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          <FilterSelect
            label="Toko"
            value={selectedToko}
            onChange={(v) => {
              setSelectedToko(v)
              setPage(1)
            }}
            icon={Store}
          >
            <option value="">Semua Toko</option>
            {tokoList.map((nama) => (
              <option key={nama} value={nama}>
                {nama}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v as "all" | "generated" | "not_generated")
              setPage(1)
            }}
          >
            <option value="all">Semua Status</option>
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

      {!loading && paged.length > 0 && (
        <div className="sm:hidden space-y-2">
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
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-sm font-black text-slate-800">{d.nama}</p>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-0.5">
                      {d.tokoNama || "-"}
                    </p>
                  </div>
                  {user && (
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-black">
                      Aktif
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-600 font-semibold mb-2 space-y-1">
                  <p>{d.jabatan || "-"}</p>
                  <p>{d.email || "-"}</p>
                  {user && (
                    <div className="flex items-center gap-1 text-slate-500">
                      <Mail size={11} strokeWidth={2.5} />
                      <span>{user.email}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-1.5 flex-wrap pt-2 border-t border-slate-100">
                  {!user ? (
                    <button
                      onClick={() => handleGenerate(d)}
                      disabled={!!loadingId}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-violet-400 to-purple-500 text-white text-[10px] font-black shadow-sm disabled:opacity-60"
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
                          Generate Akun
                        </>
                      )}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleResetPassword(d)}
                        disabled={!!loadingId}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black disabled:opacity-60"
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
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[10px] font-black disabled:opacity-60"
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
          className="hidden sm:block overflow-hidden rounded-xl border border-slate-200 bg-white/60 backdrop-blur-xl shadow-sm"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/80 border-b border-slate-200">
                <tr>
                  {["No", "Nama", "Toko", "Jabatan", "Email Karyawan", "Email Login", "Aksi"].map((h) => (
                    <th
                      key={h}
                      className={`px-3 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 whitespace-nowrap ${
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
                      className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="px-3 py-2.5 text-center font-bold text-slate-400">
                        {limit === 0 ? i + 1 : (page - 1) * limit + i + 1}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap">
                        {d.nama}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 font-semibold whitespace-nowrap">
                        {d.tokoNama || "-"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 font-semibold whitespace-nowrap">
                        {d.jabatan || "-"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 font-semibold whitespace-nowrap">
                        {d.email || "-"}
                      </td>
                      <td className="px-3 py-2.5">
                        {user ? (
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100">
                              <Mail size={12} className="text-emerald-600" strokeWidth={2.5} />
                            </div>
                            <span className="text-slate-700 font-semibold">{user.email}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs italic">Belum ada akun</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5 justify-center">
                          {!user ? (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleGenerate(d)}
                              disabled={!!loadingId}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-400 to-purple-500 text-white text-[10px] font-black shadow-sm disabled:opacity-60"
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
                                  Generate
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
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black shadow-sm disabled:opacity-60"
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
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[10px] font-black shadow-sm disabled:opacity-60"
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
          className="flex items-center justify-between gap-3 flex-wrap"
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
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
              </motion.button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === "number" && p - (arr[idx - 1] as number) > 1) {
                    acc.push("...")
                  }
                  acc.push(p)
                  return acc
                }, [])
                .map((p, idx) =>
                  p === "..." ? (
                    <span key={`e-${idx}`} className="px-1 text-slate-400 text-xs font-bold">
                      ···
                    </span>
                  ) : (
                    <motion.button
                      key={p}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => goPage(p as number)}
                      className={`h-8 min-w-[2rem] px-2 rounded-xl text-xs font-black transition-all ${
                        page === p
                          ? "bg-gradient-to-r from-violet-400 to-purple-500 text-white shadow-sm"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {p}
                    </motion.button>
                  )
                )}

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => goPage(page + 1)}
                disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
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