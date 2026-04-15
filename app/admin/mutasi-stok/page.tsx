/* 
  Halaman admin mutasi stok.
  File ini menampilkan riwayat mutasi stok masuk/keluar, filter data,
  dan ringkasan perubahan stok dari koleksi mutasi_stok.
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, getDocs, orderBy, query } from "firebase/firestore"
import {
  Boxes,
  Search,
  Store,
  RefreshCw,
  Package,
  CalendarDays,
  AlertCircle,
  ChevronDown,
  ArrowUpRight,
  ArrowDownLeft,
  Database,
  Eye,
  X,
  ClipboardList,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type MutasiStok = {
  id: string
  transaksiId?: string
  nomorTransaksi?: string
  tipe: string
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
}

type TokoOption = {
  id: string
  nama: string
}

function formatTanggal(value?: number) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
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

export default function MutasiStokPage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<MutasiStok[]>([])
  const [tokoList, setTokoList] = useState<TokoOption[]>([])
  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterTipe, setFilterTipe] = useState("")
  const [filterTanggal, setFilterTanggal] = useState("")
  const [selectedDetail, setSelectedDetail] = useState<MutasiStok | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const [mutasiSnap, tokoSnap] = await Promise.all([
        getDocs(query(collection(db, "mutasi_stok"), orderBy("createdAtMs", "desc"))),
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
      ])

      const mutasiList: MutasiStok[] = mutasiSnap.docs.map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          transaksiId: x?.transaksiId || "",
          nomorTransaksi: x?.nomorTransaksi || "",
          tipe: x?.tipe || "",
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
        }
      })

      const tokoOptions: TokoOption[] = tokoSnap.docs
        .map((d) => {
          const x = d.data() as any
          return {
            id: d.id,
            nama: x?.nama || "",
          }
        })
        .filter((item) => item.nama)

      setData(mutasiList)
      setTokoList(tokoOptions)
    } catch (err) {
      console.error(err)
      setError("Gagal memuat mutasi stok")
      setData([])
      setTokoList([])
    } finally {
      setLoading(false)
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return data.filter((item) => {
      const matchSearch =
        !q ||
        item.namaBarang.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.nomorTransaksi?.toLowerCase().includes(q) ||
        item.keterangan?.toLowerCase().includes(q)

      const matchToko = !filterToko || item.tokoId === filterToko
      const matchTipe = !filterTipe || item.tipe === filterTipe

      const matchTanggal =
        !filterTanggal ||
        new Date(item.createdAtMs).toISOString().slice(0, 10) === filterTanggal

      return matchSearch && matchToko && matchTipe && matchTanggal
    })
  }, [data, search, filterToko, filterTipe, filterTanggal])

  const totalMutasi = filtered.length
  const totalKeluar = filtered
    .filter((item) => item.tipe === "keluar")
    .reduce((acc, item) => acc + item.qty, 0)

  const totalMasuk = filtered
    .filter((item) => item.tipe === "masuk")
    .reduce((acc, item) => acc + item.qty, 0)

  const totalBarangTerlibat = new Set(filtered.map((item) => item.barangId)).size

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
      <Boxes size={22} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
    </div>

    <div className="min-w-0 self-center sm:self-auto">
      <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
        Mutasi Stok
      </h1>
      <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
        Riwayat pergerakan stok barang
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
          icon={ClipboardList}
          label="Total Mutasi"
          value={String(totalMutasi)}
          subValue="Data terfilter"
        />
        <InfoCard
          icon={ArrowDownLeft}
          label="Stok Masuk"
          value={String(totalMasuk)}
          subValue="Qty masuk"
        />
        <InfoCard
          icon={ArrowUpRight}
          label="Stok Keluar"
          value={String(totalKeluar)}
          subValue="Qty keluar"
        />
        <InfoCard
          icon={Package}
          label="Barang Terlibat"
          value={String(totalBarangTerlibat)}
          subValue="Jumlah item unik"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                placeholder="Barang, kode, toko, transaksi..."
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

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
            label="Tipe"
            value={filterTipe}
            onChange={setFilterTipe}
            icon={Database}
          >
            <option value="">Semua Tipe</option>
            <option value="masuk">Masuk</option>
            <option value="keluar">Keluar</option>
          </FilterSelect>

          <div>
            <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
              Tanggal
            </label>
            <div className="relative">
              <CalendarDays
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                type="date"
                value={filterTanggal}
                onChange={(e) => setFilterTanggal(e.target.value)}
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
            Belum ada data mutasi stok
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item, idx) => {
            const isKeluar = item.tipe === "keluar"

            return (
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
                      <p className="text-sm font-black text-slate-800">{item.namaBarang}</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                          isKeluar
                            ? "bg-red-100 text-red-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {item.tipe || "-"}
                      </span>
                    </div>

                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      {item.kodeBarang} · {item.tokoNama} · {formatTanggal(item.createdAtMs)}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.nomorTransaksi ? (
                        <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                          {item.nomorTransaksi}
                        </span>
                      ) : null}
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        Qty: {item.qty}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Stok
                      </p>
                      <p className="text-sm font-black text-slate-800">
                        {item.stokSebelum} → {item.stokSesudah}
                      </p>
                    </div>

                    <button
                      onClick={() => setSelectedDetail(item)}
                      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white shadow-sm"
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
              className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            >
              <div className="flex items-start justify-between border-b border-slate-200 p-5">
                <div>
                  <h2 className="text-lg font-black text-slate-800">
                    Detail Mutasi Stok
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

              <div className="space-y-4 p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <InfoCard
                    icon={Package}
                    label="Barang"
                    value={selectedDetail.namaBarang}
                    subValue={selectedDetail.kodeBarang}
                  />
                  <InfoCard
                    icon={Store}
                    label="Toko"
                    value={selectedDetail.tokoNama || "-"}
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Tipe
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-800">
                        {selectedDetail.tipe || "-"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Sumber
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-800">
                        {selectedDetail.sumber || "-"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Qty
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-800">
                        {selectedDetail.qty}
                      </p>
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Nomor Transaksi
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-800">
                        {selectedDetail.nomorTransaksi || "-"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Stok Sebelum
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-800">
                        {selectedDetail.stokSebelum}
                      </p>
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Stok Sesudah
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-800">
                        {selectedDetail.stokSesudah}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      Keterangan
                    </p>
                    <p className="mt-1 text-sm font-black text-slate-800">
                      {selectedDetail.keterangan || "-"}
                    </p>
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