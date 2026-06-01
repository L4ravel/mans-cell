// Halaman admin tambah karyawan untuk CRUD data karyawan, import Excel, dan counter total aktif.
// Layout diseragamkan dengan halaman Tambah Toko: tema biru muda, card mobile satu lapis, toast fixed, dan modal rapi.

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
  ListFilter,
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

type Toko = {
  id: string
  nama: string
}

type Karyawan = {
  id: string
  nama: string
  email: string
  noHp: string
  alamat: string
  tokoId: string
  tokoNama: string
  jabatan: string
  tahunMasuk: number
  role: "admin" | "karyawan"
  aktif: boolean
  createdAt: number
  updatedAt?: number
}

type FormState = {
  nama: string
  email: string
  noHp: string
  alamat: string
  tokoId: string
  jabatan: string
  tahunMasuk: string
  aktif: boolean
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

type ImportStep = "upload" | "preview" | "result"

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
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

const JABATAN_VALID = JABATAN_OPTIONS.map((item) => item.value)

const EMPTY_FORM: FormState = {
  nama: "",
  email: "",
  noHp: "",
  alamat: "",
  tokoId: "",
  jabatan: "",
  tahunMasuk: "",
  aktif: true,
}

const totalKaryawanDoc = () => doc(db, "total_karyawan", "summary")

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getJabatanLabel = (value: string) => {
  return JABATAN_OPTIONS.find((item) => item.value === value)?.label || value || "-"
}

const normalizeText = (value: unknown) => String(value || "").trim()

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ karyawanId, tokoId, tokoNama, adminUid }),
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
  const [loading, setLoading] = useState(true)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Karyawan | null>(null)

  const [showImportModal, setShowImportModal] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importResults, setImportResults] = useState<ImportResult[]>([])
  const [importStep, setImportStep] = useState<ImportStep>("upload")
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterJabatan, setFilterJabatan] = useState("")
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

  const fetchToko = async () => {
    try {
      const snap = await getDocs(query(collection(db, "toko"), orderBy("nama")))
      setTokoList(
        snap.docs.map((item) => ({
          id: item.id,
          nama: normalizeText((item.data() as any)?.nama),
        }))
      )
    } catch (e) {
      console.error(e)
      setTokoList([])
      showError("Gagal memuat data toko")
    }
  }

  const fetchData = async () => {
    const user = auth.currentUser
    if (!user) return

    setLoading(true)

    try {
      const snap = await getDocs(query(collection(db, "karyawan"), orderBy("nama")))
      setData(
        snap.docs.map((item) => {
          const x = item.data() as any
          return {
            id: item.id,
            nama: normalizeText(x?.nama),
            email: normalizeText(x?.email),
            noHp: normalizeText(x?.noHp),
            alamat: normalizeText(x?.alamat),
            tokoId: normalizeText(x?.tokoId),
            tokoNama: normalizeText(x?.tokoNama),
            jabatan: normalizeText(x?.jabatan) || "kasir",
            tahunMasuk: Number(x?.tahunMasuk || 0),
            role: x?.role || "karyawan",
            aktif: x?.aktif ?? true,
            createdAt: Number(x?.createdAt || Date.now()),
            updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
          }
        })
      )
    } catch (e) {
      console.error(e)
      setData([])
      showError("Gagal memuat data karyawan")
    } finally {
      setLoading(false)
    }
  }

  const refreshAll = async () => {
    await Promise.all([fetchToko(), fetchData()])
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) await refreshAll()
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
          item.email,
          item.noHp,
          item.tokoNama,
          item.jabatan,
          item.alamat,
          String(item.tahunMasuk || ""),
        ].some((value) => value.toLowerCase().includes(q))

      return matchSearch && (!filterToko || item.tokoId === filterToko) && (!filterJabatan || item.jabatan === filterJabatan)
    })
  }, [data, search, filterToko, filterJabatan])

  const stats = useMemo(() => {
    const total = data.length
    const aktifCount = data.filter((item) => item.aktif).length
    const tokoTerhubung = new Set(data.filter((item) => item.tokoId).map((item) => item.tokoId)).size

    return { total, aktifCount, tokoTerhubung }
  }, [data])

  const totalPages = itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / itemsPerPage))
  const paged = itemsPerPage === 0 ? filtered : filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  // ── CRUD ─────────────────────────────────────────────────────────────────────

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
    resetForm()
    setShowModal(true)
  }

  const openEdit = (item: Karyawan) => {
    setForm({
      nama: item.nama,
      email: item.email,
      noHp: item.noHp,
      alamat: item.alamat,
      tokoId: item.tokoId,
      jabatan: item.jabatan,
      tahunMasuk: item.tahunMasuk ? String(item.tahunMasuk) : "",
      aktif: item.aktif,
    })
    setEditId(item.id)
    setError(null)
    setShowModal(true)
  }

  const validateForm = () => {
    if (!form.nama.trim()) return "Nama karyawan wajib diisi"
    if (!form.email.trim()) return "Email wajib diisi"
    if (!isValidEmail(form.email.trim())) return "Format email tidak valid"
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
    if (!user || submitLoading) return

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    const toko = tokoList.find((item) => item.id === form.tokoId)
    if (!toko) {
      setError("Toko tidak ditemukan")
      return
    }

    setSubmitLoading(true)
    setError(null)

    try {
      const now = Date.now()
      const payload = {
        nama: form.nama.trim(),
        email: form.email.trim().toLowerCase(),
        noHp: form.noHp.trim(),
        alamat: form.alamat.trim(),
        tokoId: toko.id,
        tokoNama: toko.nama,
        jabatan: form.jabatan,
        tahunMasuk: Number(form.tahunMasuk),
        role: "karyawan" as const,
        aktif: form.aktif,
      }

      if (isEdit && editId) {
        const ref = doc(db, "karyawan", editId)
        let oldTokoId = ""
        let oldTokoNama = ""
        let oldAktif = true

        await runTransaction(db, async (tx) => {
          const currentSnap = await tx.get(ref)
          const totalSnap = await tx.get(totalKaryawanDoc())

          if (!currentSnap.exists()) throw new Error("DATA_KARYAWAN_TIDAK_DITEMUKAN")

          const currentData = currentSnap.data() as any
          oldAktif = currentData?.aktif ?? true
          oldTokoId = normalizeText(currentData?.tokoId)
          oldTokoNama = normalizeText(currentData?.tokoNama)

          tx.update(ref, {
            ...payload,
            updatedAt: now,
            updatedBy: user.uid,
          })

          if (oldAktif !== payload.aktif) {
            const currentTotal = Number(totalSnap.data()?.totalAktif || 0)
            tx.set(
              totalKaryawanDoc(),
              {
                totalAktif: Math.max(0, currentTotal + (payload.aktif ? 1 : -1)),
                updatedAt: now,
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

          if (!syncResult.ok) syncWarning = ` Namun sinkron user gagal: ${syncResult.message}`
        }

        setData((prev) =>
          prev
            .map((item) =>
              item.id === editId
                ? {
                    ...item,
                    ...payload,
                    updatedAt: now,
                  }
                : item
            )
            .sort((a, b) => a.nama.localeCompare(b.nama, "id"))
        )

        showSuccess(`Data karyawan berhasil diperbarui.${syncWarning}`)
      } else {
        const newRef = doc(collection(db, "karyawan"))

        await runTransaction(db, async (tx) => {
          const totalSnap = await tx.get(totalKaryawanDoc())
          const currentTotal = Number(totalSnap.data()?.totalAktif || 0)

          tx.set(newRef, {
            id: newRef.id,
            ...payload,
            createdAt: now,
            createdBy: user.uid,
          })

          if (payload.aktif) {
            tx.set(
              totalKaryawanDoc(),
              {
                totalAktif: Math.max(0, currentTotal + 1),
                updatedAt: now,
                updatedBy: user.uid,
              },
              { merge: true }
            )
          }
        })

        setData((prev) =>
          [
            {
              id: newRef.id,
              ...payload,
              createdAt: now,
            },
            ...prev,
          ].sort((a, b) => a.nama.localeCompare(b.nama, "id"))
        )

        showSuccess("Data karyawan berhasil ditambahkan")
      }

      closeModal()
    } catch (e: any) {
      console.error(e)
      setError(e?.message === "DATA_KARYAWAN_TIDAK_DITEMUKAN" ? "Data karyawan tidak ditemukan" : "Gagal menyimpan data karyawan")
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async () => {
    const user = auth.currentUser
    if (!user || !deleteTarget || deleteLoading) return

    setDeleteLoading(true)

    try {
      const now = Date.now()
      const ref = doc(db, "karyawan", deleteTarget.id)

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        const totalSnap = await tx.get(totalKaryawanDoc())

        if (!snap.exists()) return

        const isAktif = (snap.data() as any)?.aktif ?? true
        const currentTotal = Number(totalSnap.data()?.totalAktif || 0)

        tx.delete(ref)

        if (isAktif) {
          tx.set(
            totalKaryawanDoc(),
            {
              totalAktif: Math.max(0, currentTotal - 1),
              updatedAt: now,
              updatedBy: user.uid,
            },
            { merge: true }
          )
        }
      })

      setData((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      showSuccess("Data karyawan berhasil dihapus")
    } catch (e) {
      console.error(e)
      showError("Gagal menghapus data karyawan")
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Template & Import ────────────────────────────────────────────────────────

  const handleDownloadTemplate = () => {
    const link = document.createElement("a")
    link.href = "/templates/template_import_karyawan.xlsx"
    link.download = "template_import_karyawan.xlsx"
    link.click()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportError(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const raw = new Uint8Array(evt.target?.result as ArrayBuffer)
        const workbook = XLSX.read(raw, { type: "array" })
        const sheetName = workbook.SheetNames.find((sheet) => sheet === "Import Karyawan") ?? workbook.SheetNames[0]
        const ws = workbook.Sheets[sheetName]
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { range: 5, defval: "" })

        const parsed: ImportRow[] = rows
          .filter((row) => row["Nama Lengkap *"] || row["Email *"])
          .map((row) => ({
            nama: normalizeText(row["Nama Lengkap *"]),
            email: normalizeText(row["Email *"]).toLowerCase(),
            noHp: normalizeText(row["No HP *"]),
            tahunMasuk: Number(row["Tahun Masuk *"] || 0),
            jabatan: normalizeText(row["Jabatan *"]).toLowerCase(),
            tokoId: normalizeText(row["ID Toko *"]),
            tokoNama: normalizeText(row["Nama Toko"]),
            alamat: normalizeText(row["Alamat"]),
            aktif: normalizeText(row["Status Aktif"] || "aktif").toLowerCase() !== "nonaktif",
          }))

        if (parsed.length === 0) {
          setImportError("Tidak ada data yang ditemukan. Pastikan file menggunakan template yang benar.")
          return
        }

        if (parsed.length > 100) {
          setImportError(`Maksimal 100 baris data per import. File Anda memiliki ${parsed.length} baris.`)
          return
        }

        setImportRows(parsed)
        setImportStep("preview")
      } catch (err) {
        console.error(err)
        setImportError("Gagal membaca file. Pastikan format .xlsx dan menggunakan template yang benar.")
      }
    }

    reader.readAsArrayBuffer(file)
    e.target.value = ""
  }

  const validateImportRow = (row: ImportRow, idx: number): string | null => {
    if (!row.nama) return `Baris ${idx + 1}: Nama wajib diisi`
    if (!row.email || !isValidEmail(row.email)) return `Baris ${idx + 1}: Email tidak valid`
    if (!row.noHp) return `Baris ${idx + 1}: No HP wajib diisi`
    if (!row.tokoId) return `Baris ${idx + 1}: ID Toko wajib diisi`
    if (!JABATAN_VALID.includes(row.jabatan)) return `Baris ${idx + 1}: Jabatan tidak valid (${row.jabatan})`
    if (!row.tahunMasuk || row.tahunMasuk < 2000 || row.tahunMasuk > 2100) return `Baris ${idx + 1}: Tahun masuk tidak valid`
    return null
  }

  const handleImport = async () => {
    const user = auth.currentUser
    if (!user || importRows.length === 0 || importLoading) return

    setImportLoading(true)

    const results: ImportResult[] = []
    const existingEmails = new Set(data.map((item) => item.email.toLowerCase()))
    const createdItems: Karyawan[] = []

    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i]
      const validationErr = validateImportRow(row, i)

      if (validationErr) {
        results.push({ row: i + 1, nama: row.nama || `Baris ${i + 1}`, status: "error", message: validationErr })
        continue
      }

      if (existingEmails.has(row.email.toLowerCase())) {
        results.push({ row: i + 1, nama: row.nama, status: "skipped", message: `Email ${row.email} sudah terdaftar` })
        continue
      }

      const tokoNama = row.tokoNama || tokoList.find((item) => item.id === row.tokoId)?.nama || row.tokoId

      try {
        const now = Date.now()
        const newRef = doc(collection(db, "karyawan"))

        await runTransaction(db, async (tx) => {
          const totalSnap = await tx.get(totalKaryawanDoc())
          const currentTotal = Number(totalSnap.data()?.totalAktif || 0)

          tx.set(newRef, {
            id: newRef.id,
            nama: row.nama,
            email: row.email,
            noHp: row.noHp,
            alamat: row.alamat,
            tokoId: row.tokoId,
            tokoNama,
            jabatan: row.jabatan,
            tahunMasuk: row.tahunMasuk,
            role: "karyawan",
            aktif: row.aktif,
            createdAt: now,
            createdBy: user.uid,
          })

          if (row.aktif) {
            tx.set(
              totalKaryawanDoc(),
              {
                totalAktif: Math.max(0, currentTotal + 1),
                updatedAt: now,
                updatedBy: user.uid,
              },
              { merge: true }
            )
          }
        })

        existingEmails.add(row.email.toLowerCase())
        createdItems.push({
          id: newRef.id,
          nama: row.nama,
          email: row.email,
          noHp: row.noHp,
          alamat: row.alamat,
          tokoId: row.tokoId,
          tokoNama,
          jabatan: row.jabatan,
          tahunMasuk: row.tahunMasuk,
          role: "karyawan",
          aktif: row.aktif,
          createdAt: now,
        })
        results.push({ row: i + 1, nama: row.nama, status: "success", message: "Berhasil ditambahkan" })
      } catch (err) {
        console.error(err)
        results.push({ row: i + 1, nama: row.nama, status: "error", message: "Gagal menyimpan ke database" })
      }
    }

    if (createdItems.length > 0) {
      setData((prev) => [...createdItems, ...prev].sort((a, b) => a.nama.localeCompare(b.nama, "id")))
      showSuccess(`${createdItems.length} karyawan berhasil diimport`)
    }

    setImportResults(results)
    setImportStep("result")
    setImportLoading(false)
  }

  const closeImportModal = () => {
    if (importLoading) return
    setShowImportModal(false)
    setImportRows([])
    setImportResults([])
    setImportStep("upload")
    setImportError(null)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

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
                <Users size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Data Karyawan
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Kelola karyawan, toko, jabatan, dan status aktif.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <HeaderButton onClick={handleDownloadTemplate} icon={Download} label="Template" />
              <HeaderButton onClick={() => setShowImportModal(true)} icon={Upload} label="Import" />
              <HeaderButton onClick={openAdd} icon={Plus} label="Tambah" />
              <button
                type="button"
                onClick={refreshAll}
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
          <StatCard label="Total Karyawan" value={stats.total} icon={Users} tone="slate" />
          <StatCard label="Karyawan Aktif" value={stats.aktifCount} icon={CheckCircle2} tone="sky" />
          <StatCard label="Toko Terhubung" value={stats.tokoTerhubung} icon={Building2} tone="blue" />
        </div>

        {/* ── Search & Filter ── */}
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
                  placeholder="Nama, email, HP, toko..."
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>
            </div>

            <div className="hidden sm:contents">
              <FilterSelect label="Toko" value={filterToko} onChange={(v) => { setFilterToko(v); setPage(1) }} icon={Building2}>
                <option value="">Semua Toko</option>
                {tokoList.map((item) => (
                  <option key={item.id} value={item.id}>{item.nama}</option>
                ))}
              </FilterSelect>

              <FilterSelect label="Jabatan" value={filterJabatan} onChange={(v) => { setFilterJabatan(v); setPage(1) }} icon={Briefcase}>
                <option value="">Semua Jabatan</option>
                {JABATAN_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
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
            >
              <Plus size={14} strokeWidth={2.5} />
              Tambah
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700"
            >
              <Upload size={14} strokeWidth={2.5} />
              Import
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
                  <FilterSelect label="Toko" value={filterToko} onChange={(v) => { setFilterToko(v); setPage(1) }} icon={Building2}>
                    <option value="">Semua Toko</option>
                    {tokoList.map((item) => (
                      <option key={item.id} value={item.id}>{item.nama}</option>
                    ))}
                  </FilterSelect>

                  <FilterSelect label="Jabatan" value={filterJabatan} onChange={(v) => { setFilterJabatan(v); setPage(1) }} icon={Briefcase}>
                    <option value="">Semua Jabatan</option>
                    {JABATAN_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
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

        <KaryawanSection
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
          setShowImportModal={setShowImportModal}
        />

        <KaryawanFormModal
          show={showModal}
          isEdit={isEdit}
          form={form}
          error={error}
          tokoList={tokoList}
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

        <ImportModal
          show={showImportModal}
          importStep={importStep}
          importRows={importRows}
          importResults={importResults}
          importLoading={importLoading}
          importError={importError}
          fileInputRef={fileInputRef}
          handleFileSelect={handleFileSelect}
          handleDownloadTemplate={handleDownloadTemplate}
          handleImport={handleImport}
          closeImportModal={closeImportModal}
          setImportStep={setImportStep}
          setImportRows={setImportRows}
          setImportResults={setImportResults}
          validateImportRow={validateImportRow}
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

function KaryawanSection({
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
  setShowImportModal,
}: {
  loading: boolean
  paged: Karyawan[]
  filtered: Karyawan[]
  page: number
  totalPages: number
  itemsPerPage: number
  goPage: (page: number) => void
  openAdd: () => void
  openEdit: (item: Karyawan) => void
  setDeleteTarget: (item: Karyawan) => void
  setShowImportModal: (value: boolean) => void
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
            Memuat data karyawan...
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
          Data karyawan belum tersedia
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            onClick={openAdd}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2 text-xs font-black text-white shadow-sm shadow-sky-500/15"
          >
            <Plus size={13} strokeWidth={2.5} />
            Tambah Manual
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-black text-sky-700"
          >
            <Upload size={13} strokeWidth={2.5} />
            Import Excel
          </motion.button>
        </div>
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
                      {item.tokoNama || "-"} · {getJabatanLabel(item.jabatan)}
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
                    <span className="truncate">{item.noHp || "-"}</span>
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
                {["No", "Nama", "Toko", "Jabatan", "Tahun", "Email", "No HP", "Status", "Aksi"].map((head) => (
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
                  <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{item.nama}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.tokoNama || "-"}</td>
                  <td className="px-3 py-3">
                    <span className="whitespace-nowrap rounded-lg bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">
                      {getJabatanLabel(item.jabatan)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.tahunMasuk || "-"}</td>
                  <td className="px-3 py-3 font-semibold text-slate-600">{item.email || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.noHp || "-"}</td>
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
    title="Edit karyawan"
  >
    <Pencil size={13} strokeWidth={2.6} />
  </button>

  <button
  type="button"
  onClick={() => setDeleteTarget(item)}
  className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/70 bg-rose-600 text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700"
  title="Hapus karyawan"
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

function KaryawanFormModal({
  show,
  isEdit,
  form,
  error,
  tokoList,
  submitLoading,
  setField,
  closeModal,
  handleSubmit,
}: {
  show: boolean
  isEdit: boolean
  form: FormState
  error: string | null
  tokoList: Toko[]
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
            className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                  {isEdit ? "Edit Data Karyawan" : "Tambah Data Karyawan"}
                </p>
                <h2 className="truncate text-base font-black text-slate-800">
                  {form.nama || "Karyawan Baru"}
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
              <div className="space-y-3">
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

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                  <FieldInput label="Nama Lengkap" value={form.nama} onChange={(v) => setField("nama")(v)} icon={Users} placeholder="Nama lengkap karyawan" />
                  <FieldInput label="Email" value={form.email} onChange={(v) => setField("email")(v)} icon={Mail} type="email" placeholder="email@contoh.com" />
                  <FieldInput label="No HP" value={form.noHp} onChange={(v) => setField("noHp")(v)} icon={Phone} type="tel" placeholder="08123456789" />
                  <FieldInput label="Tahun Masuk" value={form.tahunMasuk} onChange={(v) => setField("tahunMasuk")(v)} icon={Calendar} type="number" placeholder="2026" />

                  <FieldSelect label="Toko" value={form.tokoId} onChange={(v) => setField("tokoId")(v)} icon={Building2}>
                    <option value="">Pilih Toko</option>
                    {tokoList.map((item) => (
                      <option key={item.id} value={item.id}>{item.nama}</option>
                    ))}
                  </FieldSelect>

                  <FieldSelect label="Jabatan" value={form.jabatan} onChange={(v) => setField("jabatan")(v)} icon={Briefcase}>
                    <option value="">Pilih Jabatan</option>
                    {JABATAN_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </FieldSelect>

                  <FieldSelect label="Status" value={form.aktif ? "aktif" : "nonaktif"} onChange={(v) => setField("aktif")(v === "aktif")} icon={UserCheck}>
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </FieldSelect>

                  <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Role Otomatis</p>
                    <p className="mt-1 text-sm font-black text-sky-700">karyawan</p>
                  </div>

                  <FieldTextarea
                    label="Alamat"
                    value={form.alamat}
                    onChange={(v) => setField("alamat")(v)}
                    icon={MapPin}
                    placeholder="Alamat karyawan"
                    className="sm:col-span-2"
                  />
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
  target: Karyawan | null
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
                  <h2 className="text-base font-black leading-none tracking-tight text-white">Hapus Karyawan</h2>
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
                Anda yakin mau menghapus karyawan ini?
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black text-slate-800">{target.nama}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {target.tokoNama || "-"} · {getJabatanLabel(target.jabatan)}
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

function ImportModal({
  show,
  importStep,
  importRows,
  importResults,
  importLoading,
  importError,
  fileInputRef,
  handleFileSelect,
  handleDownloadTemplate,
  handleImport,
  closeImportModal,
  setImportStep,
  setImportRows,
  setImportResults,
  validateImportRow,
}: {
  show: boolean
  importStep: ImportStep
  importRows: ImportRow[]
  importResults: ImportResult[]
  importLoading: boolean
  importError: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleDownloadTemplate: () => void
  handleImport: () => void
  closeImportModal: () => void
  setImportStep: (step: ImportStep) => void
  setImportRows: (rows: ImportRow[]) => void
  setImportResults: (rows: ImportResult[]) => void
  validateImportRow: (row: ImportRow, idx: number) => string | null
}) {
  const successCount = importResults.filter((item) => item.status === "success").length
  const skippedCount = importResults.filter((item) => item.status === "skipped").length
  const errorCount = importResults.filter((item) => item.status === "error").length

  const resetToUpload = () => {
    setImportStep("upload")
    setImportRows([])
    setImportResults([])
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !importLoading) closeImportModal()
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                  Import Data Karyawan
                </p>
                <h2 className="truncate text-base font-black text-slate-800">
                  {importStep === "upload" && "Upload File Excel"}
                  {importStep === "preview" && `${importRows.length} Baris Siap Dicek`}
                  {importStep === "result" && "Hasil Import"}
                </h2>
              </div>

              {!importLoading && (
                <button
                  type="button"
                  onClick={closeImportModal}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                >
                  <X size={17} strokeWidth={2.5} />
                </button>
              )}
            </div>

            <div className="max-h-[calc(88vh-65px)] overflow-y-auto p-4 sm:p-5">
              {importStep === "upload" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-3">
                    <FileSpreadsheet size={20} className="shrink-0 text-sky-600" strokeWidth={2.5} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-sky-800">Belum punya template?</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-sky-600">
                        Download template Excel, isi data, lalu upload di sini.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sky-500 px-3 py-2 text-[10px] font-black text-white"
                    >
                      <Download size={12} strokeWidth={2.5} />
                      Template
                    </button>
                  </div>

                  {importError && (
                    <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5">
                      <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" strokeWidth={2.5} />
                      <p className="text-[11px] font-bold text-red-600">{importError}</p>
                    </div>
                  )}

                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />

                  <motion.div
                    whileTap={{ scale: 0.99 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-8 text-center transition hover:border-sky-300 hover:bg-sky-50/40"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                      <Upload size={28} strokeWidth={1.8} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-700">Klik untuk pilih file</p>
                      <p className="mt-1 text-[10px] font-semibold text-slate-400">Format .xlsx · Maksimal 100 baris</p>
                    </div>
                  </motion.div>
                </div>
              )}

              {importStep === "preview" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black text-slate-700">{importRows.length} baris ditemukan</p>
                    <button type="button" onClick={resetToUpload} className="text-[10px] font-black text-sky-600 underline">
                      Ganti File
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="max-h-72 overflow-x-auto overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
                          <tr>
                            {["#", "Nama", "Email", "HP", "Jabatan", "ID Toko", "Tahun", "Status"].map((head) => (
                              <th key={head} className="whitespace-nowrap px-3 py-2 text-left text-[9px] font-black uppercase tracking-wide text-slate-400">
                                {head}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.map((row, idx) => {
                            const err = validateImportRow(row, idx)
                            return (
                              <tr key={idx} className={`border-t border-slate-100 ${err ? "bg-red-50" : "bg-white"}`}>
                                <td className="px-3 py-2 font-bold text-slate-400">{idx + 1}</td>
                                <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-800">{row.nama || <span className="text-red-400">-</span>}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{row.email || <span className="text-red-400">-</span>}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{row.noHp || "-"}</td>
                                <td className="px-3 py-2">
                                  <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${JABATAN_VALID.includes(row.jabatan) ? "bg-sky-50 text-sky-700" : "bg-red-100 text-red-600"}`}>
                                    {row.jabatan || "-"}
                                  </span>
                                </td>
                                <td className="max-w-[140px] truncate whitespace-nowrap px-3 py-2 text-slate-600">{row.tokoId || <span className="text-red-400">-</span>}</td>
                                <td className="px-3 py-2 text-slate-600">{row.tahunMasuk || "-"}</td>
                                <td className="px-3 py-2">
                                  <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${row.aktif ? "bg-sky-50 text-sky-700" : "bg-rose-50 text-rose-700"}`}>
                                    {row.aktif ? "Aktif" : "Nonaktif"}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {importRows.some((row, idx) => validateImportRow(row, idx)) && (
                    <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-500" strokeWidth={2.5} />
                      <p className="text-[11px] font-bold text-amber-700">
                        Baris merah akan dilewati saat import.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={resetToUpload}
                      disabled={importLoading}
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleImport}
                      disabled={importLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-sky-500/15 disabled:opacity-60"
                    >
                      {importLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} strokeWidth={2.5} />}
                      {importLoading ? "Mengimport..." : "Mulai Import"}
                    </button>
                  </div>
                </div>
              )}

              {importStep === "result" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <ResultBox label="Berhasil" value={successCount} tone="success" />
                    <ResultBox label="Dilewati" value={skippedCount} tone="warning" />
                    <ResultBox label="Gagal" value={errorCount} tone="danger" />
                  </div>

                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {importResults.map((item, idx) => (
                      <div
                        key={idx}
                        className={`rounded-2xl border p-3 ${
                          item.status === "success"
                            ? "border-sky-200 bg-sky-50"
                            : item.status === "skipped"
                              ? "border-amber-200 bg-amber-50"
                              : "border-red-200 bg-red-50"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {item.status === "success" ? (
                            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-sky-600" strokeWidth={2.5} />
                          ) : item.status === "skipped" ? (
                            <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" strokeWidth={2.5} />
                          ) : (
                            <XCircle size={16} className="mt-0.5 shrink-0 text-red-600" strokeWidth={2.5} />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black text-slate-800">Baris {item.row} · {item.nama}</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{item.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={closeImportModal}
                      className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-sky-500/15"
                    >
                      Selesai
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ResultBox({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "danger" }) {
  const cls =
    tone === "success"
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-red-200 bg-red-50 text-red-700"

  return (
    <div className={`rounded-2xl border p-3 text-center ${cls}`}>
      <p className="text-2xl font-black leading-tight">{value}</p>
      <p className="mt-0.5 text-[10px] font-black uppercase tracking-widest">{label}</p>
    </div>
  )
}
