/* 
  Halaman admin riwayat transaksi.
  Menampilkan daftar transaksi dengan pagination Firestore,
  filter toko, metode, nama kasir, tanggal awal-akhir, serta detail transaksi.
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
  limit,
  startAfter,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore"
import {
  Receipt,
  Search,
  Store,
  Wallet,
  RefreshCw,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Boxes,
  ChevronDown,
  ShoppingCart,
  BadgeDollarSign,
  Percent,
  CircleDollarSign,
  Eye,
  X,
  User2,
  Mail,
  Filter,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type TransaksiItem = {
  barangId: string
  kodeBarang: string
  nama: string
  kategoriNama: string
  merk: string
  satuan: string
  qty: number
  hargaModal: number
  hargaAsli: number
  hargaSetelahDiskon: number
  subtotalAsli: number
  subtotalFinal: number
  totalDiskon: number
  diskonId?: string
  diskonNama?: string
  diskonTipe?: string
  diskonNilai?: number
}

type Transaksi = {
  id: string
  nomorTransaksi: string
  tokoId: string
  tokoNama: string
  metodePembayaranId: string
  metodePembayaranNama: string
  metodePembayaranTipe: string
  metodePembayaranProvider?: string
  biayaAdminPersen: number
  biayaAdminNominal: number
  subtotal: number
  totalDiskon: number
  totalSetelahDiskon: number
  grandTotal: number
  totalModal: number
  estimasiLabaKotor: number
  uangBayar: number
  kembalian: number
  kurangBayar: number
  totalItem: number
  totalJenisBarang: number
  status: string
  catatan?: string
  items: TransaksiItem[]
  createdAtMs: number
  updatedAtMs?: number
  createdBy?: string
  kasirUid?: string
  kasirNama?: string
  kasirEmail?: string
}

type TokoOption = {
  id: string
  nama: string
}

const PAGE_SIZE = 20

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatTanggal(value?: number) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function getStartOfDayMs(dateString: string) {
  if (!dateString) return null
  const date = new Date(`${dateString}T00:00:00`)
  return date.getTime()
}

function getEndOfDayMs(dateString: string) {
  if (!dateString) return null
  const date = new Date(`${dateString}T23:59:59.999`)
  return date.getTime()
}

function InfoCard({
  icon: Icon,
  label,
  value,
  subValue,
}: {
  icon: any
  label: string
  value: string
  subValue?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-white shadow-sm">
          <Icon size={18} strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
            {label}
          </p>
          <p className="mt-1 truncate text-lg font-black text-slate-800">{value}</p>
          {subValue ? (
            <p className="mt-1 text-[11px] font-semibold text-slate-500">{subValue}</p>
          ) : null}
        </div>
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
  value: string
  onChange: (value: string) => void
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
        {Icon ? (
          <Icon
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2}
          />
        ) : null}
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

export default function RiwayatTransaksiPage() {
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [data, setData] = useState<Transaksi[]>([])
  const [tokoList, setTokoList] = useState<TokoOption[]>([])
  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterMetode, setFilterMetode] = useState("")
  const [filterKasir, setFilterKasir] = useState("")
  const [filterTanggalAwal, setFilterTanggalAwal] = useState("")
  const [filterTanggalAkhir, setFilterTanggalAkhir] = useState("")
  const [selectedDetail, setSelectedDetail] = useState<Transaksi | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)

  const tanggalAwalMs = useMemo(
    () => getStartOfDayMs(filterTanggalAwal),
    [filterTanggalAwal]
  )

  const tanggalAkhirMs = useMemo(
    () => getEndOfDayMs(filterTanggalAkhir),
    [filterTanggalAkhir]
  )

  const buildTransaksiQuery = (
    cursor?: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    const constraints: QueryConstraint[] = []

    if (filterToko) {
      constraints.push(where("tokoId", "==", filterToko))
    }

    if (filterMetode) {
      constraints.push(where("metodePembayaranNama", "==", filterMetode))
    }

    if (tanggalAwalMs !== null) {
      constraints.push(where("createdAtMs", ">=", tanggalAwalMs))
    }

    if (tanggalAkhirMs !== null) {
      constraints.push(where("createdAtMs", "<=", tanggalAkhirMs))
    }

    constraints.push(orderBy("createdAtMs", "desc"))

    if (cursor) {
      constraints.push(startAfter(cursor))
    }

    constraints.push(limit(PAGE_SIZE))

    return query(collection(db, "transaksi"), ...constraints)
  }

  const mapTransaksiDoc = (d: QueryDocumentSnapshot<DocumentData>): Transaksi => {
    const x = d.data() as any
    return {
      id: d.id,
      nomorTransaksi: x?.nomorTransaksi || "",
      tokoId: x?.tokoId || "",
      tokoNama: x?.tokoNama || "",
      metodePembayaranId: x?.metodePembayaranId || "",
      metodePembayaranNama: x?.metodePembayaranNama || "",
      metodePembayaranTipe: x?.metodePembayaranTipe || "",
      metodePembayaranProvider: x?.metodePembayaranProvider || "",
      biayaAdminPersen: Number(x?.biayaAdminPersen || 0),
      biayaAdminNominal: Number(x?.biayaAdminNominal || 0),
      subtotal: Number(x?.subtotal || 0),
      totalDiskon: Number(x?.totalDiskon || 0),
      totalSetelahDiskon: Number(x?.totalSetelahDiskon || 0),
      grandTotal: Number(x?.grandTotal || 0),
      totalModal: Number(x?.totalModal || 0),
      estimasiLabaKotor: Number(x?.estimasiLabaKotor || 0),
      uangBayar: Number(x?.uangBayar || 0),
      kembalian: Number(x?.kembalian || 0),
      kurangBayar: Number(x?.kurangBayar || 0),
      totalItem: Number(x?.totalItem || 0),
      totalJenisBarang: Number(x?.totalJenisBarang || 0),
      status: x?.status || "selesai",
      catatan: x?.catatan || "",
      items: Array.isArray(x?.items) ? x.items : [],
      createdAtMs: Number(x?.createdAtMs || 0),
      updatedAtMs: x?.updatedAtMs ? Number(x.updatedAtMs) : undefined,
      createdBy: x?.createdBy || "",
      kasirUid: x?.kasirUid || "",
      kasirNama: x?.kasirNama || "",
      kasirEmail: x?.kasirEmail || "",
    }
  }

  const fetchToko = async () => {
    const tokoSnap = await getDocs(query(collection(db, "toko"), orderBy("nama")))
    const tokoOptions: TokoOption[] = tokoSnap.docs
      .map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: x?.nama || "",
        }
      })
      .filter((item) => item.nama)

    setTokoList(tokoOptions)
  }

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const [transaksiSnap] = await Promise.all([getDocs(buildTransaksiQuery(null)), fetchToko()])

      const transaksiList = transaksiSnap.docs.map(mapTransaksiDoc)
      setData(transaksiList)
      setLastDoc(
        transaksiSnap.docs.length > 0 ? transaksiSnap.docs[transaksiSnap.docs.length - 1] : null
      )
      setHasMore(transaksiSnap.docs.length === PAGE_SIZE)
    } catch (err) {
      console.error(err)
      setError("Gagal memuat riwayat transaksi")
      setData([])
      setHasMore(false)
      setLastDoc(null)
      setTokoList([])
    } finally {
      setLoading(false)
    }
  }

  const fetchMore = async () => {
    if (!hasMore || !lastDoc || loadingMore) return

    setLoadingMore(true)
    setError(null)

    try {
      const transaksiSnap = await getDocs(buildTransaksiQuery(lastDoc))
      const moreList = transaksiSnap.docs.map(mapTransaksiDoc)

      setData((prev) => [...prev, ...moreList])
      setLastDoc(
        transaksiSnap.docs.length > 0 ? transaksiSnap.docs[transaksiSnap.docs.length - 1] : lastDoc
      )
      setHasMore(transaksiSnap.docs.length === PAGE_SIZE)
    } catch (err) {
      console.error(err)
      setError("Gagal memuat halaman berikutnya")
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) {
        await fetchData()
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) {
        await fetchData()
      }
    })
    return () => unsub()
  }, [filterToko, filterMetode, filterTanggalAwal, filterTanggalAkhir])

  const metodeOptions = useMemo(() => {
    return Array.from(
      new Set(data.map((item) => item.metodePembayaranNama).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b))
  }, [data])

  const kasirOptions = useMemo(() => {
  return Array.from(
    new Set(data.map((item) => String(item.kasirNama || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b))
}, [data])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const qKasir = filterKasir.toLowerCase().trim()

    return data.filter((item) => {
      const matchSearch =
        !q ||
        item.nomorTransaksi.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.metodePembayaranNama.toLowerCase().includes(q) ||
        String(item.kasirNama || "").toLowerCase().includes(q) ||
        item.items.some(
          (x) =>
            x.nama?.toLowerCase().includes(q) ||
            x.kodeBarang?.toLowerCase().includes(q)
        )

      const matchKasir =
        !qKasir || String(item.kasirNama || "").toLowerCase().includes(qKasir)

      return matchSearch && matchKasir
    })
  }, [data, search, filterKasir])

  const totalTransaksi = filtered.length
  const totalOmzet = filtered.reduce((acc, item) => acc + item.grandTotal, 0)
  const totalDiskon = filtered.reduce((acc, item) => acc + item.totalDiskon, 0)
  const totalLabaKotor = filtered.reduce(
    (acc, item) => acc + item.estimasiLabaKotor,
    0
  )

  return (
    <div className="space-y-4 text-slate-900 sm:space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50 sm:h-14 sm:w-14">
              <Receipt size={22} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
            </div>

            <div className="min-w-0 self-center sm:self-auto">
              <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                Riwayat Transaksi
              </h1>
              <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
                Daftar transaksi kasir tersimpan
              </p>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchData}
            disabled={loading}
            className="flex h-8 items-center justify-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50 sm:self-auto"
          >
            <motion.span
              animate={loading ? { rotate: 360 } : {}}
              transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}
            >
              <RefreshCw size={14} strokeWidth={2.5} />
            </motion.span>
            <span className="sm:hidden">Refresh</span>
            <span className="hidden sm:inline">Refresh</span>
          </motion.button>
        </div>
      </motion.div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
          <AlertCircle size={14} className="text-red-500" strokeWidth={2.5} />
          <p className="text-[11px] font-bold text-red-600">{error}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <InfoCard
          icon={ShoppingCart}
          label="Total Transaksi"
          value={String(totalTransaksi)}
          subValue="Data terfilter"
        />
        <InfoCard
          icon={CircleDollarSign}
          label="Omzet"
          value={formatRupiah(totalOmzet)}
          subValue="Total grand total"
        />
        <InfoCard
          icon={Percent}
          label="Diskon"
          value={formatRupiah(totalDiskon)}
          subValue="Akumulasi diskon"
        />
        <InfoCard
          icon={BadgeDollarSign}
          label="Laba Kotor"
          value={formatRupiah(totalLabaKotor)}
          subValue="Estimasi dari transaksi"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm"
      >
        <div className="mb-3 flex items-center gap-2">
          <Filter size={14} className="text-blue-600" strokeWidth={2.5} />
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
            Filter Riwayat
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div>
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Cari
            </label>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nomor, toko, metode, barang..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          <FilterSelect
  label="Nama Kasir"
  value={filterKasir}
  onChange={setFilterKasir}
  icon={User2}
>
  <option value="">Semua Kasir</option>
  {kasirOptions.map((item) => (
    <option key={item} value={item}>
      {item}
    </option>
  ))}
</FilterSelect>

          <FilterSelect
            label="Toko"
            value={filterToko}
            onChange={setFilterToko}
            icon={Store}
          >
            <option value="">Semua Toko</option>
            {tokoList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            label="Metode"
            value={filterMetode}
            onChange={setFilterMetode}
            icon={Wallet}
          >
            <option value="">Semua Metode</option>
            {metodeOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </FilterSelect>

          <div>
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Tanggal Awal
            </label>
            <div className="relative">
              <CalendarDays
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                type="date"
                value={filterTanggalAwal}
                onChange={(e) => setFilterTanggalAwal(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Tanggal Akhir
            </label>
            <div className="relative">
              <CalendarDays
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                type="date"
                value={filterTanggalAkhir}
                onChange={(e) => setFilterTanggalAkhir(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>
        </div>
      </motion.div>

      {loading ? (
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
      ) : filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Boxes size={28} className="text-slate-300" strokeWidth={2} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Belum ada data transaksi
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-slate-800">{item.nomorTransaksi}</p>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                      {item.status || "selesai"}
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    {formatTanggal(item.createdAtMs)}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                      {item.tokoNama || "-"}
                    </span>
                    <span className="rounded-lg bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700">
                      {item.metodePembayaranNama || "-"}
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      {item.totalItem} item
                    </span>
                    <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      {item.kasirNama || "Tanpa Kasir"}
                    </span>
                  </div>
                </div>

              <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[260px]">
  <div className="flex h-full min-h-[56px] flex-col justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
      Grand Total
    </p>
    <p className="text-sm font-black text-slate-800">
      {formatRupiah(item.grandTotal)}
    </p>
  </div>

  <button
    onClick={() => setSelectedDetail(item)}
    className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm transition-all hover:opacity-95"
  >
    <Eye size={13} strokeWidth={2.7} />
    Detail
  </button>
</div>
              </div>
            </motion.div>
          ))}

          <div className="pt-2">
            {hasMore ? (
              <button
                type="button"
                onClick={fetchMore}
                disabled={loadingMore}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" strokeWidth={2.5} />
                    Memuat...
                  </>
                ) : (
                  <>
                    <RefreshCw size={15} strokeWidth={2.5} />
                    Muat Lagi
                  </>
                )}
              </button>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs font-bold text-slate-400">
                Semua data pada hasil query sudah dimuat
              </div>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedDetail ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            >
              <div className="flex items-start justify-between border-b border-slate-200 p-5">
                <div>
                  <h2 className="text-lg font-black text-slate-800">
                    {selectedDetail.nomorTransaksi}
                  </h2>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    {formatTanggal(selectedDetail.createdAtMs)}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedDetail(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>

              <div className="max-h-[calc(90vh-82px)] overflow-y-auto p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <InfoCard
                    icon={Store}
                    label="Toko"
                    value={selectedDetail.tokoNama || "-"}
                  />
                  <InfoCard
                    icon={Wallet}
                    label="Metode"
                    value={selectedDetail.metodePembayaranNama || "-"}
                    subValue={selectedDetail.metodePembayaranProvider || ""}
                  />
                  <InfoCard
                    icon={CircleDollarSign}
                    label="Total"
                    value={formatRupiah(selectedDetail.grandTotal)}
                  />
                  <InfoCard
                    icon={BadgeDollarSign}
                    label="Laba Kotor"
                    value={formatRupiah(selectedDetail.estimasiLabaKotor)}
                  />
                </div>

                <div className="mt-5 rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-600">
                    Kasir Konfirmasi
                  </p>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                      <User2 size={15} strokeWidth={2.5} />
                      {selectedDetail.kasirNama || "Tanpa Nama"}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <Mail size={14} strokeWidth={2.5} />
                      {selectedDetail.kasirEmail || "-"}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                    Item Transaksi
                  </p>

                  <div className="mt-4 space-y-3">
                    {selectedDetail.items?.map((detail, idx) => (
                      <div
                        key={`${detail.barangId}-${idx}`}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-black text-slate-800">{detail.nama}</p>
                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              {detail.kodeBarang} · {detail.kategoriNama || "-"}
                            </p>
                          </div>

                          <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              Qty
                            </p>
                            <p className="text-sm font-black text-slate-800">{detail.qty}</p>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              Harga Asli
                            </p>
                            <p className="text-sm font-black text-slate-800">
                              {formatRupiah(detail.hargaAsli)}
                            </p>
                          </div>

                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              Harga Final
                            </p>
                            <p className="text-sm font-black text-emerald-600">
                              {formatRupiah(detail.hargaSetelahDiskon)}
                            </p>
                          </div>

                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              Diskon
                            </p>
                            <p className="text-sm font-black text-slate-800">
                              {formatRupiah(detail.totalDiskon)}
                            </p>
                          </div>

                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                              Subtotal
                            </p>
                            <p className="text-sm font-black text-slate-800">
                              {formatRupiah(detail.subtotalFinal)}
                            </p>
                          </div>
                        </div>

                        {detail.diskonNama ? (
                          <div className="mt-3 inline-flex rounded-lg bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                            {detail.diskonNama}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Ringkasan Pembayaran
                    </p>

                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-500">Subtotal</span>
                        <span className="font-black text-slate-800">
                          {formatRupiah(selectedDetail.subtotal)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-500">Diskon</span>
                        <span className="font-black text-emerald-600">
                          - {formatRupiah(selectedDetail.totalDiskon)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-500">Biaya Admin</span>
                        <span className="font-black text-slate-800">
                          {formatRupiah(selectedDetail.biayaAdminNominal)}
                        </span>
                      </div>
                      <div className="border-t border-dashed border-slate-200 pt-3">
                        <div className="flex items-center justify-between">
                          <span className="font-black uppercase tracking-wide text-slate-500">
                            Grand Total
                          </span>
                          <span className="text-lg font-black text-slate-900">
                            {formatRupiah(selectedDetail.grandTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Pembayaran Pelanggan
                    </p>

                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-500">Uang Bayar</span>
                        <span className="font-black text-slate-800">
                          {formatRupiah(selectedDetail.uangBayar)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-500">Kembalian</span>
                        <span className="font-black text-emerald-600">
                          {formatRupiah(selectedDetail.kembalian)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-500">Catatan</span>
                        <span className="max-w-[60%] text-right font-black text-slate-800">
                          {selectedDetail.catatan || "-"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}