// Halaman admin tambah karyawan untuk CRUD data karyawan langsung ke Firestore dari client.
// Sekaligus menjaga counter total karyawan aktif di dokumen total_karyawan/summary.
// + Download template Excel & Import massal dari Excel

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  runTransaction,
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
  Building2,
  Phone,
  Mail,
  Calendar,
  Briefcase,
  MapPin,
  UserCheck,
  AlertCircle,
  Check,
  RefreshCw,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import * as XLSX from "xlsx"

// ─── Types ────────────────────────────────────────────────────────────────────

type Toko = { id: string; nama: string }

type Karyawan = {
  id: string
  nama: string
  email: string
  noHp: string
  alamat: string
  tokoId: string
  tokoNama: string
  jabatan: "kasir" | "it" | "manager"
  tahunMasuk: number
  role: "admin" | "karyawan"
  aktif: boolean
  createdAt: number
  updatedAt?: number
}

type ImportRow = {
  nama: string
  email: string
  noHp: string
  tahunMasuk: number
  jabatan: string
  tokoId: string
  tokoNama: string
  alamat: string
  aktif: boolean
}

type ImportResult = {
  row: number
  nama: string
  status: "success" | "error" | "skipped"
  message: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 0, label: "Semua" },
]

const JABATAN_OPTIONS = [
  { value: "kasir", label: "Kasir" },
  { value: "karyawan_biasa", label: "Karyawan Biasa" },
  { value: "it", label: "IT" },
  { value: "manager_1", label: "Manager 1" },
  { value: "manager_2", label: "Manager 2" },
  { value: "kepala_toko", label: "Kepala Toko" },
  { value: "service_tech", label: "Service Tech" },

]

const JABATAN_VALID = ["kasir", "it", "manager_1", "manager_2", "service_tech"]

const EMPTY_FORM = {
  nama: "",
  email: "",
  noHp: "",
  alamat: "",
  tokoId: "",
  jabatan: "",
  tahunMasuk: "",
  aktif: true,
}

const TOTAL_KARYAWAN_DOC = (db_ref: any) => doc(db_ref, "total_karyawan", "summary")

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormInput({ label, required, icon: Icon, ...props }: { label: string; required?: boolean; icon?: any; [k: string]: any }) {
  return (
    <div>
      <label className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        {...props}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 placeholder:font-normal transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
      />
    </div>
  )
}

function FormTextarea({ label, required, icon: Icon, ...props }: { label: string; required?: boolean; icon?: any; [k: string]: any }) {
  return (
    <div>
      <label className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <textarea
        {...props}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 placeholder:font-normal transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 resize-none"
      />
    </div>
  )
}

function FormSelect({ label, required, icon: Icon, children, ...props }: { label: string; required?: boolean; icon?: any; children: React.ReactNode; [k: string]: any }) {
  return (
    <div>
      <label className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
        {Icon && <Icon size={11} strokeWidth={2.5} />}
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <select
          {...props}
          className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white pl-3 pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        >
          {children}
        </select>
        <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" strokeWidth={2.5} />
      </div>
    </div>
  )
}

