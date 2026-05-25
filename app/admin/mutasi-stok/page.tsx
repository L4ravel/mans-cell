/* 
  Halaman admin mutasi stok.
  Layout diseragamkan dengan Transfer Barang: header biru, kartu putih rounded-2xl,
  toast fixed, filter collapse mobile, pagination incremental 10/25/50/100/250/500, dan detail modal rapi.
  Data awal hanya 10; saat naik limit, Firestore hanya mengambil tambahan dengan cursor startAfter.
*/

"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore"
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cpu,
  Database,
  Eye,
  ListFilter,
  Mail,
  Package,
  RefreshCw,
  Search,
  Store,
  Truck,
  User2,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

type MutasiStok = {
  id: string
  transaksiId?: string
  nomorTransaksi?: string
  tipe: "masuk" | "keluar"
  sumber: string
  tokoId: string
  tokoNama: string
  barangId: string
  kodeBarang: string
  namaBarang: string
  qty: number
  stokSebelum: number
  stokSesudah: number
  keterangan?: string
  createdAtMs: number
  createdBy?: string

  pengirimUid?: string
  pengirimNama?: string
  pengirimEmail?: string

  penerimaUid?: string
  penerimaNama?: string
  penerimaEmail?: string
}

type TransferBarang = {
  id: string
  kodeTransfer: string
  status: string
  barangId: string
  barangTujuanId: string
  kodeBarang: string
  namaBarang: string
  qty: number
  satuan?: string
  tokoAsalId: string
  tokoAsalNama: string
  tokoTujuanId: string
  tokoTujuanNama: string
  stokAsalSebelum: number
  stokAsalSesudah: number
  stokTujuanSebelum: number
  stokTujuanSesudah: number
  catatan?: string
  catatanPenerimaan?: string
  sentAt?: any
  receivedAt?: any
  sentBy?: string
  sentByNama?: string
  sentByEmail?: string
  receivedBy?: string
  receivedByNama?: string
  receivedByEmail?: string
}

type TokoOption = {
  id: string
  nama: string
}

const ITEMS_OPTIONS = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 250, label: "250" },
  { value: 500, label: "500" },
]

const DEFAULT_FETCH_LIMIT = 10
const MAX_FETCH_LIMIT = 500

