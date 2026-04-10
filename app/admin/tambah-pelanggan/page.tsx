/* 
  Halaman admin pelanggan untuk CRUD data pelanggan, membership, dan akun login Firebase Auth.
  Revisi ini mendukung card ID, kode member, status aktif, poin, diskon, tanggal keanggotaan, dan password pelanggan.
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
import { useRouter } from "next/navigation"
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
  Check,
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
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { initializeApp, getApps, deleteApp } from "firebase/app"
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth"

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

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 0, label: "Semua" },
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

function FormInput({
  label,
  required,
  icon: Icon,
  ...props
}: {
  label: string
  required?: boolean
  icon?: any
  [k: string]: any
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <input
        {...props}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
      />
    </div>
  )
}

function FormTextarea({
  label,
  icon: Icon,
  ...props
}: {
  label: string
  icon?: any
  [k: string]: any
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
      </label>
      <textarea
        {...props}
        className="min-h-[96px] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
      />
    </div>
  )
}

function FormSelect({
  label,
  required,
  icon: Icon,
  children,
  ...props
}: {
  label: string
  required?: boolean
  icon?: any
  children: React.ReactNode
  [k: string]: any
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <div className="relative">
        <select
          {...props}
          className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
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

function toMillis(dateString?: string) {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.getTime()
}

function toDateInput(value?: number | null) {
  if (!value) return ""
  const date = new Date(value)
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, "0")
  const d = `${date.getDate()}`.padStart(2, "0")
  return `${y}-${m}-${d}`
}

function formatDate(value?: number | null) {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("id-ID")
}

function getFirebaseClientConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }
}

async function createCustomerAuthUser(email: string, password: string, displayName: string) {
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

export default function TambahPelangganPage() {
  const router = useRouter()

  const [data, setData] = useState<Pelanggan[]>([])
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterMember, setFilterMember] = useState("")
  const [filterAktif, setFilterAktif] = useState("")
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const isEdit = !!editId

  const fetchData = async () => {
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
          tanggalBergabung: Number(x?.tanggalBergabung || Date.now()),
          tanggalKedaluwarsa: x?.tanggalKedaluwarsa ? Number(x.tanggalKedaluwarsa) : null,
          diskon: Number(x?.diskon || 0),

          tanggalLahir: x?.tanggalLahir || "",
          jenisKelamin: x?.jenisKelamin || "",
          fotoUrl: x?.fotoUrl || "",
          catatan: x?.catatan || "",

          createdAt: Number(x?.createdAt || Date.now()),
          createdBy: x?.createdBy || "",
          updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
          updatedBy: x?.updatedBy || "",
        }
      })

      setData(list)
    } catch (e) {
      console.error(e)
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        await fetchData()
      }
    })
    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    return data.filter((d) => {
      const q = search.toLowerCase().trim()

      const matchSearch =
        !q ||
        d.nama.toLowerCase().includes(q) ||
        d.telepon.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q) ||
        d.nomorKartu.toLowerCase().includes(q) ||
        d.kodePelanggan.toLowerCase().includes(q) ||
        d.tipeMember.toLowerCase().includes(q)

      const matchMember = !filterMember || d.tipeMember === filterMember
      const matchAktif =
        !filterAktif ||
        (filterAktif === "aktif" && d.aktif) ||
        (filterAktif === "nonaktif" && !d.aktif)

      return matchSearch && matchMember && matchAktif
    })
  }, [data, search, filterMember, filterAktif])

  const totalPages =
    itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / itemsPerPage))

  const paged =
    itemsPerPage === 0
      ? filtered
      : filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  const closeModal = () => {
    setShowModal(false)
    setEditId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  const generateKodePelanggan = () => {
    return `CUS-${Date.now().toString().slice(-6)}`
  }

  const generateNomorKartu = () => {
    return `CARD-${Date.now().toString().slice(-8)}`
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

  const openEdit = (d: Pelanggan) => {
    setForm({
      nama: d.nama || "",
      telepon: d.telepon || "",
      email: d.email || "",
      alamat: d.alamat || "",
      nomorKartu: d.nomorKartu || "",
      kodePelanggan: d.kodePelanggan || "",
      password: "",
      aktif: Boolean(d.aktif),

      tipeMember: d.tipeMember || "Reguler",
      poin: String(d.poin || 0),
      totalTransaksi: String(d.totalTransaksi || 0),
      tanggalBergabung: toDateInput(d.tanggalBergabung),
      tanggalKedaluwarsa: toDateInput(d.tanggalKedaluwarsa),
      diskon: String(d.diskon || 0),

      tanggalLahir: d.tanggalLahir || "",
      jenisKelamin: d.jenisKelamin || "",
      fotoUrl: d.fotoUrl || "",
      catatan: d.catatan || "",
    })
    setEditId(d.id)
    setError(null)
    setShowModal(true)
  }

  const setField =
    (key: keyof typeof EMPTY_FORM) =>
    (val: any) =>
      setForm((f) => ({ ...f, [key]: val }))

  const validateForm = () => {
    if (!form.nama.trim()) return "Nama pelanggan wajib diisi"
    if (!form.telepon.trim()) return "Nomor telepon wajib diisi"
    if (!form.email.trim()) return "Email wajib diisi"
    if (!form.alamat.trim()) return "Alamat wajib diisi"
    if (!form.nomorKartu.trim()) return "Nomor kartu wajib diisi"
    if (!form.kodePelanggan.trim()) return "Kode pelanggan wajib diisi"
    if (!isEdit && !form.password.trim()) return "Password wajib diisi"
    if (!form.tipeMember.trim()) return "Tipe member wajib dipilih"
    if (!form.tanggalBergabung) return "Tanggal bergabung wajib diisi"

    if (form.password && form.password.length < 6) {
      return "Password minimal 6 karakter"
    }

    const emailLower = form.email.trim().toLowerCase()
    const telepon = form.telepon.trim()
    const nomorKartu = form.nomorKartu.trim().toLowerCase()
    const kodePelanggan = form.kodePelanggan.trim().toLowerCase()

    const duplicateEmail = data.find(
      (item) =>
        item.email.trim().toLowerCase() === emailLower &&
        (!editId || item.id !== editId)
    )
    if (duplicateEmail) return "Email sudah dipakai pelanggan lain"

    const duplicateTelepon = data.find(
      (item) =>
        item.telepon.trim() === telepon &&
        (!editId || item.id !== editId)
    )
    if (duplicateTelepon) return "Nomor telepon sudah dipakai pelanggan lain"

    const duplicateCard = data.find(
      (item) =>
        item.nomorKartu.trim().toLowerCase() === nomorKartu &&
        (!editId || item.id !== editId)
    )
    if (duplicateCard) return "Nomor kartu sudah dipakai"

    const duplicateKode = data.find(
      (item) =>
        item.kodePelanggan.trim().toLowerCase() === kodePelanggan &&
        (!editId || item.id !== editId)
    )
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
    if (!user) return

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
        const oldItem = data.find((x) => x.id === editId)

        await updateDoc(doc(db, "pelanggan", editId), {
          ...payloadBase,
          uid: oldItem?.uid || "",
          updatedAt: now,
          updatedBy: user.uid,
        })

        setData((prev) =>
          [...prev]
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
            .sort((a, b) => a.nama.localeCompare(b.nama))
        )

        setSuccessMsg("Data pelanggan berhasil diperbarui")
      } else {
        let uid = ""

        try {
          uid = await createCustomerAuthUser(
            payloadBase.email,
            form.password.trim(),
            payloadBase.nama
          )
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

        setData((prev) =>
          [...prev, newItem].sort((a, b) => a.nama.localeCompare(b.nama))
        )

        setSuccessMsg("Pelanggan berhasil ditambahkan")
      }

      closeModal()
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
      setError("Gagal menyimpan data pelanggan")
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return

    setDeleteLoading(true)
    try {
      await deleteDoc(doc(db, "pelanggan", deleteId))
      setData((prev) => prev.filter((item) => item.id !== deleteId))
      setDeleteId(null)
      setSuccessMsg("Pelanggan berhasil dihapus")
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      console.error(e)
      setError("Gagal menghapus pelanggan")
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-4 text-slate-900 sm:space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50 sm:h-14 sm:w-14">
              <Users size={24} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                Data Pelanggan
              </h1>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Pelanggan · member · kartu · akun login
              </p>
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
            {filtered.length > 0 && (
              <div className="flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-emerald-500 px-2.5 shadow-sm shadow-emerald-200/50">
                <span className="text-xs font-black text-white">
                  {itemsPerPage === 0 ? filtered.length : paged.length}
                </span>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={openAdd}
              className="flex h-8 items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-3 text-[10px] font-black uppercase tracking-wide text-white shadow-sm shadow-emerald-200/50 transition-all hover:shadow-md"
            >
              <Plus size={13} strokeWidth={3} />
              <span>Tambah Pelanggan</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={fetchData}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 disabled:opacity-50"
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

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
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
                placeholder="Nama, telepon, email, kartu..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          <FilterSelect
            label="Tipe Member"
            value={filterMember}
            onChange={(v) => {
              setFilterMember(v)
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
            label="Status"
            value={filterAktif}
            onChange={(v) => {
              setFilterAktif(v)
              setPage(1)
            }}
            icon={UserCog}
          >
            <option value="">Semua Status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </FilterSelect>

          <FilterSelect
            label="Tampilkan"
            value={itemsPerPage}
            onChange={(v) => {
              setItemsPerPage(Number(v))
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
              className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-emerald-500"
            />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Memuat data...
            </p>
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Users size={28} className="text-slate-300" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Belum ada data pelanggan
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={openAdd}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-2 text-xs font-black text-white shadow-sm"
          >
            <Plus size={13} strokeWidth={3} />
            Tambah Pelanggan Pertama
          </motion.button>
        </motion.div>
      )}

      {!loading && paged.length > 0 && (
        <div className="space-y-2 sm:hidden">
          {paged.map((d, idx) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-slate-800">{d.nama}</p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {d.kodePelanggan} · {d.tipeMember}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => openEdit(d)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100"
                  >
                    <Pencil size={12} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => setDeleteId(d.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100"
                  >
                    <Trash2 size={12} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded-lg bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700">
                  {d.nomorKartu || "-"}
                </span>
                <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                  {d.telepon || "-"}
                </span>
                <span
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                    d.aktif ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {d.aktif ? "Aktif" : "Nonaktif"}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Email</p>
                  <p className="text-xs font-bold text-slate-700">{d.email || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Poin</p>
                  <p className="text-xs font-bold text-slate-700">{d.poin}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Diskon</p>
                  <p className="text-xs font-bold text-slate-700">{d.diskon || 0}%</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Bergabung</p>
                  <p className="text-xs font-bold text-slate-700">{formatDate(d.tanggalBergabung)}</p>
                </div>
              </div>
            </motion.div>
          ))}
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
                  {["No", "Pelanggan", "Telepon", "Kartu", "Member", "Poin", "Diskon", "Status", "Aksi"].map((h) => (
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
                {paged.map((d, i) => (
                  <motion.tr
                    key={d.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.015 }}
                    className="border-t border-slate-100 transition-colors hover:bg-slate-50/60"
                  >
                    <td className="px-3 py-2.5 text-center font-bold text-slate-400">
                      {itemsPerPage === 0 ? i + 1 : (page - 1) * itemsPerPage + i + 1}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-bold text-slate-800">
  {d.nama}
</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-bold text-slate-700">{d.telepon}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-bold text-slate-700">{d.nomorKartu}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="rounded-lg bg-cyan-100 px-2 py-1 font-bold text-cyan-700">
                        {d.tipeMember}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-bold text-slate-700">{d.poin}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-bold text-slate-700">{d.diskon || 0}%</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className={`rounded-lg px-2 py-1 font-bold ${
                          d.aktif ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {d.aktif ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex justify-center gap-1.5">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => openEdit(d)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100"
                        >
                          <Pencil size={12} strokeWidth={2.5} />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setDeleteId(d.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100"
                        >
                          <Trash2 size={12} strokeWidth={2.5} />
                        </motion.button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {!loading && filtered.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {itemsPerPage === 0 ? `${filtered.length} data` : `Hal ${page}/${totalPages} · ${filtered.length} data`}
          </p>

          {itemsPerPage !== 0 && totalPages > 1 && (
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
                    <span key={`e-${idx}`} className="px-1 text-xs font-bold text-slate-400">
                      ···
                    </span>
                  ) : (
                    <motion.button
                      key={p}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => goPage(p as number)}
                      className={`h-8 min-w-[2rem] rounded-xl px-2 text-xs font-black transition-all ${
                        page === p
                          ? "bg-gradient-to-r from-emerald-400 to-cyan-500 text-white shadow-sm"
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
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight size={14} strokeWidth={2.5} />
              </motion.button>
            </div>
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeModal()
            }}
          >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <div className="relative flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    {isEdit ? (
                      <Pencil size={18} className="text-white" strokeWidth={2.5} />
                    ) : (
                      <Plus size={18} className="text-white" strokeWidth={3} />
                    )}
                  </div>
                  <div>
                    <h2 className="text-base font-black leading-none text-white">
                      {isEdit ? "Edit Pelanggan" : "Tambah Pelanggan"}
                    </h2>
                    <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                      {isEdit ? "Perbarui data pelanggan" : "Lengkapi seluruh data pelanggan"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={closeModal}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white hover:bg-white/30"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>

                <div className="pointer-events-none absolute right-0 top-0 opacity-10">
                  <Cpu size={100} strokeWidth={1} />
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                <div className="space-y-6 p-6">
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5"
                      >
                        <AlertCircle size={14} className="flex-shrink-0 text-red-500" strokeWidth={2.5} />
                        <p className="text-[11px] font-bold text-red-600">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <UserRound size={16} className="text-emerald-600" />
                      <h3 className="text-sm font-black text-slate-800">Data Wajib</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <FormInput
                        label="Nama Pelanggan"
                        required
                        icon={UserRound}
                        value={form.nama}
                        onChange={(e: any) => setField("nama")(e.target.value)}
                        placeholder="Contoh: Ahmad Fauzan"
                      />

                      <FormInput
                        label="Nomor Telepon"
                        required
                        icon={Phone}
                        value={form.telepon}
                        onChange={(e: any) => setField("telepon")(e.target.value)}
                        placeholder="08xxxxxxxxxx"
                      />

                      <FormInput
                        label="Email"
                        required
                        icon={Mail}
                        type="email"
                        value={form.email}
                        onChange={(e: any) => setField("email")(e.target.value)}
                        placeholder="pelanggan@email.com"
                      />

                      <FormInput
                        label="Nomor Kartu"
                        required
                        icon={CreditCard}
                        value={form.nomorKartu}
                        onChange={(e: any) => setField("nomorKartu")(e.target.value)}
                        placeholder="CARD-00000123"
                      />

                      <FormInput
                        label="Kode Pelanggan"
                        required
                        icon={KeyRound}
                        value={form.kodePelanggan}
                        onChange={(e: any) => setField("kodePelanggan")(e.target.value)}
                        placeholder="CUS-000123"
                      />

                      <FormInput
                        label={isEdit ? "Password Baru (Opsional)" : "Password"}
                        required={!isEdit}
                        icon={ShieldCheck}
                        type="password"
                        value={form.password}
                        onChange={(e: any) => setField("password")(e.target.value)}
                        placeholder={isEdit ? "Kosongkan jika tidak diubah" : "Minimal 6 karakter"}
                      />
                    </div>

                    <FormTextarea
                      label="Alamat"
                      icon={MapPin}
                      value={form.alamat}
                      onChange={(e: any) => setField("alamat")(e.target.value)}
                      placeholder="Alamat lengkap pelanggan"
                    />

                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <input
                        id="aktif"
                        type="checkbox"
                        checked={form.aktif}
                        onChange={(e) => setField("aktif")(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <label htmlFor="aktif" className="text-sm font-bold text-slate-700">
                        Status Aktif
                      </label>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className="text-cyan-600" />
                      <h3 className="text-sm font-black text-slate-800">Data Keanggotaan</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <FormSelect
                        label="Tipe Member"
                        required
                        icon={ShieldCheck}
                        value={form.tipeMember}
                        onChange={(e: any) => setField("tipeMember")(e.target.value)}
                      >
                        {MEMBER_OPTIONS.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </FormSelect>

                      <FormInput
                        label="Poin Loyalitas"
                        required
                        icon={Coins}
                        type="number"
                        min="0"
                        value={form.poin}
                        onChange={(e: any) => setField("poin")(e.target.value)}
                        placeholder="0"
                      />

                      <FormInput
                        label="Total Transaksi"
                        required
                        icon={ReceiptText}
                        type="number"
                        min="0"
                        value={form.totalTransaksi}
                        onChange={(e: any) => setField("totalTransaksi")(e.target.value)}
                        placeholder="0"
                      />

                      <FormInput
                        label="Tanggal Bergabung"
                        required
                        icon={CalendarDays}
                        type="date"
                        value={form.tanggalBergabung}
                        onChange={(e: any) => setField("tanggalBergabung")(e.target.value)}
                      />

                      <FormInput
                        label="Tanggal Kedaluwarsa"
                        icon={CalendarDays}
                        type="date"
                        value={form.tanggalKedaluwarsa}
                        onChange={(e: any) => setField("tanggalKedaluwarsa")(e.target.value)}
                      />

                      <FormInput
                        label="Diskon Khusus (%)"
                        icon={BadgePercent}
                        type="number"
                        min="0"
                        max="100"
                        value={form.diskon}
                        onChange={(e: any) => setField("diskon")(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-violet-600" />
                      <h3 className="text-sm font-black text-slate-800">Data Tambahan</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <FormInput
                        label="Tanggal Lahir"
                        icon={CalendarDays}
                        type="date"
                        value={form.tanggalLahir}
                        onChange={(e: any) => setField("tanggalLahir")(e.target.value)}
                      />

                      <FormSelect
                        label="Jenis Kelamin"
                        icon={UserRound}
                        value={form.jenisKelamin}
                        onChange={(e: any) => setField("jenisKelamin")(e.target.value)}
                      >
                        <option value="">Pilih Jenis Kelamin</option>
                        <option value="L">Laki-laki</option>
                        <option value="P">Perempuan</option>
                      </FormSelect>

                      <FormInput
                        label="Foto Profil URL"
                        icon={ImageIcon}
                        value={form.fotoUrl}
                        onChange={(e: any) => setField("fotoUrl")(e.target.value)}
                        placeholder="https://..."
                      />
                    </div>

                    <FormTextarea
                      label="Catatan"
                      icon={FileText}
                      value={form.catatan}
                      onChange={(e: any) => setField("catatan")(e.target.value)}
                      placeholder="Catatan tambahan pelanggan"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
                        Preview Kode
                      </p>
                      <p className="mt-1 text-sm font-bold text-emerald-700">
                        {form.kodePelanggan || "Belum ada"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 px-3 py-2.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-cyan-500">
                        Preview Kartu
                      </p>
                      <p className="mt-1 text-sm font-bold text-cyan-700">
                        {form.nomorKartu || "Belum ada"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-violet-500">
                        Member
                      </p>
                      <p className="mt-1 text-sm font-bold text-violet-700">
                        {form.tipeMember || "—"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">
                        Status
                      </p>
                      <p className="mt-1 text-sm font-bold text-amber-700">
                        {form.aktif ? "Aktif" : "Nonaktif"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-shrink-0 justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={closeModal}
                    className="rounded-xl border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50"
                  >
                    Batal
                  </motion.button>

                  <motion.button
                    type="submit"
                    disabled={submitLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-5 py-2.5 text-sm font-black text-white shadow-sm shadow-emerald-200/50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitLoading ? (
                      <>
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                        >
                          <RefreshCw size={14} strokeWidth={2.5} />
                        </motion.span>
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Check size={14} strokeWidth={3} />
                        {isEdit ? "Perbarui" : "Simpan Pelanggan"}
                      </>
                    )}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <div className="bg-gradient-to-r from-red-500 to-rose-500 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    <Trash2 size={18} className="text-white" strokeWidth={2.5} />
                  </div>
                  <h2 className="text-base font-black text-white">Hapus Pelanggan</h2>
                </div>
              </div>

              <div className="px-6 py-5">
                <p className="text-sm font-semibold text-slate-600">
                  Yakin ingin menghapus pelanggan ini? Tindakan ini{" "}
                  <span className="font-black text-red-600">tidak dapat dibatalkan</span>.
                </p>
              </div>

              <div className="flex justify-end gap-3 px-6 pb-5">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setDeleteId(null)}
                  className="rounded-xl border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 px-5 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-60"
                >
                  {deleteLoading ? (
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    >
                      <RefreshCw size={14} strokeWidth={2.5} />
                    </motion.span>
                  ) : (
                    <Trash2 size={14} strokeWidth={2.5} />
                  )}
                  {deleteLoading ? "Menghapus..." : "Ya, Hapus"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}