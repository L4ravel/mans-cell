/* 
  Halaman admin mutasi stok.
  Menampilkan riwayat mutasi stok masuk/keluar dari koleksi mutasi_stok
  dan transfer_barang, termasuk barang keluar dari toko asal,
  barang diterima toko tujuan, serta nama pengirim/penerima.
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
  Truck,
  User2,
  Mail,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

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
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
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

export default function MutasiStokPage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<MutasiStok[]>([])
  const [tokoList, setTokoList] = useState<TokoOption[]>([])
  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterTipe, setFilterTipe] = useState("")
  const [filterSumber, setFilterSumber] = useState("")
  const [filterTanggal, setFilterTanggal] = useState("")
  const [selectedDetail, setSelectedDetail] = useState<MutasiStok | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const [mutasiSnap, tokoSnap, transferSnap] = await Promise.all([
        getDocs(query(collection(db, "mutasi_stok"), orderBy("createdAtMs", "desc"))),
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
        getDocs(query(collection(db, "transfer_barang"), orderBy("createdAt", "desc"))),
      ])

      const mutasiList: MutasiStok[] = mutasiSnap.docs.map((d) => {
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
      })

      const transferList: TransferBarang[] = transferSnap.docs.map((d) => {
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
      })

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

      const merged = [...mutasiList, ...transferMutasiList].sort(
        (a, b) => b.createdAtMs - a.createdAtMs
      )

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
        !filterTanggal ||
        new Date(item.createdAtMs).toISOString().slice(0, 10) === filterTanggal

      return matchSearch && matchToko && matchTipe && matchSumber && matchTanggal
    })
  }, [data, search, filterToko, filterTipe, filterSumber, filterTanggal])

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                placeholder="Barang, kode, toko, transaksi, pengirim..."
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

          <FilterSelect
            label="Sumber"
            value={filterSumber}
            onChange={setFilterSumber}
            icon={Truck}
          >
            <option value="">Semua Sumber</option>
            {sumberOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
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
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3 py-16"
        >
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

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.nomorTransaksi ? (
                        <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                          {item.nomorTransaksi}
                        </span>
                      ) : null}
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        Qty: {item.qty}
                      </span>
                      <span className="rounded-lg bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700">
                        {item.sumber || "-"}
                      </span>
                    </div>

                    {item.pengirimNama ? (
                      <p className="mt-2 text-[11px] font-semibold text-cyan-700">
                        Pengirim: {item.pengirimNama}
                      </p>
                    ) : null}

                    {item.penerimaNama ? (
                      <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                        Penerima: {item.penerimaNama}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[260px]">
                    <div className="flex min-h-[56px] flex-col justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Stok
                      </p>
                      <p className="text-sm font-black text-slate-800">
                        {item.stokSebelum} → {item.stokSesudah}
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
              className="w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
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
                        Nomor Referensi
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

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
    </div>
  )
}