function toMillis(value: any) {
  if (!value) return 0
  if (typeof value === "number") return value
  if (typeof value?.toMillis === "function") return value.toMillis()
  if (value?.seconds) return value.seconds * 1000
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function formatTanggal(value?: number) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function getTipeMeta(tipe: "masuk" | "keluar") {
  if (tipe === "masuk") {
    return {
      label: "Masuk",
      icon: ArrowDownLeft,
      className: "bg-sky-100 text-sky-700",
    }
  }

  return {
    label: "Keluar",
    icon: ArrowUpRight,
    className: "bg-rose-100 text-rose-700",
  }
}

function FieldBox({
  label,
  children,
  className = "",
}: {
  label: string
  children: ReactNode
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
  onChange: (value: string) => void
  children: ReactNode
  label: string
  icon?: any
}) {
  return (
    <FieldBox label={label}>
      <div className="relative">
        {Icon ? (
          <Icon
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2.5}
          />
        ) : null}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20 ${Icon ? "pl-8" : "pl-3"}`}
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

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  loading = false,
}: {
  label: string
  value: number
  icon: any
  tone: "slate" | "sky" | "blue" | "rose"
  loading?: boolean
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
    <motion.div
      layout
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4"
    >
      <AnimatePresence>
        {loading ? (
          <motion.div
            key="stat-loading-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-slate-100/80 to-transparent"
          />
        ) : null}
      </AnimatePresence>

      <div className="relative flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left">
        <motion.div
          animate={loading ? { scale: [1, 1.05, 1], opacity: [0.75, 1, 0.75] } : { scale: 1, opacity: 1 }}
          transition={loading ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : { duration: 0.18 }}
          className={`hidden h-9 w-9 items-center justify-center rounded-2xl sm:flex sm:h-11 sm:w-11 ${cls}`}
        >
          <Icon size={18} strokeWidth={2.5} className="sm:h-[21px] sm:w-[21px]" />
        </motion.div>

        <div className="min-w-0">
          <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>

          <div className="mt-0.5 flex min-h-[28px] items-center justify-center sm:justify-start">
            <AnimatePresence mode="wait" initial={false}>
              {loading ? (
                <motion.div
                  key="stat-skeleton"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className="h-6 w-14 rounded-lg bg-slate-200/85 sm:h-7 sm:w-16"
                />
              ) : (
                <motion.p
                  key={value}
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="text-lg font-black leading-tight text-slate-800 sm:text-2xl"
                >
                  {value}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function ActorBlock({
  title,
  nama,
  email,
}: {
  title: string
  nama?: string
  email?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        {title}
      </p>
      <div className="mt-2 flex items-center gap-2 text-sm font-black text-slate-800">
        <User2 size={14} strokeWidth={2.5} />
        {nama || "-"}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-600">
        <Mail size={13} strokeWidth={2.5} />
        {email || "-"}
      </div>
    </div>
  )
}

function DetailMiniCard({
  label,
  value,
  subValue,
}: {
  label: string
  value: string
  subValue?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-black text-slate-800">{value}</p>
      {subValue ? (
        <p className="mt-1 text-[12px] font-semibold text-slate-500">{subValue}</p>
      ) : null}
    </div>
  )
}

function normalizeFetchLimit(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_FETCH_LIMIT
  return Math.min(MAX_FETCH_LIMIT, Math.max(DEFAULT_FETCH_LIMIT, Math.floor(value)))
}

function mapMutasiDoc(d: QueryDocumentSnapshot<DocumentData>): MutasiStok {
  const x = d.data() as any

  return {
    id: d.id,
    transaksiId: x?.transaksiId || "",
    nomorTransaksi: x?.nomorTransaksi || "",
    tipe: x?.tipe === "masuk" ? "masuk" : "keluar",
    sumber: x?.sumber || "",
    tokoId: x?.tokoId || "",
    tokoNama: x?.tokoNama || "",
    barangId: x?.barangId || "",
    kodeBarang: x?.kodeBarang || "",
    namaBarang: x?.namaBarang || "",
    qty: Number(x?.qty || 0),
    stokSebelum: Number(x?.stokSebelum || 0),
    stokSesudah: Number(x?.stokSesudah || 0),
    keterangan: x?.keterangan || "",
    createdAtMs: Number(x?.createdAtMs || 0),
    createdBy: x?.createdBy || "",
    pengirimUid: x?.pengirimUid || "",
    pengirimNama: x?.pengirimNama || "",
    pengirimEmail: x?.pengirimEmail || "",
    penerimaUid: x?.penerimaUid || "",
    penerimaNama: x?.penerimaNama || "",
    penerimaEmail: x?.penerimaEmail || "",
  }
}

function mapTransferDoc(d: QueryDocumentSnapshot<DocumentData>): TransferBarang {
  const x = d.data() as any

  return {
    id: d.id,
    kodeTransfer: x?.kodeTransfer || d.id,
    status: x?.status || "",
    barangId: x?.barangId || "",
    barangTujuanId: x?.barangTujuanId || "",
    kodeBarang: x?.kodeBarang || "",
    namaBarang: x?.namaBarang || "",
    qty: Number(x?.qty || 0),
    satuan: x?.satuan || "",
    tokoAsalId: x?.tokoAsalId || "",
    tokoAsalNama: x?.tokoAsalNama || "",
    tokoTujuanId: x?.tokoTujuanId || "",
    tokoTujuanNama: x?.tokoTujuanNama || "",
    stokAsalSebelum: Number(x?.stokAsalSebelum || 0),
    stokAsalSesudah: Number(x?.stokAsalSesudah || 0),
    stokTujuanSebelum: Number(x?.stokTujuanSebelum || 0),
    stokTujuanSesudah: Number(x?.stokTujuanSesudah || 0),
    catatan: x?.catatan || "",
    catatanPenerimaan: x?.catatanPenerimaan || "",
    sentAt: x?.sentAt,
    receivedAt: x?.receivedAt,
    sentBy: x?.sentBy || "",
    sentByNama: x?.sentByNama || "",
    sentByEmail: x?.sentByEmail || "",
    receivedBy: x?.receivedBy || "",
    receivedByNama: x?.receivedByNama || "",
    receivedByEmail: x?.receivedByEmail || "",
  }
}

function transferToMutasiList(transferList: TransferBarang[]) {
  const transferMutasiList: MutasiStok[] = []

  for (const item of transferList) {
    if ((item.status === "DIKIRIM" || item.status === "DITERIMA") && toMillis(item.sentAt)) {
      transferMutasiList.push({
        id: `transfer-keluar-${item.id}`,
        transaksiId: item.id,
        nomorTransaksi: item.kodeTransfer,
        tipe: "keluar",
        sumber: "transfer_barang",
        tokoId: item.tokoAsalId,
        tokoNama: item.tokoAsalNama,
        barangId: item.barangId,
        kodeBarang: item.kodeBarang,
        namaBarang: item.namaBarang,
        qty: item.qty,
        stokSebelum: item.stokAsalSebelum,
        stokSesudah: item.stokAsalSesudah,
        keterangan: `Transfer keluar ke ${item.tokoTujuanNama}${item.catatan ? ` · ${item.catatan}` : ""}`,
        createdAtMs: toMillis(item.sentAt),
        createdBy: item.sentBy || "",
        pengirimUid: item.sentBy || "",
        pengirimNama: item.sentByNama || "",
        pengirimEmail: item.sentByEmail || "",
        penerimaUid: "",
        penerimaNama: "",
        penerimaEmail: "",
      })
    }

    if (item.status === "DITERIMA" && toMillis(item.receivedAt)) {
      transferMutasiList.push({
        id: `transfer-masuk-${item.id}`,
        transaksiId: item.id,
        nomorTransaksi: item.kodeTransfer,
        tipe: "masuk",
        sumber: "transfer_barang",
        tokoId: item.tokoTujuanId,
        tokoNama: item.tokoTujuanNama,
        barangId: item.barangTujuanId || item.barangId,
        kodeBarang: item.kodeBarang,
        namaBarang: item.namaBarang,
        qty: item.qty,
        stokSebelum: item.stokTujuanSebelum,
        stokSesudah: item.stokTujuanSesudah,
        keterangan: `Transfer diterima dari ${item.tokoAsalNama}${item.catatanPenerimaan ? ` · ${item.catatanPenerimaan}` : ""}`,
        createdAtMs: toMillis(item.receivedAt),
        createdBy: item.receivedBy || "",
        pengirimUid: item.sentBy || "",
        pengirimNama: item.sentByNama || "",
        pengirimEmail: item.sentByEmail || "",
        penerimaUid: item.receivedBy || "",
        penerimaNama: item.receivedByNama || "",
        penerimaEmail: item.receivedByEmail || "",
      })
    }
  }

  return transferMutasiList
}

function mergeUniqueMutasi(current: MutasiStok[], incoming: MutasiStok[]) {
  const map = new Map<string, MutasiStok>()

  for (const item of current) map.set(item.id, item)
  for (const item of incoming) map.set(item.id, item)

  return Array.from(map.values()).sort((a, b) => b.createdAtMs - a.createdAtMs)
}


export default function MutasiStokPage() {
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [data, setData] = useState<MutasiStok[]>([])
  const [tokoList, setTokoList] = useState<TokoOption[]>([])

  const [lastMutasiDoc, setLastMutasiDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [lastTransferDoc, setLastTransferDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [mutasiDone, setMutasiDone] = useState(false)
  const [transferDone, setTransferDone] = useState(false)
  const [fetchedLimit, setFetchedLimit] = useState(0)

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterTipe, setFilterTipe] = useState("")
  const [filterSumber, setFilterSumber] = useState("")
  const [filterTanggal, setFilterTanggal] = useState("")
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)

  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)

  const [selectedDetail, setSelectedDetail] = useState<MutasiStok | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setError(null)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const fetchData = async (targetLimit = itemsPerPage) => {
    const safeLimit = normalizeFetchLimit(targetLimit)

    setLoading(true)
    setError(null)
    setPage(1)

    try {
      const [mutasiSnap, tokoSnap, transferSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "mutasi_stok"),
            orderBy("createdAtMs", "desc"),
            limit(safeLimit)
          )
        ),
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
        getDocs(
          query(
            collection(db, "transfer_barang"),
            orderBy("createdAt", "desc"),
            limit(safeLimit)
          )
        ),
      ])

      const mutasiList = mutasiSnap.docs.map(mapMutasiDoc)
      const transferList = transferSnap.docs.map(mapTransferDoc)
      const transferMutasiList = transferToMutasiList(transferList)

      const merged = mergeUniqueMutasi(mutasiList, transferMutasiList)

      const tokoOptions: TokoOption[] = tokoSnap.docs
        .map((d) => {
          const x = d.data() as any
          return {
            id: d.id,
            nama: x?.nama || "",
          }
        })
        .filter((item) => item.nama)

      setData(merged)
      setTokoList(tokoOptions)
      setLastMutasiDoc(mutasiSnap.docs[mutasiSnap.docs.length - 1] || null)
      setLastTransferDoc(transferSnap.docs[transferSnap.docs.length - 1] || null)
      setMutasiDone(mutasiSnap.docs.length < safeLimit)
      setTransferDone(transferSnap.docs.length < safeLimit)
      setFetchedLimit(safeLimit)
    } catch (err) {
      console.error(err)
      setError("Gagal memuat mutasi stok")
      setData([])
      setTokoList([])
      setLastMutasiDoc(null)
      setLastTransferDoc(null)
      setMutasiDone(false)
      setTransferDone(false)
      setFetchedLimit(0)
    } finally {
      setLoading(false)
    }
  }

  const fetchMoreData = async (additionalLimit: number, targetLimit: number) => {
    const safeAdditional = Math.max(0, Math.min(additionalLimit, MAX_FETCH_LIMIT))
    const safeTarget = normalizeFetchLimit(targetLimit)

    if (safeAdditional <= 0 || fetchedLimit >= safeTarget) return

    setLoadingMore(true)
    setError(null)

    try {
      const mutasiPromise =
        mutasiDone || !lastMutasiDoc
          ? Promise.resolve(null)
          : getDocs(
              query(
                collection(db, "mutasi_stok"),
                orderBy("createdAtMs", "desc"),
                startAfter(lastMutasiDoc),
                limit(safeAdditional)
              )
            )

      const transferPromise =
        transferDone || !lastTransferDoc
          ? Promise.resolve(null)
          : getDocs(
              query(
                collection(db, "transfer_barang"),
                orderBy("createdAt", "desc"),
                startAfter(lastTransferDoc),
                limit(safeAdditional)
              )
            )

      const [mutasiSnap, transferSnap] = await Promise.all([mutasiPromise, transferPromise])

      const mutasiList = mutasiSnap?.docs.map(mapMutasiDoc) || []
      const transferList = transferSnap?.docs.map(mapTransferDoc) || []
      const transferMutasiList = transferToMutasiList(transferList)

      const incoming = mergeUniqueMutasi(mutasiList, transferMutasiList)

      setData((prev) => mergeUniqueMutasi(prev, incoming))

      if (mutasiSnap) {
        setLastMutasiDoc(mutasiSnap.docs[mutasiSnap.docs.length - 1] || lastMutasiDoc)
        setMutasiDone(mutasiSnap.docs.length < safeAdditional)
      }

      if (transferSnap) {
        setLastTransferDoc(transferSnap.docs[transferSnap.docs.length - 1] || lastTransferDoc)
        setTransferDone(transferSnap.docs.length < safeAdditional)
      }

      setFetchedLimit(safeTarget)
    } catch (err) {
      console.error(err)
      setError("Gagal mengambil data tambahan mutasi stok")
    } finally {
      setLoadingMore(false)
    }
  }

  const handleItemsPerPageChange = async (value: string) => {
    const nextLimit = normalizeFetchLimit(Number(value))

    setItemsPerPage(nextLimit)
    setPage(1)

    if (nextLimit > fetchedLimit) {
      await fetchMoreData(nextLimit - fetchedLimit, nextLimit)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) await fetchData()
      else setLoading(false)
    })
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sumberOptions = useMemo(() => {
    return Array.from(new Set(data.map((item) => item.sumber).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    )
  }, [data])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return data.filter((item) => {
      const matchSearch =
        !q ||
        item.namaBarang.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.nomorTransaksi?.toLowerCase().includes(q) ||
        item.keterangan?.toLowerCase().includes(q) ||
        String(item.pengirimNama || "").toLowerCase().includes(q) ||
        String(item.penerimaNama || "").toLowerCase().includes(q)

      const matchToko = !filterToko || item.tokoId === filterToko
      const matchTipe = !filterTipe || item.tipe === filterTipe
      const matchSumber = !filterSumber || item.sumber === filterSumber
      const matchTanggal =
        !filterTanggal || new Date(item.createdAtMs).toISOString().slice(0, 10) === filterTanggal

      return matchSearch && matchToko && matchTipe && matchSumber && matchTanggal
    })
  }, [data, search, filterToko, filterTipe, filterSumber, filterTanggal])

  const pagedData = filtered.slice(0, itemsPerPage)

  const totalMutasi = pagedData.length
  const totalKeluar = pagedData
    .filter((item) => item.tipe === "keluar")
    .reduce((acc, item) => acc + item.qty, 0)
  const totalMasuk = pagedData
    .filter((item) => item.tipe === "masuk")
    .reduce((acc, item) => acc + item.qty, 0)
  const totalBarangTerlibat = new Set(pagedData.map((item) => item.barangId)).size

  const statCardsLoading = loading || loadingMore

  const totalPages = 1
  const goPage = (targetPage: number) => setPage(Math.max(1, Math.min(totalPages, targetPage)))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const resetFilter = () => {
    setSearch("")
    setFilterToko("")
    setFilterTipe("")
    setFilterSumber("")
    setFilterTanggal("")
    setPage(1)
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
                <Boxes size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Mutasi Stok
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Pantau riwayat stok masuk, stok keluar, dan pergerakan transfer antar toko.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => fetchData()}
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
          {(successMsg || error) && (
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
                {successMsg || error}
              </p>
              {error ? (
                <button type="button" onClick={() => setError(null)} className="text-red-500">
                  <X size={14} strokeWidth={3} />
                </button>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <StatCard
            label="Total Mutasi"
            value={totalMutasi}
            icon={ClipboardList}
            tone="slate"
            loading={statCardsLoading}
          />
          <StatCard
            label="Stok Masuk"
            value={totalMasuk}
            icon={ArrowDownLeft}
            tone="sky"
            loading={statCardsLoading}
          />
          <StatCard
            label="Stok Keluar"
            value={totalKeluar}
            icon={ArrowUpRight}
            tone="rose"
            loading={statCardsLoading}
          />
          <StatCard
            label="Barang"
            value={totalBarangTerlibat}
            icon={Package}
            tone="blue"
            loading={statCardsLoading}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.06 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-800 sm:text-base">Filter Mutasi</h2>          
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fetchData()}
                disabled={loading}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 sm:hidden"
              >
                <RefreshCw size={15} strokeWidth={2.5} className={loading ? "animate-spin" : ""} />
              </button>

              <button
                type="button"
                onClick={() => setFilterMobileOpen((prev) => !prev)}
                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-[10px] font-black uppercase tracking-[0.08em] transition sm:hidden ${
                  filterMobileOpen
                    ? "border-sky-200 bg-sky-100 text-sky-700"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                <ListFilter size={14} strokeWidth={2.5} />
                Filter
              </button>
            </div>
          </div>

          <div className="mt-3 hidden sm:block">
            <FilterContent
              search={search}
              setSearch={setSearch}
              filterToko={filterToko}
              setFilterToko={setFilterToko}
              filterTipe={filterTipe}
              setFilterTipe={setFilterTipe}
              filterSumber={filterSumber}
              setFilterSumber={setFilterSumber}
              filterTanggal={filterTanggal}
              setFilterTanggal={setFilterTanggal}
              tokoList={tokoList}
              sumberOptions={sumberOptions}
              resetFilter={resetFilter}
              setPage={setPage}
            />
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
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <FilterContent
                    search={search}
                    setSearch={setSearch}
                    filterToko={filterToko}
                    setFilterToko={setFilterToko}
                    filterTipe={filterTipe}
                    setFilterTipe={setFilterTipe}
                    filterSumber={filterSumber}
                    setFilterSumber={setFilterSumber}
                    filterTanggal={filterTanggal}
                    setFilterTanggal={setFilterTanggal}
                    tokoList={tokoList}
                    sumberOptions={sumberOptions}
                    resetFilter={resetFilter}
                    setPage={setPage}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-800 sm:text-base">Riwayat Mutasi</h2>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Data tampil {pagedData.length} mutasi stok · maksimal 500
              </p>
            </div>

            <div className="w-full sm:w-40">
              <FilterSelect
                label="Tampil"
                value={itemsPerPage}
                onChange={handleItemsPerPageChange}
              >
                {ITEMS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </FilterSelect>

              {loadingMore ? (
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-sky-500">
                  Mengambil tambahan...
                </p>
              ) : null}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
                />
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Memuat data mutasi...
                </p>
              </div>
            </div>
          ) : pagedData.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200">
                <Boxes size={28} className="text-slate-300" strokeWidth={2} />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data mutasi stok
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pagedData.map((item, idx) => {
                const meta = getTipeMeta(item.tipe)
                const TypeIcon = meta.icon

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: idx * 0.02 }}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-black ${meta.className}`}
                          >
                            <TypeIcon size={12} strokeWidth={2.5} />
                            {meta.label}
                          </span>

                          {item.nomorTransaksi ? (
                            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">
                              {item.nomorTransaksi}
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-3 text-sm font-black text-slate-800">
                          {item.kodeBarang} · {item.namaBarang}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          {item.tokoNama || "-"} • Qty {item.qty} • Stok {item.stokSebelum} → {item.stokSesudah}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-400">
                          {formatTanggal(item.createdAtMs)}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-sky-700">
                          {item.sumber || "-"}
                        </p>

                        {(item.pengirimNama || item.penerimaNama) && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.pengirimNama ? (
                              <span className="rounded-lg bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200">
                                Pengirim: {item.pengirimNama}
                              </span>
                            ) : null}
                            {item.penerimaNama ? (
                              <span className="rounded-lg bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-sky-100">
                                Penerima: {item.penerimaNama}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>

                      <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[260px]">
                        <div className="flex min-h-[56px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Stok
                          </p>
                          <p className="text-sm font-black text-slate-800">
                            {item.stokSebelum} → {item.stokSesudah}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedDetail(item)}
                          className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          <Eye size={13} strokeWidth={2.7} />
                          Detail
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex justify-center gap-1.5">
              <button
                type="button"
                onClick={() => goPage(page - 1)}
                disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - page) <= 2
                )
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (
                    idx > 0 &&
                    typeof arr[idx - 1] === "number" &&
                    p - (arr[idx - 1] as number) > 1
                  ) {
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
        </motion.div>

        <DetailModal selectedDetail={selectedDetail} setSelectedDetail={setSelectedDetail} />
      </main>
    </div>
  )
}

function FilterContent({
  search,
  setSearch,
  filterToko,
  setFilterToko,
  filterTipe,
  setFilterTipe,
  filterSumber,
  setFilterSumber,
  filterTanggal,
  setFilterTanggal,
  tokoList,
  sumberOptions,
  resetFilter,
  setPage,
}: {
  search: string
  setSearch: (value: string) => void
  filterToko: string
  setFilterToko: (value: string) => void
  filterTipe: string
  setFilterTipe: (value: string) => void
  filterSumber: string
  setFilterSumber: (value: string) => void
  filterTanggal: string
  setFilterTanggal: (value: string) => void
  tokoList: TokoOption[]
  sumberOptions: string[]
  resetFilter: () => void
  setPage: (value: number) => void
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <FieldBox label="Cari">
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
              placeholder="Barang, kode, toko, transaksi, pengirim..."
              className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
            />
          </div>
        </FieldBox>

        <FilterSelect
          label="Toko"
          value={filterToko}
          onChange={(value) => {
            setFilterToko(value)
            setPage(1)
          }}
          icon={Store}
        >
          <option value="">Semua toko</option>
          {tokoList.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nama}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Tipe"
          value={filterTipe}
          onChange={(value) => {
            setFilterTipe(value)
            setPage(1)
          }}
          icon={Database}
        >
          <option value="">Semua tipe</option>
          <option value="masuk">Masuk</option>
          <option value="keluar">Keluar</option>
        </FilterSelect>

        <FilterSelect
          label="Sumber"
          value={filterSumber}
          onChange={(value) => {
            setFilterSumber(value)
            setPage(1)
          }}
          icon={Truck}
        >
          <option value="">Semua sumber</option>
          {sumberOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </FilterSelect>

        <FieldBox label="Tanggal">
          <div className="relative">
            <CalendarDays
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              strokeWidth={2.5}
            />
            <input
              type="date"
              value={filterTanggal}
              onChange={(e) => {
                setFilterTanggal(e.target.value)
                setPage(1)
              }}
              className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all hover:border-sky-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
            />
          </div>
        </FieldBox>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={resetFilter}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-all hover:bg-slate-50"
        >
          Reset Semua Filter
        </button>
      </div>
    </>
  )
}

function DetailModal({
  selectedDetail,
  setSelectedDetail,
}: {
  selectedDetail: MutasiStok | null
  setSelectedDetail: (value: MutasiStok | null) => void
}) {
  return (
    <AnimatePresence>
      {selectedDetail ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedDetail(null)
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
                  Detail Mutasi Stok
                </p>
                <h2 className="truncate text-base font-black text-slate-800">
                  {selectedDetail.namaBarang || "Mutasi Barang"}
                </h2>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                  {formatTanggal(selectedDetail.createdAtMs)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
              >
                <X size={17} strokeWidth={2.5} />
              </button>
            </div>

            <div className="max-h-[calc(88vh-78px)] overflow-y-auto p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <DetailMiniCard
                  label="Barang"
                  value={selectedDetail.namaBarang || "-"}
                  subValue={selectedDetail.kodeBarang || "-"}
                />
                <DetailMiniCard label="Toko" value={selectedDetail.tokoNama || "-"} />
                <DetailMiniCard
                  label="Tipe"
                  value={getTipeMeta(selectedDetail.tipe).label}
                  subValue={selectedDetail.sumber || "-"}
                />
                <DetailMiniCard
                  label="Qty"
                  value={String(selectedDetail.qty || 0)}
                  subValue={`Stok ${selectedDetail.stokSebelum} → ${selectedDetail.stokSesudah}`}
                />
                <DetailMiniCard
                  label="Nomor Referensi"
                  value={selectedDetail.nomorTransaksi || "-"}
                  subValue={selectedDetail.transaksiId || "-"}
                />
                <DetailMiniCard
                  label="Dibuat Oleh"
                  value={selectedDetail.createdBy || "-"}
                />

                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:col-span-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Keterangan
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">
                    {selectedDetail.keterangan || "-"}
                  </p>
                </div>

                <ActorBlock
                  title="Pengirim"
                  nama={selectedDetail.pengirimNama}
                  email={selectedDetail.pengirimEmail}
                />
                <ActorBlock
                  title="Penerima"
                  nama={selectedDetail.penerimaNama}
                  email={selectedDetail.penerimaEmail}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
