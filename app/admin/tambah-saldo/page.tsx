/*
  Halaman admin master saldo digital.
  Layout konsisten dengan halaman master data terbaru: tema biru muda, stat card 2 kolom mobile, filter collapse mobile, tabel desktop, card mobile, toast fixed, dan update local state tanpa reload penuh.
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  Cpu,
  ListFilter,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Store,
  Trash2,
  Wallet,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type MasterSaldoDigital = {
  id: string
  namaSaldo: string
  jumlahSaldo: number
  jumlahMinimum: number
  aktif: boolean
  keterangan: string
  createdAt?: number
  updatedAt?: number
}

type FormState = {
  namaSaldo: string
  jumlahSaldo: string
  jumlahMinimum: string
  aktif: boolean
  keterangan: string
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 0, label: "ALL" },
]

const EMPTY_FORM: FormState = {
  namaSaldo: "",
  jumlahSaldo: "",
  jumlahMinimum: "",
  aktif: true,
  keterangan: "",
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatDateTime(value?: number) {
  if (!value) return "-"

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function normalizeText(value: unknown) {
  return String(value || "").trim()
}

export default function TambahSaldoPage() {
  const router = useRouter()

  const [data, setData] = useState<MasterSaldoDigital[]>([])
  const [loading, setLoading] = useState(true)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MasterSaldoDigital | null>(null)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
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

  const fetchData = async () => {
    setLoading(true)

    try {
      const qRef = query(collection(db, "master_saldo_digital"), orderBy("namaSaldo"))
      const snap = await getDocs(qRef)

      const list: MasterSaldoDigital[] = snap.docs.map((item) => {
        const x = item.data() as any

        return {
          id: item.id,
          namaSaldo: normalizeText(x?.namaSaldo),
          jumlahSaldo: Number(x?.jumlahSaldo || 0),
          jumlahMinimum: Number(x?.jumlahMinimum || 0),
          aktif: x?.aktif !== false,
          keterangan: normalizeText(x?.keterangan),
          createdAt:
            typeof x?.createdAt?.toMillis === "function"
              ? x.createdAt.toMillis()
              : Number(x?.createdAt || 0),
          updatedAt:
            typeof x?.updatedAt?.toMillis === "function"
              ? x.updatedAt.toMillis()
              : Number(x?.updatedAt || 0),
        }
      })

      setData(list)
    } catch (e) {
      console.error(e)
      setData([])
      showError("Gagal memuat master saldo")
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return data.filter((item) => {
      const matchSearch =
        !q ||
        item.namaSaldo.toLowerCase().includes(q) ||
        item.keterangan.toLowerCase().includes(q) ||
        String(item.jumlahSaldo || "").includes(q) ||
        String(item.jumlahMinimum || "").includes(q)

      const matchStatus =
        !filterStatus ||
        (filterStatus === "aktif" && item.aktif) ||
        (filterStatus === "nonaktif" && !item.aktif)

      return matchSearch && matchStatus
    })
  }, [data, search, filterStatus])

  const stats = useMemo(() => {
    const totalSaldoAktif = data
      .filter((item) => item.aktif)
      .reduce((sum, item) => sum + Number(item.jumlahSaldo || 0), 0)

    const totalSumberSaldo = data.length
    const totalSaldoAktifCount = data.filter((item) => item.aktif).length
    const totalSaldoMinimum = data.reduce((sum, item) => sum + Number(item.jumlahMinimum || 0), 0)
    const totalSaldoPerluRestock = data.filter(
      (item) => item.aktif && Number(item.jumlahSaldo || 0) <= Number(item.jumlahMinimum || 0)
    ).length

    return {
      totalSaldoAktif,
      totalSumberSaldo,
      totalSaldoAktifCount,
      totalSaldoMinimum,
      totalSaldoPerluRestock,
    }
  }, [data])

  const totalPages = itemsPerPage === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / itemsPerPage))
  const paged = itemsPerPage === 0 ? filtered : filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  const goPage = (p: number) => setPage(Math.max(1, Math.min(totalPages, p)))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const openAdd = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowModal(true)
  }

  const openEdit = (item: MasterSaldoDigital) => {
    setEditId(item.id)
    setForm({
      namaSaldo: item.namaSaldo || "",
      jumlahSaldo: item.jumlahSaldo ? String(item.jumlahSaldo) : "",
      jumlahMinimum: item.jumlahMinimum ? String(item.jumlahMinimum) : "",
      aktif: item.aktif !== false,
      keterangan: item.keterangan || "",
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    if (submitLoading) return
    setShowModal(false)
    setEditId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  const validateForm = () => {
    const namaSaldo = form.namaSaldo.trim()
    const jumlahSaldo = Number(form.jumlahSaldo)
    const jumlahMinimum = Number(form.jumlahMinimum)

    if (!namaSaldo) return "Nama saldo wajib diisi"
    if (!form.jumlahSaldo.trim()) return "Jumlah saldo wajib diisi"
    if (!form.jumlahMinimum.trim()) return "Jumlah minimum wajib diisi"
    if (Number.isNaN(jumlahSaldo) || jumlahSaldo < 0) return "Jumlah saldo tidak valid"
    if (Number.isNaN(jumlahMinimum) || jumlahMinimum < 0) return "Jumlah minimum tidak valid"

    const duplicateNama = data.find((item) => {
      const sameName = item.namaSaldo.trim().toLowerCase() === namaSaldo.toLowerCase()
      const notSelf = !editId || item.id !== editId
      return sameName && notSelf
    })

    if (duplicateNama) return "Nama saldo sudah dipakai"

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
      const payload = {
        namaSaldo: form.namaSaldo.trim(),
        jumlahSaldo: Number(form.jumlahSaldo),
        jumlahMinimum: Number(form.jumlahMinimum),
        aktif: Boolean(form.aktif),
        keterangan: form.keterangan.trim(),
      }

      if (isEdit && editId) {
        await updateDoc(doc(db, "master_saldo_digital", editId), {
          ...payload,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        })

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
            .sort((a, b) => a.namaSaldo.localeCompare(b.namaSaldo, "id"))
        )

        showSuccess("Master saldo berhasil diperbarui")
      } else {
        const newRef = await addDoc(collection(db, "master_saldo_digital"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        })

        const newItem: MasterSaldoDigital = {
          id: newRef.id,
          ...payload,
          createdAt: now,
          updatedAt: now,
        }

        setData((prev) => [newItem, ...prev].sort((a, b) => a.namaSaldo.localeCompare(b.namaSaldo, "id")))
        showSuccess("Master saldo berhasil ditambahkan")
      }

      closeModal()
    } catch (e) {
      console.error(e)
      setError("Gagal menyimpan master saldo")
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || deleteLoading) return

    setDeleteLoading(true)

    try {
      await deleteDoc(doc(db, "master_saldo_digital", deleteTarget.id))
      setData((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      showSuccess("Master saldo berhasil dihapus")
    } catch (e) {
      console.error(e)
      showError("Gagal menghapus master saldo")
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
      <main className="relative w-full space-y-4 pb-28">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <Wallet size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Master Saldo
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Multi sumber saldo digital, batas minimum, dan status restock.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <HeaderButton icon={Store} label="Provider" onClick={() => router.push("/admin/tambah-provider")} />
              <HeaderButton icon={Plus} label="Tambah" onClick={openAdd} />
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
<div className="space-y-2 sm:space-y-3">
  <SaldoStatCard
    label="Total Saldo Aktif"
    value={formatRupiah(stats.totalSaldoAktif)}
    icon={Coins}
    tone="sky"
    
  />

  <div className="grid grid-cols-3 gap-2 sm:gap-3">
    <SaldoStatCard
      label="Sumber Saldo"
      value={String(stats.totalSumberSaldo)}
      icon={Wallet}
      tone="blue"
    />
    <SaldoStatCard
      label="Saldo Aktif"
      value={String(stats.totalSaldoAktifCount)}
      icon={ShieldCheck}
      tone="slate"
    />
    <SaldoStatCard
      label="Restock"
      value={String(stats.totalSaldoPerluRestock)}      
      icon={ShieldAlert}
      tone="rose"
    />
  </div>
</div>

        {/* Search & Filter */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <FieldBox label="Cari Saldo">
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
                    placeholder="Nama saldo, nominal, atau keterangan..."
                    className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  />
                </div>
              </FieldBox>
            </div>

            <div className="hidden sm:contents">
              <FilterSelect
                label="Status"
                value={filterStatus}
                onChange={(v) => {
                  setFilterStatus(v)
                  setPage(1)
                }}
                icon={ShieldCheck}
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
              onClick={() => router.push("/admin/tambah-provider")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-sky-700"
              type="button"
            >
              <Store size={14} strokeWidth={2.5} />
              Provider
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={() => setFilterMobileOpen((prev) => !prev)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] transition ${
                filterMobileOpen ? "border-sky-200 bg-sky-100 text-sky-700" : "border-slate-200 bg-white text-slate-600"
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
                  <FilterSelect
                    label="Status"
                    value={filterStatus}
                    onChange={(v) => {
                      setFilterStatus(v)
                      setPage(1)
                    }}
                    icon={ShieldCheck}
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
                    {ITEMS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </FilterSelect>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <SaldoSection
          loading={loading}
          filtered={filtered}
          paged={paged}
          page={page}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          goPage={goPage}
          openAdd={openAdd}
          openEdit={openEdit}
          setDeleteTarget={setDeleteTarget}
        />

        <SaldoFormModal
          show={showModal}
          isEdit={isEdit}
          form={form}
          error={error}
          submitLoading={submitLoading}
          setForm={setForm}
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

function SaldoStatCard({
  label,
  value,
  subValue,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  subValue?: string
  icon: any
  tone: "slate" | "sky" | "blue" | "rose"
}) {
  const cls =
    tone === "sky"
      ? "bg-sky-50 text-sky-600"
      : tone === "blue"
        ? "bg-blue-50 text-blue-600"
        : tone === "rose"
          ? "bg-rose-50 text-rose-600"
          : "bg-slate-100 text-slate-500"

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-2xl sm:flex sm:h-11 sm:w-11 ${cls}`}>
          <Icon size={18} strokeWidth={2.5} className="sm:h-[21px] sm:w-[21px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[7px] font-black uppercase tracking-[0.05em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          <p className="mt-0.5 truncate text-[13px] font-black leading-tight text-slate-800 sm:text-xl">
            {value}
          </p>
          {subValue && (
            <p className="mt-0.5 truncate text-[7px] font-black uppercase tracking-[0.04em] text-slate-400 sm:text-[9px]">
              {subValue}
            </p>
          )}
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

function SaldoSection({
  loading,
  filtered,
  paged,
  page,
  totalPages,
  itemsPerPage,
  goPage,
  openAdd,
  openEdit,
  setDeleteTarget,
}: {
  loading: boolean
  filtered: MasterSaldoDigital[]
  paged: MasterSaldoDigital[]
  page: number
  totalPages: number
  itemsPerPage: number
  goPage: (page: number) => void
  openAdd: () => void
  openEdit: (item: MasterSaldoDigital) => void
  setDeleteTarget: (item: MasterSaldoDigital) => void
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
            Memuat data saldo...
          </p>
        </div>
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <Wallet size={28} className="text-slate-300" strokeWidth={2} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Master saldo belum tersedia
        </p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          onClick={openAdd}
          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2 text-xs font-black text-white shadow-sm shadow-sky-500/15"
          type="button"
        >
          <Plus size={13} strokeWidth={2.5} />
          Tambah Saldo Pertama
        </motion.button>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2 sm:hidden">
        {paged.map((item, idx) => {
          const perluRestock = item.aktif && Number(item.jumlahSaldo || 0) <= Number(item.jumlahMinimum || 0)

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
                  <Wallet size={20} strokeWidth={2.5} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black leading-tight text-slate-800">
                        {item.namaSaldo}
                      </p>
                      <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                        {formatRupiah(item.jumlahSaldo)}
                      </p>
                    </div>

                    <span
                      className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                        item.aktif ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {item.aktif ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                    <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                      <ShieldAlert size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                      <span className="truncate">Minimum: {formatRupiah(item.jumlahMinimum)}</span>
                    </p>
                    <p className="flex min-w-0 items-start gap-2 text-xs font-semibold leading-relaxed text-slate-600">
                      <AlertCircle size={13} className="mt-0.5 shrink-0 text-slate-400" strokeWidth={2.5} />
                      <span className="line-clamp-2">{item.keterangan || "-"}</span>
                    </p>
                    {perluRestock && (
                      <span className="inline-flex rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-rose-700">
                        Perlu Restock
                      </span>
                    )}
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
                {["No", "Nama Saldo", "Jumlah", "Minimum", "Status", "Keterangan", "Update", "Aksi"].map((head) => (
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
                const perluRestock = item.aktif && Number(item.jumlahSaldo || 0) <= Number(item.jumlahMinimum || 0)

                return (
                  <tr key={item.id} className="border-t border-slate-100 transition-colors hover:bg-sky-50/40">
                    <td className="px-3 py-3 text-center font-bold text-slate-400">
                      {itemsPerPage === 0 ? index + 1 : (page - 1) * itemsPerPage + index + 1}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{item.namaSaldo}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{formatRupiah(item.jumlahSaldo)}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{formatRupiah(item.jumlahMinimum)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-black ${item.aktif ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
                          {item.aktif ? "Aktif" : "Nonaktif"}
                        </span>
                        {perluRestock && (
                          <span className="whitespace-nowrap rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700">
                            Perlu Restock
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[280px] px-3 py-3 font-semibold text-slate-600">
                      <p className="line-clamp-2">{item.keterangan || "-"}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">
                      {formatDateTime(item.updatedAt || item.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:bg-sky-100"
                          title="Edit saldo"
                        >
                          <Pencil size={13} strokeWidth={2.6} />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/70 bg-rose-600 text-white shadow-sm shadow-rose-500/15 transition hover:bg-rose-700"
                          title="Hapus saldo"
                        >
                          <Trash2 size={13} strokeWidth={2.6} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
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

function SaldoFormModal({
  show,
  isEdit,
  form,
  error,
  submitLoading,
  setForm,
  closeModal,
  handleSubmit,
}: {
  show: boolean
  isEdit: boolean
  form: FormState
  error: string | null
  submitLoading: boolean
  setForm: React.Dispatch<React.SetStateAction<FormState>>
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
            className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                  {isEdit ? "Edit Master Saldo" : "Tambah Master Saldo"}
                </p>
                <h2 className="truncate text-base font-black text-slate-800">
                  {form.namaSaldo || "Saldo Baru"}
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
                  <FieldInput
                    label="Nama Saldo"
                    value={form.namaSaldo}
                    onChange={(value) => setForm((prev) => ({ ...prev, namaSaldo: value }))}
                    icon={Wallet}
                    placeholder="Contoh: Saldo Aplikasi 1"
                  />

                  <FieldSelect
                    label="Status"
                    value={String(form.aktif)}
                    onChange={(value) => setForm((prev) => ({ ...prev, aktif: value === "true" }))}
                    icon={ShieldCheck}
                  >
                    <option value="true">Aktif</option>
                    <option value="false">Nonaktif</option>
                  </FieldSelect>

                  <FieldInput
                    label="Jumlah Saldo"
                    value={form.jumlahSaldo}
                    onChange={(value) => setForm((prev) => ({ ...prev, jumlahSaldo: value.replace(/[^\d]/g, "") }))}
                    icon={Coins}
                    inputMode="numeric"
                    placeholder="Contoh: 10000000"
                  />

                  <FieldInput
                    label="Jumlah Minimum"
                    value={form.jumlahMinimum}
                    onChange={(value) => setForm((prev) => ({ ...prev, jumlahMinimum: value.replace(/[^\d]/g, "") }))}
                    icon={ShieldAlert}
                    inputMode="numeric"
                    placeholder="Contoh: 500000"
                  />

                  <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5 sm:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Preview Nominal</p>
                    <p className="mt-1 text-xs font-black text-sky-700">
                      Saldo {formatRupiah(Number(form.jumlahSaldo || 0))} · Minimum {formatRupiah(Number(form.jumlahMinimum || 0))}
                    </p>
                  </div>

                  <FieldTextarea
                    label="Keterangan"
                    value={form.keterangan}
                    onChange={(value) => setForm((prev) => ({ ...prev, keterangan: value }))}
                    icon={AlertCircle}
                    placeholder="Opsional. Contoh: Saldo dari aplikasi utama atau cadangan."
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
                      <RefreshCw size={16} className="animate-spin" strokeWidth={2.5} />
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
  target: MasterSaldoDigital | null
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
                  <h2 className="text-base font-black leading-none tracking-tight text-white">Hapus Master Saldo</h2>
                  <p className="mt-0.5 max-w-[220px] truncate text-[10px] font-bold uppercase tracking-[0.15em] text-white/70">
                    {target.namaSaldo}
                  </p>
                </div>
              </div>
              <div className="pointer-events-none absolute right-0 top-0 opacity-10">
                <Cpu size={100} strokeWidth={1} className="text-white" />
              </div>
            </div>

            <div className="space-y-3 p-5">
              <p className="text-[11px] font-semibold text-slate-600">
                Kamu yakin mau menghapus sumber saldo ini?
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-black text-slate-800">{target.namaSaldo}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {formatRupiah(target.jumlahSaldo)} · Min {formatRupiah(target.jumlahMinimum)}
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
                    <RefreshCw size={16} className="animate-spin" strokeWidth={2.5} />
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
