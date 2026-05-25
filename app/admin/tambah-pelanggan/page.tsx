/*
  Halaman admin pelanggan untuk CRUD data pelanggan, membership, dan akun login Firebase Auth.
  Layout diseragamkan dengan halaman Tambah Karyawan: tema biru muda, card mobile satu lapis, filter mobile collapse, toast fixed, dan modal rapi.
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore"
import {
  Users,
  Cpu,
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  RefreshCw,
  AlertCircle,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  KeyRound,
  UserRound,
  CalendarDays,
  ShieldCheck,
  BadgePercent,
  Coins,
  ReceiptText,
  Image as ImageIcon,
  FileText,
  UserCog,
  CheckCircle2,
  Loader2,
  ListFilter,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { initializeApp, deleteApp } from "firebase/app"
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth"

// ─── Types ────────────────────────────────────────────────────────────────────

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

type FormState = typeof EMPTY_FORM

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
]

const MEMBER_OPTIONS = ["Reguler", "Silver", "Gold", "Platinum"] as const

const EMPTY_FORM = {
  nama: "",
  telepon: "",
  email: "",
  alamat: "",
  nomorKartu: "",
  kodePelanggan: "",
  password: "",
  aktif: true,

  tipeMember: "Reguler",
  poin: "0",
  totalTransaksi: "0",
  tanggalBergabung: new Date().toISOString().slice(0, 10),
  tanggalKedaluwarsa: "",
  diskon: "0",

  tanggalLahir: "",
  jenisKelamin: "",
  fotoUrl: "",
  catatan: "",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normalizeText = (value: unknown) => String(value || "").trim()

const toMillis = (dateString?: string) => {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.getTime()
}

const toDateInput = (value?: number | null) => {
  if (!value) return ""
  const date = new Date(value)
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, "0")
  const d = `${date.getDate()}`.padStart(2, "0")
  return `${y}-${m}-${d}`
}

const formatDate = (value?: number | null) => {
  if (!value) return "-"
  return new Date(value).toLocaleDateString("id-ID")
}

const formatNumber = (value: number) => {
  return Number(value || 0).toLocaleString("id-ID")
}

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const getFirebaseClientConfig = () => ({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
})

const createCustomerAuthUser = async (email: string, password: string, displayName: string) => {
  const config = getFirebaseClientConfig()

  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error("Konfigurasi Firebase client belum lengkap")
  }

  const tempAppName = `pelanggan-auth-${Date.now()}`
  const tempApp = initializeApp(config, tempAppName)

  try {
    const tempAuth = getAuth(tempApp)
    const credential = await createUserWithEmailAndPassword(tempAuth, email, password)

    if (displayName) {
      await updateProfile(credential.user, { displayName })
    }

    return credential.user.uid
  } finally {
    await deleteApp(tempApp)
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TambahPelangganPage() {
  const [data, setData] = useState<Pelanggan[]>([])
  const [loading, setLoading] = useState(true)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Pelanggan | null>(null)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterMember, setFilterMember] = useState("")
  const [filterAktif, setFilterAktif] = useState("")
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const isEdit = !!editId

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setErrorMsg(null)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const showError = (msg: string) => {
    setErrorMsg(msg)
    setSuccessMsg(null)
    setTimeout(() => setErrorMsg(null), 3500)
  }

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchData = async () => {
    const user = auth.currentUser
    if (!user) return

    setLoading(true)

    try {
      const qRef = query(collection(db, "pelanggan"), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: Pelanggan[] = snap.docs.map((item) => {
        const x = item.data() as any
        return {
          id: item.id,
          uid: normalizeText(x?.uid),
          nama: normalizeText(x?.nama),
          telepon: normalizeText(x?.telepon),
          email: normalizeText(x?.email),
          alamat: normalizeText(x?.alamat),
          nomorKartu: normalizeText(x?.nomorKartu),
          kodePelanggan: normalizeText(x?.kodePelanggan),
          aktif: x?.aktif ?? true,

          tipeMember: x?.tipeMember || "Reguler",
          poin: Number(x?.poin || 0),
          totalTransaksi: Number(x?.totalTransaksi || 0),
          tanggalBergabung: Number(x?.tanggalBergabung || Date.now()),
          tanggalKedaluwarsa: x?.tanggalKedaluwarsa ? Number(x.tanggalKedaluwarsa) : null,
          diskon: Number(x?.diskon || 0),

          tanggalLahir: normalizeText(x?.tanggalLahir),
          jenisKelamin: x?.jenisKelamin || "",
          fotoUrl: normalizeText(x?.fotoUrl),
          catatan: normalizeText(x?.catatan),

          createdAt: Number(x?.createdAt || Date.now()),
          createdBy: normalizeText(x?.createdBy),
          updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
          updatedBy: normalizeText(x?.updatedBy),
        }
      })

      setData(list)
    } catch (e) {
      console.error(e)
      setData([])
      showError("Gagal memuat data pelanggan")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) await fetchData()
      else setLoading(false)
    })
    return () => unsub()
  }, [])

  // ── Filtering & Pagination ───────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return data.filter((item) => {
      const matchSearch =
        !q ||
        [
          item.nama,
          item.telepon,
          item.email,
          item.alamat,
          item.nomorKartu,
          item.kodePelanggan,
          item.tipeMember,
          String(item.poin || ""),
          String(item.diskon || ""),
        ].some((value) => value.toLowerCase().includes(q))

      const matchMember = !filterMember || item.tipeMember === filterMember
      const matchAktif =
        !filterAktif ||
        (filterAktif === "aktif" && item.aktif) ||
        (filterAktif === "nonaktif" && !item.aktif)

      return matchSearch && matchMember && matchAktif
    })
  }, [data, search, filterMember, filterAktif])

  const stats = useMemo(() => {
    const total = data.length
    const aktifCount = data.filter((item) => item.aktif).length
    const memberKhusus = data.filter((item) => item.tipeMember !== "Reguler").length

    return { total, aktifCount, memberKhusus }
  }, [data])

  const totalPages = itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / itemsPerPage))
  const paged = itemsPerPage === 0 ? filtered : filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  const generateKodePelanggan = () => `CUS-${Date.now().toString().slice(-6)}`
  const generateNomorKartu = () => `CARD-${Date.now().toString().slice(-8)}`

  const setField = (key: keyof FormState) => (value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditId(null)
    setError(null)
  }

  const closeModal = () => {
    if (submitLoading) return
    setShowModal(false)
    resetForm()
  }

  const openAdd = () => {
    setForm({
      ...EMPTY_FORM,
      kodePelanggan: generateKodePelanggan(),
      nomorKartu: generateNomorKartu(),
      tanggalBergabung: new Date().toISOString().slice(0, 10),
    })
    setEditId(null)
    setError(null)
    setShowModal(true)
  }

  const openEdit = (item: Pelanggan) => {
    setForm({
      nama: item.nama || "",
      telepon: item.telepon || "",
      email: item.email || "",
      alamat: item.alamat || "",
      nomorKartu: item.nomorKartu || "",
      kodePelanggan: item.kodePelanggan || "",
      password: "",
      aktif: Boolean(item.aktif),

      tipeMember: item.tipeMember || "Reguler",
      poin: String(item.poin || 0),
      totalTransaksi: String(item.totalTransaksi || 0),
      tanggalBergabung: toDateInput(item.tanggalBergabung),
      tanggalKedaluwarsa: toDateInput(item.tanggalKedaluwarsa),
      diskon: String(item.diskon || 0),

      tanggalLahir: item.tanggalLahir || "",
      jenisKelamin: item.jenisKelamin || "",
      fotoUrl: item.fotoUrl || "",
      catatan: item.catatan || "",
    })
    setEditId(item.id)
    setError(null)
    setShowModal(true)
  }

  const validateForm = () => {
    if (!form.nama.trim()) return "Nama pelanggan wajib diisi"
    if (!form.telepon.trim()) return "Nomor telepon wajib diisi"
    if (!form.email.trim()) return "Email wajib diisi"
    if (!isValidEmail(form.email.trim())) return "Format email tidak valid"
    if (!form.alamat.trim()) return "Alamat wajib diisi"
    if (!form.nomorKartu.trim()) return "Nomor kartu wajib diisi"
    if (!form.kodePelanggan.trim()) return "Kode pelanggan wajib diisi"
    if (!isEdit && !form.password.trim()) return "Password wajib diisi"
    if (!form.tipeMember.trim()) return "Tipe member wajib dipilih"
    if (!form.tanggalBergabung) return "Tanggal bergabung wajib diisi"

    if (form.password && form.password.length < 6) return "Password minimal 6 karakter"

    const emailLower = form.email.trim().toLowerCase()
    const telepon = form.telepon.trim()
    const nomorKartu = form.nomorKartu.trim().toLowerCase()
    const kodePelanggan = form.kodePelanggan.trim().toLowerCase()

    const duplicateEmail = data.find((item) => item.email.trim().toLowerCase() === emailLower && (!editId || item.id !== editId))
    if (duplicateEmail) return "Email sudah dipakai pelanggan lain"

    const duplicateTelepon = data.find((item) => item.telepon.trim() === telepon && (!editId || item.id !== editId))
    if (duplicateTelepon) return "Nomor telepon sudah dipakai pelanggan lain"

    const duplicateCard = data.find((item) => item.nomorKartu.trim().toLowerCase() === nomorKartu && (!editId || item.id !== editId))
    if (duplicateCard) return "Nomor kartu sudah dipakai"

    const duplicateKode = data.find((item) => item.kodePelanggan.trim().toLowerCase() === kodePelanggan && (!editId || item.id !== editId))
    if (duplicateKode) return "Kode pelanggan sudah dipakai"

    const poin = Number(form.poin)
    const totalTransaksi = Number(form.totalTransaksi)
    const diskon = Number(form.diskon || 0)

    if (Number.isNaN(poin) || poin < 0) return "Poin tidak valid"
    if (Number.isNaN(totalTransaksi) || totalTransaksi < 0) return "Total transaksi tidak valid"
    if (Number.isNaN(diskon) || diskon < 0) return "Diskon tidak valid"
    if (diskon > 100) return "Diskon tidak boleh lebih dari 100%"

    const tanggalBergabung = toMillis(form.tanggalBergabung)
    const tanggalKedaluwarsa = toMillis(form.tanggalKedaluwarsa)

    if (!tanggalBergabung) return "Tanggal bergabung tidak valid"
    if (tanggalKedaluwarsa && tanggalKedaluwarsa < tanggalBergabung) {
      return "Tanggal kedaluwarsa tidak boleh lebih awal dari tanggal bergabung"
    }

    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const user = auth.currentUser
    if (!user || submitLoading) return

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitLoading(true)
    setError(null)

    try {
      const now = Date.now()
      const payloadBase = {
        nama: form.nama.trim(),
        telepon: form.telepon.trim(),
        email: form.email.trim().toLowerCase(),
        alamat: form.alamat.trim(),
        nomorKartu: form.nomorKartu.trim().toUpperCase(),
        kodePelanggan: form.kodePelanggan.trim().toUpperCase(),
        aktif: Boolean(form.aktif),

        tipeMember: form.tipeMember as Pelanggan["tipeMember"],
        poin: Number(form.poin || 0),
        totalTransaksi: Number(form.totalTransaksi || 0),
        tanggalBergabung: Number(toMillis(form.tanggalBergabung)),
        tanggalKedaluwarsa: toMillis(form.tanggalKedaluwarsa),
        diskon: Number(form.diskon || 0),

        tanggalLahir: form.tanggalLahir || "",
        jenisKelamin: (form.jenisKelamin || "") as Pelanggan["jenisKelamin"],
        fotoUrl: form.fotoUrl.trim(),
        catatan: form.catatan.trim(),
      }

      if (isEdit && editId) {
        const oldItem = data.find((item) => item.id === editId)

        await updateDoc(doc(db, "pelanggan", editId), {
          ...payloadBase,
          uid: oldItem?.uid || "",
          updatedAt: now,
          updatedBy: user.uid,
        })

        setData((prev) =>
          prev
            .map((item) =>
              item.id === editId
                ? {
                    ...item,
                    ...payloadBase,
                    uid: oldItem?.uid || item.uid || "",
                    updatedAt: now,
                    updatedBy: user.uid,
                  }
                : item
            )
            .sort((a, b) => a.nama.localeCompare(b.nama, "id"))
        )

        showSuccess("Data pelanggan berhasil diperbarui")
      } else {
        let uid = ""

        try {
          uid = await createCustomerAuthUser(payloadBase.email, form.password.trim(), payloadBase.nama)
        } catch (authError: any) {
          console.error(authError)
          if (authError?.code === "auth/email-already-in-use") {
            setError("Email sudah terdaftar di Firebase Auth")
            return
          }
          if (authError?.code === "auth/invalid-email") {
            setError("Email tidak valid")
            return
          }
          if (authError?.code === "auth/weak-password") {
            setError("Password terlalu lemah")
            return
          }
          setError("Gagal membuat akun login pelanggan")
          return
        }

        const newRef = doc(collection(db, "pelanggan"))
        const newItem: Pelanggan = {
          id: newRef.id,
          uid,
          ...payloadBase,
          createdAt: now,
          createdBy: user.uid,
        }

        await setDoc(newRef, newItem)

        setData((prev) => [newItem, ...prev].sort((a, b) => a.nama.localeCompare(b.nama, "id")))
        showSuccess("Pelanggan berhasil ditambahkan")
      }

      closeModal()
    } catch (e) {
      console.error(e)
      setError("Gagal menyimpan data pelanggan")
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || deleteLoading) return

    setDeleteLoading(true)

    try {
      await deleteDoc(doc(db, "pelanggan", deleteTarget.id))
      setData((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      showSuccess("Pelanggan berhasil dihapus")
    } catch (e) {
      console.error(e)
      showError("Gagal menghapus pelanggan")
    } finally {
      setDeleteLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
      <main className="relative w-full space-y-4 pb-28">
        {/* Header Banner */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <Users size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Data Pelanggan
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Kelola pelanggan, kartu member, poin, diskon, dan akun login.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <HeaderButton onClick={openAdd} icon={Plus} label="Tambah" />
              <button
                type="button"
                onClick={fetchData}
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

        {/* Toast */}
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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard label="Total Pelanggan" value={stats.total} icon={Users} tone="slate" />
          <StatCard label="Pelanggan Aktif" value={stats.aktifCount} icon={CheckCircle2} tone="sky" />
          <StatCard label="Member Khusus" value={stats.memberKhusus} icon={ShieldCheck} tone="blue" />
        </div>

        {/* Search & Filter */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Cari Pelanggan
              </p>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  placeholder="Nama, telepon, email, kartu..."
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>
            </div>

            <div className="hidden sm:contents">
              <FilterSelect label="Tipe Member" value={filterMember} onChange={(v) => { setFilterMember(v); setPage(1) }} icon={ShieldCheck}>
                <option value="">Semua Member</option>
                {MEMBER_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </FilterSelect>

              <FilterSelect label="Status" value={filterAktif} onChange={(v) => { setFilterAktif(v); setPage(1) }} icon={UserCog}>
                <option value="">Semua Status</option>
                <option value="aktif">Aktif</option>
                <option value="nonaktif">Nonaktif</option>
              </FilterSelect>

              <FilterSelect label="Tampilkan" value={itemsPerPage} onChange={(v) => { setItemsPerPage(Number(v)); setPage(1) }}>
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
              onClick={openAdd}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-white shadow-sm shadow-sky-500/15"
              type="button"
            >
              <Plus size={14} strokeWidth={2.5} />
              Tambah
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={fetchData}
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
                  <FilterSelect label="Tipe Member" value={filterMember} onChange={(v) => { setFilterMember(v); setPage(1) }} icon={ShieldCheck}>
                    <option value="">Semua Member</option>
                    {MEMBER_OPTIONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </FilterSelect>

                  <FilterSelect label="Status" value={filterAktif} onChange={(v) => { setFilterAktif(v); setPage(1) }} icon={UserCog}>
                    <option value="">Semua Status</option>
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </FilterSelect>

                  <FilterSelect label="Tampilkan" value={itemsPerPage} onChange={(v) => { setItemsPerPage(Number(v)); setPage(1) }}>
                    {ITEMS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </FilterSelect>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <PelangganSection
          loading={loading}
          paged={paged}
          filtered={filtered}
          page={page}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          goPage={goPage}
          openAdd={openAdd}
          openEdit={openEdit}
          setDeleteTarget={setDeleteTarget}
        />

        <PelangganFormModal
          show={showModal}
          isEdit={isEdit}
          form={form}
          error={error}
          submitLoading={submitLoading}
          setField={setField}
          closeModal={closeModal}
          handleSubmit={handleSubmit}
        />

        <DeleteModal
          target={deleteTarget}
          loading={deleteLoading}
          onClose={() => setDeleteTarget(null)}
          onDelete={handleDelete}
        />
      </main>
    </div>
  )
}

// ─── Components ───────────────────────────────────────────────────────────────

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

function PelangganSection({
  loading,
  paged,
  filtered,
  page,
  totalPages,
  itemsPerPage,
  goPage,
  openAdd,
  openEdit,
  setDeleteTarget,
}: {
  loading: boolean
  paged: Pelanggan[]
  filtered: Pelanggan[]
  page: number
  totalPages: number
  itemsPerPage: number
  goPage: (page: number) => void
  openAdd: () => void
  openEdit: (item: Pelanggan) => void
  setDeleteTarget: (item: Pelanggan) => void
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
            Memuat data pelanggan...
          </p>
        </div>
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <Users size={28} className="text-slate-300" strokeWidth={2} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Data pelanggan belum tersedia
        </p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          onClick={openAdd}
          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2 text-xs font-black text-white shadow-sm shadow-sky-500/15"
          type="button"
        >
          <Plus size={13} strokeWidth={2.5} />
          Tambah Manual
        </motion.button>
      </div>
    )
  }

  return (
    <>
      {/* Mobile Cards */}
      <div className="space-y-2 sm:hidden">
        {paged.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: idx * 0.03 }}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100/70"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                <Users size={20} strokeWidth={2.5} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black leading-tight text-slate-800">
                      {item.nama}
                    </p>
                    <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                      {item.kodePelanggan || "-"} · {item.tipeMember || "Reguler"}
                    </p>
                  </div>

                  <span
                    className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                      item.aktif ? "bg-sky-50 text-sky-700" : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {item.aktif ? "Aktif" : "Nonaktif"}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                  <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                    <Phone size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                    <span className="truncate">{item.telepon || "-"}</span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                    <Mail size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                    <span className="truncate">{item.email || "-"}</span>
                  </p>
                  <p className="flex min-w-0 items-start gap-2 text-xs font-semibold leading-relaxed text-slate-600">
                    <MapPin size={13} className="mt-0.5 shrink-0 text-slate-400" strokeWidth={2.5} />
                    <span className="line-clamp-2">{item.alamat || "-"}</span>
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                  <MiniInfo label="Poin" value={formatNumber(item.poin)} />
                  <MiniInfo label="Diskon" value={`${item.diskon || 0}%`} />
                  <MiniInfo label="Kartu" value={item.nomorKartu || "-"} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    onClick={() => openEdit(item)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-sky-700 shadow-sm transition hover:bg-sky-100"
                    type="button"
                  >
                    <Pencil size={13} strokeWidth={2.6} />
                    Edit
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    onClick={() => setDeleteTarget(item)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300/70 bg-rose-600 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700"
                    type="button"
                  >
                    <Trash2 size={13} strokeWidth={2.6} />
                    Hapus
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Desktop Table */}
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
                {["No", "Pelanggan", "Telepon", "Kartu", "Member", "Poin", "Diskon", "Status", "Aksi"].map((head) => (
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
              {paged.map((item, index) => (
                <tr key={item.id} className="border-t border-slate-100 transition-colors hover:bg-sky-50/40">
                  <td className="px-3 py-3 text-center font-bold text-slate-400">
                    {itemsPerPage === 0 ? index + 1 : (page - 1) * itemsPerPage + index + 1}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="font-black text-slate-800">{item.nama}</div>
                    <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.email || "-"}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.telepon || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.nomorKartu || "-"}</td>
                  <td className="px-3 py-3">
                    <span className="whitespace-nowrap rounded-lg bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">
                      {item.tipeMember}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{formatNumber(item.poin)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.diskon || 0}%</td>
                  <td className="px-3 py-3">
                    <span className={`whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-black ${item.aktif ? "bg-sky-50 text-sky-700" : "bg-rose-50 text-rose-700"}`}>
                      {item.aktif ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:bg-sky-100"
                        title="Edit pelanggan"
                      >
                        <Pencil size={13} strokeWidth={2.6} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/70 bg-rose-600 text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700"
                        title="Hapus pelanggan"
                      >
                        <Trash2 size={13} strokeWidth={2.6} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {itemsPerPage !== 0 && totalPages > 1 && (
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

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 px-2 py-2">
      <p className="truncate text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-[10px] font-black text-slate-700">{value}</p>
    </div>
  )
}

function PelangganFormModal({
  show,
  isEdit,
  form,
  error,
  submitLoading,
  setField,
  closeModal,
  handleSubmit,
}: {
  show: boolean
  isEdit: boolean
  form: FormState
  error: string | null
  submitLoading: boolean
  setField: (key: keyof FormState) => (value: any) => void
  closeModal: () => void
  handleSubmit: (e: React.FormEvent) => void
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitLoading) closeModal()
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                  {isEdit ? "Edit Data Pelanggan" : "Tambah Data Pelanggan"}
                </p>
                <h2 className="truncate text-base font-black text-slate-800">
                  {form.nama || "Pelanggan Baru"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={submitLoading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <X size={17} strokeWidth={2.5} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="max-h-[calc(88vh-65px)] overflow-y-auto p-4 sm:p-5">
              <div className="space-y-4">
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5"
                    >
                      <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-600" strokeWidth={2.5} />
                      <p className="text-[11px] font-bold text-red-700">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <FormGroup title="Data Wajib" icon={UserRound}>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
                    <FieldInput label="Nama Pelanggan" value={form.nama} onChange={(v) => setField("nama")(v)} icon={UserRound} placeholder="Contoh: Ahmad Fauzan" />
                    <FieldInput label="Nomor Telepon" value={form.telepon} onChange={(v) => setField("telepon")(v)} icon={Phone} placeholder="08xxxxxxxxxx" />
                    <FieldInput label="Email" value={form.email} onChange={(v) => setField("email")(v)} icon={Mail} type="email" placeholder="pelanggan@email.com" />
                    <FieldInput label="Nomor Kartu" value={form.nomorKartu} onChange={(v) => setField("nomorKartu")(v)} icon={CreditCard} placeholder="CARD-00000123" />
                    <FieldInput label="Kode Pelanggan" value={form.kodePelanggan} onChange={(v) => setField("kodePelanggan")(v)} icon={KeyRound} placeholder="CUS-000123" />
                    {!isEdit && (
                      <FieldInput label="Password" value={form.password} onChange={(v) => setField("password")(v)} icon={ShieldCheck} type="password" placeholder="Minimal 6 karakter" />
                    )}
                    <FieldSelect label="Status" value={form.aktif ? "aktif" : "nonaktif"} onChange={(v) => setField("aktif")(v === "aktif")} icon={UserCog}>
                      <option value="aktif">Aktif</option>
                      <option value="nonaktif">Nonaktif</option>
                    </FieldSelect>
                    <FieldTextarea label="Alamat" value={form.alamat} onChange={(v) => setField("alamat")(v)} icon={MapPin} placeholder="Alamat lengkap pelanggan" className="sm:col-span-2" />
                  </div>
                </FormGroup>

                <FormGroup title="Data Keanggotaan" icon={ShieldCheck}>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
                    <FieldSelect label="Tipe Member" value={form.tipeMember} onChange={(v) => setField("tipeMember")(v)} icon={ShieldCheck}>
                      {MEMBER_OPTIONS.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </FieldSelect>
                    <FieldInput label="Poin Loyalitas" value={form.poin} onChange={(v) => setField("poin")(v)} icon={Coins} type="number" min="0" placeholder="0" />
                    <FieldInput label="Total Transaksi" value={form.totalTransaksi} onChange={(v) => setField("totalTransaksi")(v)} icon={ReceiptText} type="number" min="0" placeholder="0" />
                    <FieldInput label="Tanggal Bergabung" value={form.tanggalBergabung} onChange={(v) => setField("tanggalBergabung")(v)} icon={CalendarDays} type="date" />
                    <FieldInput label="Tanggal Kedaluwarsa" value={form.tanggalKedaluwarsa} onChange={(v) => setField("tanggalKedaluwarsa")(v)} icon={CalendarDays} type="date" />
                    <FieldInput label="Diskon Khusus (%)" value={form.diskon} onChange={(v) => setField("diskon")(v)} icon={BadgePercent} type="number" min="0" max="100" placeholder="0" />
                  </div>
                </FormGroup>

                <FormGroup title="Data Tambahan" icon={FileText}>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
                    <FieldInput label="Tanggal Lahir" value={form.tanggalLahir} onChange={(v) => setField("tanggalLahir")(v)} icon={CalendarDays} type="date" />
                    <FieldSelect label="Jenis Kelamin" value={form.jenisKelamin} onChange={(v) => setField("jenisKelamin")(v)} icon={UserRound}>
                      <option value="">Pilih Jenis Kelamin</option>
                      <option value="L">Laki-laki</option>
                      <option value="P">Perempuan</option>
                    </FieldSelect>
                    <FieldInput label="Foto Profil URL" value={form.fotoUrl} onChange={(v) => setField("fotoUrl")(v)} icon={ImageIcon} placeholder="https://..." />
                    <FieldTextarea label="Catatan" value={form.catatan} onChange={(v) => setField("catatan")(v)} icon={FileText} placeholder="Catatan tambahan pelanggan" className="sm:col-span-2 lg:col-span-3" />
                  </div>
                </FormGroup>

                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <PreviewBox label="Kode" value={form.kodePelanggan || "Belum ada"} />
                  <PreviewBox label="Kartu" value={form.nomorKartu || "Belum ada"} />
                  <PreviewBox label="Member" value={form.tipeMember || "-"} />
                  <PreviewBox label="Status" value={form.aktif ? "Aktif" : "Nonaktif"} />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X size={16} strokeWidth={2.5} />
                    Batal
                  </button>

                  <button
                    type="submit"
                    disabled={submitLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-sky-500/15 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : isEdit ? (
                      <Pencil size={16} strokeWidth={2.5} />
                    ) : (
                      <Plus size={16} strokeWidth={2.5} />
                    )}
                    {submitLoading ? "Proses" : isEdit ? "Update" : "Simpan"}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function FormGroup({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: any
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
          <Icon size={16} strokeWidth={2.5} />
        </div>
        <h3 className="text-sm font-black text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function PreviewBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-sky-700">{value}</p>
    </div>
  )
}

function FieldInput({
  label,
  value,
  onChange,
  icon: Icon,
  className = "",
  ...props
}: {
  label: string
  value: string
  onChange: (value: string) => void
  icon?: any
  className?: string
  [key: string]: any
}) {
  return (
    <div className={className}>
      <label className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
      </label>
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
      />
    </div>
  )
}

function FieldTextarea({
  label,
  value,
  onChange,
  icon: Icon,
  className = "",
  ...props
}: {
  label: string
  value: string
  onChange: (value: string) => void
  icon?: any
  className?: string
  [key: string]: any
}) {
  return (
    <div className={className}>
      <label className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
      </label>
      <textarea
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full resize-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
      />
    </div>
  )
}

function FieldSelect({
  label,
  value,
  onChange,
  children,
  icon: Icon,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  icon?: any
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        >
          {children}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
  )
}

function DeleteModal({
  target,
  loading,
  onClose,
  onDelete,
}: {
  target: Pelanggan | null
  loading: boolean
  onClose: () => void
  onDelete: () => void
}) {
  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="relative overflow-hidden bg-gradient-to-br from-rose-500 to-red-600 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
                  <Trash2 size={20} className="text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-base font-black leading-none tracking-tight text-white">Hapus Pelanggan</h2>
                  <p className="mt-0.5 max-w-[220px] truncate text-[10px] font-bold uppercase tracking-[0.15em] text-white/70">
                    {target.nama}
                  </p>
                </div>
              </div>
              <div className="pointer-events-none absolute right-0 top-0 opacity-10">
                <Cpu size={100} strokeWidth={1} className="text-white" />
              </div>
            </div>

            <div className="space-y-3 p-5">
              <p className="text-[11px] font-semibold text-slate-600">
                Kamu yakin mau menghapus pelanggan ini?
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black text-slate-800">{target.nama}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {target.kodePelanggan || "-"} · {target.tipeMember || "Reguler"}
                </p>
              </div>
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={onClose}
                disabled={loading}
                className="flex-1 rounded-full border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                Batal
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={onDelete}
                disabled={loading}
                className="flex-1 rounded-full bg-gradient-to-r from-rose-500 to-red-600 py-2.5 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-rose-200/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Menghapus...
                  </span>
                ) : (
                  "Hapus"
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