function FilterSelect({ value, onChange, children, label, icon: Icon }: { value: string | number; onChange: (v: string) => void; children: React.ReactNode; label: string; icon?: any }) {
  return (
    <div>
      <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{label}</label>
      <div className="relative">
        {Icon && <Icon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" strokeWidth={2} />}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${Icon ? "pl-8" : "pl-3"} pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20`}
        >
          {children}
        </select>
        <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" strokeWidth={2.5} />
      </div>
    </div>
  )
}

const syncTokoKaryawanToUsers = async ({
  karyawanId,
  tokoId,
  tokoNama,
  adminUid,
}: {
  karyawanId: string
  tokoId: string
  tokoNama: string
  adminUid: string
}) => {
  try {
    const res = await fetch("/api/sinkron-toko-karyawan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        karyawanId,
        tokoId,
        tokoNama,
        adminUid,
      }),
    })

    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      return {
        ok: false,
        message: String(json?.message || "Gagal sinkron toko karyawan"),
      }
    }

    return {
      ok: true,
      message: String(json?.message || "Sinkron toko karyawan berhasil"),
    }
  } catch (error: any) {
    return {
      ok: false,
      message: String(error?.message || "Route sinkron toko belum tersedia"),
    }
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TambahKaryawanPage() {
  const [data, setData] = useState<Karyawan[]>([])
  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Import state
  const [showImportModal, setShowImportModal] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importResults, setImportResults] = useState<ImportResult[]>([])
  const [importStep, setImportStep] = useState<"upload" | "preview" | "result">("upload")
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterJabatan, setFilterJabatan] = useState("")
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const isEdit = !!editId
  const totalKaryawanDoc = TOTAL_KARYAWAN_DOC(db)

  // ── Fetch helpers ────────────────────────────────────────────────────────────

  const fetchToko = async () => {
    try {
      const snap = await getDocs(query(collection(db, "toko"), orderBy("nama")))
      setTokoList(snap.docs.map((d) => ({ id: d.id, nama: (d.data() as any)?.nama || "" })))
    } catch {
      setTokoList([])
    }
  }

  const fetchData = async () => {
    if (!auth.currentUser) return
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, "karyawan"), orderBy("nama")))
      setData(
        snap.docs.map((d) => {
          const x = d.data() as any
          return {
            id: d.id,
            nama: x?.nama || "",
            email: x?.email || "",
            noHp: x?.noHp || "",
            alamat: x?.alamat || "",
            tokoId: x?.tokoId || "",
            tokoNama: x?.tokoNama || "",
            jabatan: x?.jabatan || "kasir",
            tahunMasuk: Number(x?.tahunMasuk || 0),
            role: x?.role || "karyawan",
            aktif: x?.aktif ?? true,
            createdAt: Number(x?.createdAt || Date.now()),
            updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
          }
        })
      )
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) await Promise.all([fetchToko(), fetchData()])
    })
    return () => unsub()
  }, [])

  // ── Filtering & Pagination ───────────────────────────────────────────────────

  const filtered = useMemo(
    () =>
      data.filter((d) => {
        const q = search.toLowerCase().trim()
        const matchSearch =
          !q ||
          d.nama.toLowerCase().includes(q) ||
          d.email.toLowerCase().includes(q) ||
          d.noHp.toLowerCase().includes(q) ||
          d.tokoNama.toLowerCase().includes(q)
        return matchSearch && (!filterToko || d.tokoId === filterToko) && (!filterJabatan || d.jabatan === filterJabatan)
      }),
    [data, search, filterToko, filterJabatan]
  )

  const totalPages = itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / itemsPerPage))
  const paged = itemsPerPage === 0 ? filtered : filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  // ── CRUD Handlers ────────────────────────────────────────────────────────────

  const closeModal = () => {
    setShowModal(false)
    setEditId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setEditId(null)
    setError(null)
    setShowModal(true)
  }

  const openEdit = (d: Karyawan) => {
    setForm({
      nama: d.nama, email: d.email, noHp: d.noHp, alamat: d.alamat,
      tokoId: d.tokoId, jabatan: d.jabatan,
      tahunMasuk: d.tahunMasuk ? String(d.tahunMasuk) : "", aktif: d.aktif,
    })
    setEditId(d.id)
    setError(null)
    setShowModal(true)
  }

  const setField = (key: keyof typeof EMPTY_FORM) => (val: any) => setForm((f) => ({ ...f, [key]: val }))

  const validateForm = () => {
    if (!form.nama.trim()) return "Nama karyawan wajib diisi"
    if (!form.email.trim()) return "Email wajib diisi"
    if (!form.noHp.trim()) return "No HP wajib diisi"
    if (!form.tokoId) return "Toko wajib dipilih"
    if (!form.jabatan) return "Jabatan wajib dipilih"
    if (!form.tahunMasuk.trim()) return "Tahun masuk wajib diisi"
    const tahun = Number(form.tahunMasuk)
    if (Number.isNaN(tahun) || tahun < 2000 || tahun > 2100) return "Tahun masuk tidak valid"
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
    const toko = tokoList.find((t) => t.id === form.tokoId)
    if (!toko) {
      setError("Toko tidak ditemukan")
      return
    }

    const payload = {
      nama: form.nama.trim(),
      email: form.email.trim().toLowerCase(),
      noHp: form.noHp.trim(),
      alamat: form.alamat.trim(),
      tokoId: toko.id,
      tokoNama: toko.nama,
      jabatan: form.jabatan as Karyawan["jabatan"],
      tahunMasuk: Number(form.tahunMasuk),
      role: "karyawan" as Karyawan["role"],
      aktif: form.aktif,
    }

    if (isEdit && editId) {
      const karyawanRef = doc(db, "karyawan", editId)

      let oldTokoId = ""
      let oldTokoNama = ""

      await runTransaction(db, async (tx) => {
        const currentSnap = await tx.get(karyawanRef)
        const totalSnap = await tx.get(totalKaryawanDoc)

        if (!currentSnap.exists()) {
          throw new Error("DATA_KARYAWAN_TIDAK_DITEMUKAN")
        }

        const currentData = currentSnap.data() as any
        const oldAktif = currentData?.aktif ?? true
        oldTokoId = String(currentData?.tokoId || "").trim()
        oldTokoNama = String(currentData?.tokoNama || "").trim()

        const currentTotal = Number(totalSnap.data()?.totalAktif || 0)

        tx.update(karyawanRef, {
          ...payload,
          updatedAt: Date.now(),
          updatedBy: user.uid,
        })

        if (oldAktif !== payload.aktif) {
          const nextTotal = Math.max(0, currentTotal + (payload.aktif ? 1 : -1))
          tx.set(
            totalKaryawanDoc,
            {
              totalAktif: nextTotal,
              updatedAt: Date.now(),
              updatedBy: user.uid,
            },
            { merge: true }
          )
        }
      })

      let syncWarning = ""

      if (oldTokoId !== payload.tokoId || oldTokoNama !== payload.tokoNama) {
        const syncResult = await syncTokoKaryawanToUsers({
          karyawanId: editId,
          tokoId: payload.tokoId,
          tokoNama: payload.tokoNama,
          adminUid: user.uid,
        })

        if (!syncResult.ok) {
          syncWarning = ` Namun sinkron user gagal: ${syncResult.message}`
        }
      }

      setSuccessMsg(`Data karyawan berhasil diperbarui.${syncWarning}`)
    } else {
      const newRef = doc(collection(db, "karyawan"))

      await runTransaction(db, async (tx) => {
        const totalSnap = await tx.get(totalKaryawanDoc)
        const currentTotal = Number(totalSnap.data()?.totalAktif || 0)

        tx.set(newRef, {
          id: newRef.id,
          ...payload,
          createdAt: Date.now(),
          createdBy: user.uid,
        })

        if (payload.aktif) {
          tx.set(
            totalKaryawanDoc,
            {
              totalAktif: Math.max(0, currentTotal + 1),
              updatedAt: Date.now(),
              updatedBy: user.uid,
            },
            { merge: true }
          )
        }
      })

      setSuccessMsg("Karyawan berhasil ditambahkan")
    }

    setTimeout(() => setSuccessMsg(null), 4000)
    closeModal()
    fetchData()
  } catch (e: any) {
    setError(
      e?.message === "DATA_KARYAWAN_TIDAK_DITEMUKAN"
        ? "Data karyawan tidak ditemukan"
        : "Gagal menyimpan data karyawan"
    )
  } finally {
    setSubmitLoading(false)
  }
}

  const handleDelete = async () => {
    if (!deleteId) return
    const user = auth.currentUser
    if (!user) return
    setDeleteLoading(true)
    try {
      const ref = doc(db, "karyawan", deleteId)
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        const totalSnap = await tx.get(totalKaryawanDoc)
        if (!snap.exists()) return
        const isAktif = (snap.data() as any)?.aktif ?? true
        const currentTotal = Number(totalSnap.data()?.totalAktif || 0)
        tx.delete(ref)
        if (isAktif) {
          tx.set(totalKaryawanDoc, { totalAktif: Math.max(0, currentTotal - 1), updatedAt: Date.now(), updatedBy: user.uid }, { merge: true })
        }
      })
      setDeleteId(null)
      setSuccessMsg("Data karyawan berhasil dihapus")
      setTimeout(() => setSuccessMsg(null), 3000)
      fetchData()
    } catch {
      setError("Gagal menghapus data karyawan")
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Download Template ────────────────────────────────────────────────────────

  const handleDownloadTemplate = () => {
    const link = document.createElement("a")
    // Ganti URL ini dengan path file template yang sudah di-host (public folder / CDN)
    link.href = "/templates/template_import_karyawan.xlsx"
    link.download = "template_import_karyawan.xlsx"
    link.click()
  }

  // ── Import Excel ─────────────────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: "array" })

        // Cari sheet "Import Karyawan"
        const sheetName = workbook.SheetNames.find((s) => s === "Import Karyawan") ?? workbook.SheetNames[0]
        const ws = workbook.Sheets[sheetName]
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { range: 5, defval: "" })
        // range: 5 → skip 5 baris pertama (banner + header), mulai dari baris data

        const parsed: ImportRow[] = rows
          .filter((r) => r["Nama Lengkap *"] || r["Email *"]) // skip baris kosong
          .map((r) => ({
            nama: String(r["Nama Lengkap *"] || "").trim(),
            email: String(r["Email *"] || "").trim().toLowerCase(),
            noHp: String(r["No HP *"] || "").trim(),
            tahunMasuk: Number(r["Tahun Masuk *"] || 0),
            jabatan: String(r["Jabatan *"] || "").trim().toLowerCase(),
            tokoId: String(r["ID Toko *"] || "").trim(),
            tokoNama: String(r["Nama Toko"] || "").trim(),
            alamat: String(r["Alamat"] || "").trim(),
            aktif: String(r["Status Aktif"] || "aktif").trim().toLowerCase() !== "nonaktif",
          }))

        if (parsed.length === 0) {
          setImportError("Tidak ada data yang ditemukan dalam file. Pastikan file menggunakan template yang benar.")
          return
        }
        if (parsed.length > 100) {
          setImportError("Maksimal 100 baris data per import. File Anda memiliki " + parsed.length + " baris.")
          return
        }

        setImportRows(parsed)
        setImportStep("preview")
      } catch {
        setImportError("Gagal membaca file. Pastikan format file Excel (.xlsx) dan menggunakan template yang benar.")
      }
    }
    reader.readAsArrayBuffer(file)
    // Reset input agar bisa upload file yang sama lagi
    e.target.value = ""
  }

  const validateImportRow = (row: ImportRow, idx: number): string | null => {
    if (!row.nama) return `Baris ${idx + 1}: Nama wajib diisi`
    if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return `Baris ${idx + 1}: Email tidak valid`
    if (!row.noHp) return `Baris ${idx + 1}: No HP wajib diisi`
    if (!row.tokoId) return `Baris ${idx + 1}: ID Toko wajib diisi`
    if (!JABATAN_VALID.includes(row.jabatan)) return `Baris ${idx + 1}: Jabatan tidak valid (${row.jabatan})`
    if (!row.tahunMasuk || row.tahunMasuk < 2000 || row.tahunMasuk > 2100) return `Baris ${idx + 1}: Tahun masuk tidak valid`
    return null
  }

  const handleImport = async () => {
    const user = auth.currentUser
    if (!user || importRows.length === 0) return

    setImportLoading(true)
    const results: ImportResult[] = []

    // Kumpulkan email yang sudah ada
    const existingEmails = new Set(data.map((d) => d.email))

    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i]

      // Validasi
      const validationErr = validateImportRow(row, i)
      if (validationErr) {
        results.push({ row: i + 1, nama: row.nama || `Baris ${i + 1}`, status: "error", message: validationErr })
        continue
      }

      // Skip duplikat email
      if (existingEmails.has(row.email)) {
        results.push({ row: i + 1, nama: row.nama, status: "skipped", message: `Email ${row.email} sudah terdaftar` })
        continue
      }

      // Cari nama toko dari tokoList jika tokoNama kosong
      const tokoNama = row.tokoNama || tokoList.find((t) => t.id === row.tokoId)?.nama || row.tokoId

      try {
        const newRef = doc(collection(db, "karyawan"))
        await runTransaction(db, async (tx) => {
          const totalSnap = await tx.get(totalKaryawanDoc)
          const currentTotal = Number(totalSnap.data()?.totalAktif || 0)
          tx.set(newRef, {
            id: newRef.id,
            nama: row.nama,
            email: row.email,
            noHp: row.noHp,
            alamat: row.alamat,
            tokoId: row.tokoId,
            tokoNama,
            jabatan: row.jabatan as Karyawan["jabatan"],
            tahunMasuk: row.tahunMasuk,
            role: "karyawan",
            aktif: row.aktif,
            createdAt: Date.now(),
            createdBy: user.uid,
          })
          if (row.aktif) {
            tx.set(totalKaryawanDoc, { totalAktif: Math.max(0, currentTotal + 1), updatedAt: Date.now(), updatedBy: user.uid }, { merge: true })
          }
        })
        existingEmails.add(row.email)
        results.push({ row: i + 1, nama: row.nama, status: "success", message: "Berhasil ditambahkan" })
      } catch {
        results.push({ row: i + 1, nama: row.nama, status: "error", message: "Gagal menyimpan ke database" })
      }
    }

    setImportResults(results)
    setImportStep("result")
    setImportLoading(false)

    const successCount = results.filter((r) => r.status === "success").length
    if (successCount > 0) {
      fetchData()
      setSuccessMsg(`${successCount} karyawan berhasil diimport`)
      setTimeout(() => setSuccessMsg(null), 4000)
    }
  }

  const closeImportModal = () => {
    setShowImportModal(false)
    setImportRows([])
    setImportResults([])
    setImportStep("upload")
    setImportError(null)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-5 text-slate-900">

      {/* ── Header Banner ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border-l-4 border-l-emerald-500 border-t border-r border-b border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      >
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
  <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
    <div className="flex h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50">
      <Users size={22} className="text-white sm:w-7 sm:h-7" strokeWidth={2.5} />
    </div>

    <div className="min-w-0 self-center sm:self-auto">
      <h1 className="text-lg sm:text-2xl font-black text-slate-800 tracking-tight leading-none">
        Data Karyawan
      </h1>
      <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
        Karyawan toko · jabatan · tahun masuk
      </p>
    </div>
  </div>

  <div className="flex items-center justify-between gap-2 sm:flex-shrink-0 sm:flex-wrap sm:justify-end">
    <div className="flex items-center gap-2">
      {filtered.length > 0 && (
        <div className="flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-emerald-500 px-2.5 shadow-sm shadow-emerald-200/50">
          <span className="text-xs font-black text-white">
            {itemsPerPage === 0 ? filtered.length : paged.length}
          </span>
        </div>
      )}
    </div>

    <div className="flex flex-wrap items-center justify-end gap-2">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleDownloadTemplate}
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:bg-slate-50 sm:w-auto sm:px-3"
        title="Download Template Excel"
      >
        <Download size={13} strokeWidth={2.5} />
        <span className="hidden sm:inline sm:ml-1.5 text-[10px] font-black uppercase tracking-wide">
          Template
        </span>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowImportModal(true)}
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 shadow-sm transition-all hover:bg-cyan-100 sm:w-auto sm:px-3"
        title="Import dari Excel"
      >
        <Upload size={13} strokeWidth={2.5} />
        <span className="hidden sm:inline sm:ml-1.5 text-[10px] font-black uppercase tracking-wide">
          Import
        </span>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={openAdd}
        className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 text-white shadow-sm shadow-emerald-200/50 transition-all hover:shadow-md sm:w-auto sm:px-3"
        title="Tambah"
      >
        <Plus size={13} strokeWidth={3} />
        <span className="hidden sm:inline sm:ml-1.5 text-[10px] font-black uppercase tracking-wide">
          Tambah
        </span>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={fetchData}
        disabled={loading}
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 disabled:opacity-50"
        title="Refresh"
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
</div>

        <div className="absolute right-0 top-0 opacity-[0.03] pointer-events-none">
          <Cpu size={140} strokeWidth={1} />
        </div>
      </motion.div>

      {/* ── Toast Messages ── */}
      <AnimatePresence>
        {successMsg && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
              <Check size={11} className="text-white" strokeWidth={3} />
            </div>
            <p className="text-[11px] font-bold text-emerald-700">{successMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && !showModal && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0" strokeWidth={2.5} />
            <p className="text-[11px] font-bold text-red-600">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Filter Bar ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl border-l-4 border-l-blue-500 border-t border-r border-b border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Cari Karyawan</label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" strokeWidth={2} />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="Nama, email, HP, toko..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white pl-8 pr-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 placeholder:font-normal transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>
          <FilterSelect label="Toko" value={filterToko} onChange={(v) => { setFilterToko(v); setPage(1) }} icon={Building2}>
            <option value="">Semua Toko</option>
            {tokoList.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </FilterSelect>
          <FilterSelect label="Jabatan" value={filterJabatan} onChange={(v) => { setFilterJabatan(v); setPage(1) }} icon={Briefcase}>
            <option value="">Semua Jabatan</option>
            {JABATAN_OPTIONS.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
          </FilterSelect>
          <FilterSelect label="Tampilkan" value={itemsPerPage} onChange={(v) => { setItemsPerPage(Number(v)); setPage(1) }}>
            {ITEMS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label} data</option>)}
          </FilterSelect>
        </div>
      </motion.div>

      {/* ── Loading State ── */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-emerald-500"
            />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Memuat data...</p>
          </div>
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && filtered.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-16 gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Users size={28} className="text-slate-300" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Belum ada data karyawan</p>
          <div className="flex gap-2 flex-wrap justify-center">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 text-white text-xs font-black shadow-sm">
              <Plus size={13} strokeWidth={3} />
              Tambah Manual
            </motion.button>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700 text-xs font-black">
              <Upload size={13} strokeWidth={2.5} />
              Import Excel
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* ── Mobile Cards ── */}
      {!loading && paged.length > 0 && (
        <div className="sm:hidden space-y-2">
          {paged.map((d, idx) => (
            <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-slate-800">{d.nama}</p>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mt-0.5">{d.tokoNama}</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => openEdit(d)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 transition-colors">
                    <Pencil size={12} strokeWidth={2.5} />
                  </button>
                  <button onClick={() => setDeleteId(d.id)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 transition-colors">
                    <Trash2 size={12} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="px-2 py-0.5 rounded-lg bg-cyan-100 text-cyan-700 text-[10px] font-bold">
                  {JABATAN_OPTIONS.find((j) => j.value === d.jabatan)?.label || d.jabatan}
                </span>
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${d.aktif ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {d.aktif ? "Aktif" : "Nonaktif"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Email</p>
                  <p className="text-xs font-bold text-slate-700 break-all">{d.email || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">No HP</p>
                  <p className="text-xs font-bold text-slate-700">{d.noHp || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Tahun Masuk</p>
                  <p className="text-xs font-bold text-slate-700">{d.tahunMasuk || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Role</p>
                  <p className="text-xs font-bold text-slate-700">{d.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Desktop Table ── */}
      {!loading && paged.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="hidden sm:block overflow-hidden rounded-xl border border-slate-200 bg-white/60 backdrop-blur-xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/80 border-b border-slate-200">
                <tr>
                  {["No", "Nama", "Toko", "Jabatan", "Tahun Masuk", "Email", "No HP", "Status", "Aksi"].map((h) => (
                    <th key={h} className={`px-3 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 whitespace-nowrap ${h === "No" || h === "Aksi" ? "text-center" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((d, i) => (
                  <motion.tr key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }}
                    className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-2.5 text-center font-bold text-slate-400">
                      {itemsPerPage === 0 ? i + 1 : (page - 1) * itemsPerPage + i + 1}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap">{d.nama}</td>
                    <td className="px-3 py-2.5 text-slate-600 font-semibold whitespace-nowrap">{d.tokoNama}</td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded-lg bg-cyan-100 text-cyan-700 text-[10px] font-bold whitespace-nowrap">
                        {JABATAN_OPTIONS.find((j) => j.value === d.jabatan)?.label || d.jabatan}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 font-semibold whitespace-nowrap">{d.tahunMasuk || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600 font-semibold">{d.email || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600 font-semibold whitespace-nowrap">{d.noHp || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold whitespace-nowrap ${d.aktif ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                        {d.aktif ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex gap-1.5 justify-center">
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openEdit(d)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 transition-colors">
                          <Pencil size={12} strokeWidth={2.5} />
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setDeleteId(d.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 transition-colors">
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

      {/* ── Pagination ── */}
      {!loading && filtered.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {itemsPerPage === 0 ? `${filtered.length} data` : `Hal ${page}/${totalPages} · ${filtered.length} data`}
          </p>
          {itemsPerPage !== 0 && totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => goPage(page - 1)} disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeft size={14} strokeWidth={2.5} />
              </motion.button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === "number" && p - (arr[idx - 1] as number) > 1) acc.push("...")
                  acc.push(p)
                  return acc
                }, [])
                .map((p, idx) =>
                  p === "..." ? (
                    <span key={`e-${idx}`} className="px-1 text-slate-400 text-xs font-bold">···</span>
                  ) : (
                    <motion.button key={p} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => goPage(p as number)}
                      className={`h-8 min-w-[2rem] px-2 rounded-xl text-xs font-black transition-all ${page === p ? "bg-gradient-to-r from-emerald-400 to-cyan-500 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                      {p}
                    </motion.button>
                  )
                )}
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => goPage(page + 1)} disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight size={14} strokeWidth={2.5} />
              </motion.button>
            </div>
          )}
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: Tambah / Edit Karyawan
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}>
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="relative flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    {isEdit ? <Pencil size={18} className="text-white" strokeWidth={2.5} /> : <Plus size={18} className="text-white" strokeWidth={3} />}
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white leading-none">{isEdit ? "Edit Data Karyawan" : "Tambah Karyawan Baru"}</h2>
                    <p className="text-[10px] text-white/70 font-semibold mt-0.5">{isEdit ? "Perbarui informasi karyawan" : "Isi field wajib (*)"}</p>
                  </div>
                </div>
                <button onClick={closeModal} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors">
                  <X size={16} strokeWidth={2.5} />
                </button>
                <div className="absolute right-0 top-0 opacity-10 pointer-events-none"><Cpu size={100} strokeWidth={1} /></div>
              </div>

              <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
                <div className="p-6 space-y-5">
                  <AnimatePresence>
                    {error && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                        <AlertCircle size={14} className="text-red-500 flex-shrink-0" strokeWidth={2.5} />
                        <p className="text-[11px] font-bold text-red-600">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormInput label="Nama Lengkap" required icon={Users} value={form.nama} onChange={(e: any) => setField("nama")(e.target.value)} placeholder="Nama lengkap karyawan" />
                    <FormInput label="Email" required icon={Mail} type="email" value={form.email} onChange={(e: any) => setField("email")(e.target.value)} placeholder="email@contoh.com" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormInput label="No HP" required icon={Phone} type="tel" value={form.noHp} onChange={(e: any) => setField("noHp")(e.target.value)} placeholder="08123456789" />
                    <FormInput label="Tahun Masuk" required icon={Calendar} type="number" min="2000" max="2100" value={form.tahunMasuk} onChange={(e: any) => setField("tahunMasuk")(e.target.value)} placeholder="2024" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormSelect label="Toko" required icon={Building2} value={form.tokoId} onChange={(e: any) => setField("tokoId")(e.target.value)}>
                      <option value="">Pilih Toko</option>
                      {tokoList.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
                    </FormSelect>
                    <FormSelect label="Jabatan" required icon={Briefcase} value={form.jabatan} onChange={(e: any) => setField("jabatan")(e.target.value)}>
                      <option value="">Pilih Jabatan</option>
                      {JABATAN_OPTIONS.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
                    </FormSelect>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormSelect label="Status" icon={UserCheck} value={form.aktif ? "aktif" : "nonaktif"} onChange={(e: any) => setField("aktif")(e.target.value === "aktif")}>
                      <option value="aktif">Aktif</option>
                      <option value="nonaktif">Nonaktif</option>
                    </FormSelect>
                    <div className="flex items-end">
                      <div className="w-full rounded-xl border border-cyan-100 bg-cyan-50/60 px-3 py-2.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-cyan-500">Role Otomatis</p>
                        <p className="text-sm font-bold text-cyan-700 mt-1">karyawan</p>
                      </div>
                    </div>
                  </div>
                  <FormTextarea label="Alamat" icon={MapPin} rows={3} value={form.alamat} onChange={(e: any) => setField("alamat")(e.target.value)} placeholder="Alamat karyawan" />
                </div>

                <div className="flex gap-3 justify-end px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex-shrink-0">
                  <motion.button type="button" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={closeModal}
                    className="px-5 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 text-sm font-black hover:bg-slate-50 transition-colors">
                    Batal
                  </motion.button>
                  <motion.button type="submit" disabled={submitLoading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 text-white text-sm font-black shadow-sm shadow-emerald-200/50 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all">
                    {submitLoading ? (
                      <><motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}><RefreshCw size={14} strokeWidth={2.5} /></motion.span>Menyimpan...</>
                    ) : (
                      <><Check size={14} strokeWidth={3} />{isEdit ? "Perbarui" : "Simpan Karyawan"}</>
                    )}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: Hapus Karyawan
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {deleteId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-red-500 to-rose-500">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    <Trash2 size={18} className="text-white" strokeWidth={2.5} />
                  </div>
                  <h2 className="text-base font-black text-white">Hapus Karyawan</h2>
                </div>
              </div>
              <div className="px-6 py-5">
                <p className="text-sm text-slate-600 font-semibold">
                  Yakin ingin menghapus data karyawan ini? Tindakan ini{" "}
                  <span className="font-black text-red-600">tidak dapat dibatalkan</span>.
                </p>
              </div>
              <div className="flex gap-3 px-6 pb-5 justify-end">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setDeleteId(null)}
                  className="px-5 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 text-sm font-black hover:bg-slate-50">
                  Batal
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleDelete} disabled={deleteLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 text-white text-sm font-black shadow-sm disabled:opacity-60">
                  {deleteLoading ? (
                    <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}><RefreshCw size={14} strokeWidth={2.5} /></motion.span>
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

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: Import Excel
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showImportModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget && !importLoading) closeImportModal() }}>
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

              {/* Modal Header */}
              <div className="relative flex items-center justify-between px-6 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    <FileSpreadsheet size={18} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white leading-none">Import Data Karyawan</h2>
                    <p className="text-[10px] text-white/70 font-semibold mt-0.5">
                      {importStep === "upload" && "Upload file Excel template"}
                      {importStep === "preview" && `${importRows.length} baris siap diimport`}
                      {importStep === "result" && "Hasil import selesai"}
                    </p>
                  </div>
                </div>
                {!importLoading && (
                  <button onClick={closeImportModal} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors">
                    <X size={16} strokeWidth={2.5} />
                  </button>
                )}
              </div>

              {/* Step Indicator */}
              <div className="flex items-center gap-0 px-6 py-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
                {[{ key: "upload", label: "Upload" }, { key: "preview", label: "Preview" }, { key: "result", label: "Hasil" }].map((step, idx) => (
                  <div key={step.key} className="flex items-center">
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${importStep === step.key ? "bg-cyan-500 text-white" : (["upload", "preview", "result"].indexOf(importStep) > idx ? "text-emerald-600" : "text-slate-400")}`}>
                      {["upload", "preview", "result"].indexOf(importStep) > idx
                        ? <Check size={10} strokeWidth={3} />
                        : <span>{idx + 1}</span>}
                      {step.label}
                    </div>
                    {idx < 2 && <div className="w-6 h-px bg-slate-200 mx-1" />}
                  </div>
                ))}
              </div>

              <div className="overflow-y-auto flex-1 p-6 space-y-4">

                {/* ── Step 1: Upload ── */}
                {importStep === "upload" && (
                  <div className="space-y-4">
                    {/* Download template hint */}
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-cyan-50 border border-cyan-200">
                      <FileSpreadsheet size={20} className="text-cyan-600 flex-shrink-0" strokeWidth={2} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-cyan-800">Belum punya template?</p>
                        <p className="text-[10px] text-cyan-600 font-semibold mt-0.5">Download template Excel, isi data, lalu upload di sini.</p>
                      </div>
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleDownloadTemplate}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 text-white text-[10px] font-black flex-shrink-0">
                        <Download size={11} strokeWidth={2.5} />
                        Download
                      </motion.button>
                    </div>

                    {/* Error */}
                    {importError && (
                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                        <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                        <p className="text-[11px] font-bold text-red-600">{importError}</p>
                      </div>
                    )}

                    {/* Drop zone */}
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
                    <motion.div whileHover={{ scale: 1.01 }} onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 hover:border-cyan-400 hover:bg-cyan-50/30 cursor-pointer transition-all">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                        <Upload size={28} className="text-slate-400" strokeWidth={1.5} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-black text-slate-600">Klik untuk pilih file</p>
                        <p className="text-[10px] text-slate-400 font-semibold mt-1">Format: .xlsx · Maks. 100 baris data</p>
                      </div>
                    </motion.div>
                  </div>
                )}

                {/* ── Step 2: Preview ── */}
                {importStep === "preview" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-slate-700">{importRows.length} baris ditemukan</p>
                      <button onClick={() => { setImportStep("upload"); setImportRows([]) }}
                        className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline">
                        Ganti File
                      </button>
                    </div>

                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="overflow-x-auto max-h-72">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                            <tr>
                              {["#", "Nama", "Email", "HP", "Jabatan", "ID Toko", "Tahun", "Status"].map((h) => (
                                <th key={h} className="px-3 py-2 text-[9px] font-black uppercase tracking-wide text-slate-400 text-left whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {importRows.map((r, i) => {
                              const err = validateImportRow(r, i)
                              return (
                                <tr key={i} className={`border-t border-slate-100 ${err ? "bg-red-50" : i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                                  <td className="px-3 py-2 text-slate-400 font-bold">{i + 1}</td>
                                  <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{r.nama || <span className="text-red-400">—</span>}</td>
                                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.email || <span className="text-red-400">—</span>}</td>
                                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.noHp || "—"}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${JABATAN_VALID.includes(r.jabatan) ? "bg-cyan-100 text-cyan-700" : "bg-red-100 text-red-600"}`}>
                                      {r.jabatan || "—"}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-[100px] truncate">{r.tokoId || <span className="text-red-400">—</span>}</td>
                                  <td className="px-3 py-2 text-slate-600">{r.tahunMasuk || "—"}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.aktif ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                                      {r.aktif ? "Aktif" : "Nonaktif"}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {importRows.some((r, i) => validateImportRow(r, i)) && (
                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                        <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                        <p className="text-[11px] font-bold text-amber-700">
                          Beberapa baris memiliki error (ditandai merah) dan akan dilewati saat import.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Step 3: Result ── */}
                {importStep === "result" && (
                  <div className="space-y-3">
                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Berhasil", count: importResults.filter(r => r.status === "success").length, color: "emerald" },
                        { label: "Dilewati", count: importResults.filter(r => r.status === "skipped").length, color: "amber" },
                        { label: "Gagal", count: importResults.filter(r => r.status === "error").length, color: "red" },
                      ].map(({ label, count, color }) => (
                        <div key={label} className={`rounded-xl p-3 text-center bg-${color}-50 border border-${color}-200`}>
                          <p className={`text-2xl font-black text-${color}-600`}>{count}</p>
                          <p className={`text-[10px] font-bold uppercase tracking-wide text-${color}-500 mt-0.5`}>{label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Detail */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden max-h-60 overflow-y-auto">
                      {importResults.map((r, i) => (
                        <div key={i} className={`flex items-center gap-2 px-3 py-2 border-b last:border-b-0 border-slate-100 ${r.status === "success" ? "bg-white" : r.status === "skipped" ? "bg-amber-50" : "bg-red-50"}`}>
                          {r.status === "success"
                            ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" strokeWidth={2.5} />
                            : r.status === "skipped"
                            ? <AlertCircle size={14} className="text-amber-500 flex-shrink-0" strokeWidth={2.5} />
                            : <XCircle size={14} className="text-red-500 flex-shrink-0" strokeWidth={2.5} />
                          }
                          <span className="text-xs font-bold text-slate-700 flex-shrink-0 w-5 text-right">{r.row}</span>
                          <span className="text-xs font-semibold text-slate-800 min-w-0 truncate">{r.nama}</span>
                          <span className={`text-[10px] font-semibold ml-auto flex-shrink-0 ${r.status === "success" ? "text-emerald-600" : r.status === "skipped" ? "text-amber-600" : "text-red-600"}`}>
                            {r.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex gap-3 justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex-shrink-0">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={closeImportModal} disabled={importLoading}
                  className="px-5 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 text-sm font-black hover:bg-slate-50 disabled:opacity-50 transition-colors">
                  {importStep === "result" ? "Tutup" : "Batal"}
                </motion.button>

                {importStep === "preview" && (
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleImport} disabled={importLoading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-black shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-all">
                    {importLoading
                      ? <><Loader2 size={14} className="animate-spin" strokeWidth={2.5} />Mengimport {importRows.length} data...</>
                      : <><Upload size={14} strokeWidth={2.5} />Import {importRows.length} Karyawan</>
                    }
                  </motion.button>
                )}

                {importStep === "result" && importResults.some((r) => r.status !== "success") && (
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => { setImportStep("upload"); setImportRows([]); setImportResults([]) }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-cyan-200 bg-cyan-50 text-cyan-700 text-sm font-black">
                    <Upload size={14} strokeWidth={2.5} />
                    Import Lagi
                  </motion.button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}