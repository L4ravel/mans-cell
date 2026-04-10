/* 
  Halaman admin transaksi kasir.
  File ini mengambil data toko, barang, diskon, dan metode pembayaran dari Firestore,
  lalu membuat UI kasir dengan keranjang, diskon aktif, total bayar, dan kembalian.
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore"
import {
  ShoppingCart,
  Cpu,
  Search,
  Store,
  Package,
  Percent,
  Wallet,
  Receipt,
  RefreshCw,
  Trash2,
  Plus,
  Minus,
  BadgeDollarSign,
  CircleDollarSign,
  ScanBarcode,
  CheckCircle2,
  AlertCircle,
  Boxes,
  Layers3,
  Tag,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type Toko = {
  id: string
  nama: string
  kode?: string
  pemilik?: string
  aktif?: boolean
}

type Barang = {
  id: string
  kodeBarang: string
  nama: string
  kategoriId: string
  kategoriNama: string
  tokoId: string
  tokoNama: string
  merk: string
  supplier: string
  satuan: string
  hargaModal: number
  hargaJual: number
  stok: number
  stokMinimum: number
  createdAt: number
  updatedAt?: number
}

type DiskonBarangRingkas = {
  id: string
  nama: string
  kodeBarang: string
  hargaJual: number
}

type Diskon = {
  id: string
  namaPromo: string
  tokoId: string
  tokoNama: string
  tipeDiskon: "persen" | "nominal"
  nilaiDiskon: number
  barangIds: string[]
  barangRingkas: DiskonBarangRingkas[]
  isActive: boolean
  createdAt: number
  updatedAt?: number
}

type MetodePembayaran = {
  id: string
  nama: string
  tipe: "Tunai" | "Non-Tunai"
  provider?: string
  biayaAdmin?: number
  nomorRekening?: string
  namaRekening?: string
  aktif: boolean
  createdAt: number
  createdBy: string
  updatedAt?: number
  updatedBy?: string
}

type CartItem = {
  barangId: string
  kodeBarang: string
  nama: string
  kategoriNama: string
  merk: string
  satuan: string
  stok: number
  qty: number
  hargaAsli: number
  hargaSetelahDiskon: number
  diskonId?: string
  diskonNama?: string
  diskonTipe?: "persen" | "nominal"
  diskonNilai?: number
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatPercent(value: number) {
  return `${Number(value || 0)}%`
}

function hitungHargaSetelahDiskon(
  hargaJual: number,
  tipeDiskon?: "persen" | "nominal",
  nilaiDiskon?: number
) {
  const harga = Number(hargaJual || 0)
  const nilai = Number(nilaiDiskon || 0)

  if (!tipeDiskon || nilai <= 0) return harga

  if (tipeDiskon === "persen") {
    const hasil = harga - harga * (nilai / 100)
    return Math.max(0, Math.round(hasil))
  }

  return Math.max(0, harga - nilai)
}

function getBestDiskonForBarang(barangId: string, diskonList: Diskon[]) {
  const cocok = diskonList.filter(
    (d) => d.isActive && Array.isArray(d.barangIds) && d.barangIds.includes(barangId)
  )

  if (!cocok.length) return null

  return cocok.sort((a, b) => {
    const aNilai = Number(a.nilaiDiskon || 0)
    const bNilai = Number(b.nilaiDiskon || 0)
    return bNilai - aNilai
  })[0]
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

function FieldLabel({
  icon: Icon,
  label,
}: {
  icon?: any
  label: string
}) {
  return (
    <label className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
      {Icon ? <Icon size={11} strokeWidth={2.5} /> : null}
      {label}
    </label>
  )
}

export default function TransaksiPage() {
  const [loading, setLoading] = useState(false)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [barangList, setBarangList] = useState<Barang[]>([])
  const [diskonList, setDiskonList] = useState<Diskon[]>([])
  const [metodeList, setMetodeList] = useState<MetodePembayaran[]>([])

  const [selectedTokoId, setSelectedTokoId] = useState("")
  const [selectedMetodeId, setSelectedMetodeId] = useState("")
  const [searchBarang, setSearchBarang] = useState("")
  const [uangBayar, setUangBayar] = useState("")
  const [catatan, setCatatan] = useState("")
  const [cart, setCart] = useState<CartItem[]>([])

  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchToko = async () => {
    const snap = await getDocs(query(collection(db, "toko"), orderBy("nama")))
    const list: Toko[] = snap.docs
      .map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: x?.nama || "",
          kode: x?.kode || "",
          pemilik: x?.pemilik || "",
          aktif: Boolean(x?.aktif),
        }
      })
      .filter((item) => item.nama && item.aktif !== false)

    setTokoList(list)
  }

  const fetchBarang = async () => {
    const snap = await getDocs(query(collection(db, "barang"), orderBy("nama")))
    const list: Barang[] = snap.docs
      .map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          kodeBarang: x?.kodeBarang || "",
          nama: x?.nama || "",
          kategoriId: x?.kategoriId || "",
          kategoriNama: x?.kategoriNama || "",
          tokoId: x?.tokoId || "",
          tokoNama: x?.tokoNama || "",
          merk: x?.merk || "",
          supplier: x?.supplier || "",
          satuan: x?.satuan || "",
          hargaModal: Number(x?.hargaModal || 0),
          hargaJual: Number(x?.hargaJual || 0),
          stok: Number(x?.stok || 0),
          stokMinimum: Number(x?.stokMinimum || 0),
          createdAt: Number(x?.createdAt || Date.now()),
          updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
        }
      })
      .filter((item) => item.nama && item.tokoId)

    setBarangList(list)
  }

  const fetchDiskon = async () => {
    const snap = await getDocs(query(collection(db, "diskon"), orderBy("namaPromo")))
    const list: Diskon[] = snap.docs.map((d) => {
      const x = d.data() as any
      return {
        id: d.id,
        namaPromo: x?.namaPromo || "",
        tokoId: x?.tokoId || "",
        tokoNama: x?.tokoNama || "",
        tipeDiskon: x?.tipeDiskon === "nominal" ? "nominal" : "persen",
        nilaiDiskon: Number(x?.nilaiDiskon || 0),
        barangIds: Array.isArray(x?.barangIds) ? x.barangIds : [],
        barangRingkas: Array.isArray(x?.barangRingkas)
          ? x.barangRingkas.map((item: any) => ({
              id: item?.id || "",
              nama: item?.nama || "",
              kodeBarang: item?.kodeBarang || "",
              hargaJual: Number(item?.hargaJual || 0),
            }))
          : [],
        isActive: Boolean(x?.isActive),
        createdAt: Number(x?.createdAt || Date.now()),
        updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
      }
    })

    setDiskonList(list)
  }

  const fetchMetode = async () => {
    const snap = await getDocs(
      query(collection(db, "metode_pembayaran"), orderBy("nama"))
    )

    const list: MetodePembayaran[] = snap.docs
      .map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: x?.nama || "",
          tipe: (x?.tipe === "Non-Tunai" ? "Non-Tunai" : "Tunai") as "Tunai" | "Non-Tunai",
          provider: x?.provider || "",
          biayaAdmin: Number(x?.biayaAdmin || 0),
          nomorRekening: x?.nomorRekening || "",
          namaRekening: x?.namaRekening || "",
          aktif: Boolean(x?.aktif),
          createdAt: Number(x?.createdAt || Date.now()),
          createdBy: x?.createdBy || "",
          updatedAt: x?.updatedAt ? Number(x.updatedAt) : undefined,
          updatedBy: x?.updatedBy || "",
        }
      })
      .filter((item) => item.nama && item.aktif)

    setMetodeList(list)
  }

  const fetchAll = async () => {
    setLoading(true)
    setError(null)

    try {
      await Promise.all([fetchToko(), fetchBarang(), fetchDiskon(), fetchMetode()])
    } catch (e) {
      console.error(e)
      setError("Gagal memuat data transaksi")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        await fetchAll()
      }
    })
    return () => unsub()
  }, [])

  const selectedToko = useMemo(
    () => tokoList.find((t) => t.id === selectedTokoId) || null,
    [tokoList, selectedTokoId]
  )

  const selectedMetode = useMemo(
    () => metodeList.find((m) => m.id === selectedMetodeId) || null,
    [metodeList, selectedMetodeId]
  )

  const barangByToko = useMemo(() => {
    const q = searchBarang.toLowerCase().trim()

    return barangList.filter((item) => {
      const sameToko = !selectedTokoId || item.tokoId === selectedTokoId
      const matchSearch =
        !q ||
        item.nama.toLowerCase().includes(q) ||
        item.kodeBarang.toLowerCase().includes(q) ||
        item.merk.toLowerCase().includes(q) ||
        item.kategoriNama.toLowerCase().includes(q)

      return sameToko && matchSearch
    })
  }, [barangList, selectedTokoId, searchBarang])

  const addToCart = (barang: Barang) => {
    if (!selectedTokoId) {
      setError("Pilih toko terlebih dahulu")
      return
    }

    if (barang.stok <= 0) {
      setError("Stok barang habis")
      return
    }

    setError(null)

    setCart((prev) => {
      const found = prev.find((item) => item.barangId === barang.id)

      const diskon = getBestDiskonForBarang(
        barang.id,
        diskonList.filter((d) => d.tokoId === barang.tokoId && d.isActive)
      )

      const hargaSetelahDiskon = hitungHargaSetelahDiskon(
        barang.hargaJual,
        diskon?.tipeDiskon,
        diskon?.nilaiDiskon
      )

      if (found) {
        const nextQty = found.qty + 1
        if (nextQty > barang.stok) return prev

        return prev.map((item) =>
          item.barangId === barang.id
            ? {
                ...item,
                qty: nextQty,
                stok: barang.stok,
                hargaAsli: barang.hargaJual,
                hargaSetelahDiskon,
                diskonId: diskon?.id,
                diskonNama: diskon?.namaPromo,
                diskonTipe: diskon?.tipeDiskon,
                diskonNilai: diskon?.nilaiDiskon,
              }
            : item
        )
      }

      return [
        ...prev,
        {
          barangId: barang.id,
          kodeBarang: barang.kodeBarang,
          nama: barang.nama,
          kategoriNama: barang.kategoriNama,
          merk: barang.merk,
          satuan: barang.satuan,
          stok: barang.stok,
          qty: 1,
          hargaAsli: barang.hargaJual,
          hargaSetelahDiskon,
          diskonId: diskon?.id,
          diskonNama: diskon?.namaPromo,
          diskonTipe: diskon?.tipeDiskon,
          diskonNilai: diskon?.nilaiDiskon,
        },
      ]
    })
  }

  const updateQty = (barangId: string, mode: "plus" | "minus") => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.barangId !== barangId) return item

          const nextQty = mode === "plus" ? item.qty + 1 : item.qty - 1

          if (nextQty > item.stok) return item
          return { ...item, qty: nextQty }
        })
        .filter((item) => item.qty > 0)
    )
  }

  const removeItem = (barangId: string) => {
    setCart((prev) => prev.filter((item) => item.barangId !== barangId))
  }

  const clearCart = () => {
    setCart([])
    setUangBayar("")
    setCatatan("")
    setSuccessMsg("Keranjang dikosongkan")
    setTimeout(() => setSuccessMsg(null), 2000)
  }

  const subtotal = useMemo(
    () => cart.reduce((acc, item) => acc + item.hargaAsli * item.qty, 0),
    [cart]
  )

  const totalSetelahDiskon = useMemo(
    () => cart.reduce((acc, item) => acc + item.hargaSetelahDiskon * item.qty, 0),
    [cart]
  )

  const totalDiskon = useMemo(
    () => subtotal - totalSetelahDiskon,
    [subtotal, totalSetelahDiskon]
  )

  const biayaAdminNominal = useMemo(() => {
    const persen = Number(selectedMetode?.biayaAdmin || 0)
    if (!selectedMetode || selectedMetode.tipe === "Tunai" || persen <= 0) return 0
    return Math.round(totalSetelahDiskon * (persen / 100))
  }, [selectedMetode, totalSetelahDiskon])

  const grandTotal = useMemo(
    () => totalSetelahDiskon + biayaAdminNominal,
    [totalSetelahDiskon, biayaAdminNominal]
  )

  const uangBayarNumber = Number(uangBayar || 0)
  const kembalian = Math.max(0, uangBayarNumber - grandTotal)
  const kurangBayar = Math.max(0, grandTotal - uangBayarNumber)

  const totalItem = useMemo(
    () => cart.reduce((acc, item) => acc + item.qty, 0),
    [cart]
  )

  const totalJenisBarang = cart.length

  const isBisaCheckout =
    !!selectedTokoId &&
    !!selectedMetodeId &&
    cart.length > 0 &&
    uangBayarNumber >= grandTotal

  const handleSimulasiBayar = () => {
    if (!selectedTokoId) {
      setError("Pilih toko terlebih dahulu")
      return
    }
    if (!selectedMetodeId) {
      setError("Pilih metode pembayaran terlebih dahulu")
      return
    }
    if (cart.length === 0) {
      setError("Keranjang masih kosong")
      return
    }
    if (uangBayarNumber < grandTotal) {
      setError("Uang bayar masih kurang")
      return
    }

    setError(null)
    setSuccessMsg("Transaksi siap diproses. Tahap simpan ke Firestore tinggal kita sambungkan berikutnya.")
    setTimeout(() => setSuccessMsg(null), 3000)
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
              <ShoppingCart
                size={24}
                className="text-white sm:h-7 sm:w-7"
                strokeWidth={2.5}
              />
            </div>
            <div>
              <h1 className="text-xl font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
                Transaksi Kasir
              </h1>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Toko · barang · diskon · pembayaran
              </p>
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
            {cart.length > 0 ? (
              <div className="flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-emerald-500 px-2.5 shadow-sm shadow-emerald-200/50">
                <span className="text-xs font-black text-white">{totalItem}</span>
              </div>
            ) : null}

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={fetchAll}
              disabled={loading}
              className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50"
            >
              <motion.span
                animate={loading ? { rotate: 360 } : {}}
                transition={
                  loading
                    ? { duration: 0.8, repeat: Infinity, ease: "linear" }
                    : {}
                }
              >
                <RefreshCw size={14} strokeWidth={2.5} />
              </motion.span>
              Refresh
            </motion.button>
          </div>
        </div>

        <div className="pointer-events-none absolute right-0 top-0 opacity-[0.03]">
          <Cpu size={140} strokeWidth={1} />
        </div>
      </motion.div>

      <AnimatePresence>
        {error ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5"
          >
            <AlertCircle size={14} className="text-red-500" strokeWidth={2.5} />
            <p className="text-[11px] font-bold text-red-600">{error}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {successMsg ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5"
          >
            <CheckCircle2 size={14} className="text-emerald-500" strokeWidth={2.5} />
            <p className="text-[11px] font-bold text-emerald-700">{successMsg}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <FieldLabel icon={Store} label="Pilih Toko" />
              <select
                value={selectedTokoId}
                onChange={(e) => {
                  const nextTokoId = e.target.value
                  setSelectedTokoId(nextTokoId)
                  setCart([])
                  setSearchBarang("")
                  setError(null)
                  setSuccessMsg(null)
                }}
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              >
                <option value="">Pilih toko</option>
                {tokoList.map((toko) => (
                  <option key={toko.id} value={toko.id}>
                    {toko.nama}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] font-semibold text-slate-500">
                {selectedToko
                  ? `Transaksi aktif di ${selectedToko.nama}`
                  : "Pilih toko dulu supaya barang dan diskon terfilter"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <FieldLabel icon={Wallet} label="Metode Pembayaran" />
              <select
                value={selectedMetodeId}
                onChange={(e) => setSelectedMetodeId(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              >
                <option value="">Pilih metode pembayaran</option>
                {metodeList.map((metode) => (
                  <option key={metode.id} value={metode.id}>
                    {metode.nama} {metode.tipe === "Non-Tunai" ? `• ${metode.tipe}` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] font-semibold text-slate-500">
                {selectedMetode
                  ? selectedMetode.tipe === "Non-Tunai"
                    ? `${selectedMetode.provider || "Provider"} • admin ${formatPercent(
                        selectedMetode.biayaAdmin || 0
                      )}`
                    : "Pembayaran tunai"
                  : "Pilih metode bayar untuk hitung total akhir"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <InfoCard
              icon={Receipt}
              label="Subtotal"
              value={formatRupiah(subtotal)}
              subValue={`${totalJenisBarang} jenis barang`}
            />
            <InfoCard
              icon={Percent}
              label="Diskon"
              value={formatRupiah(totalDiskon)}
              subValue={totalDiskon > 0 ? "Promo aktif terpakai" : "Belum ada promo"}
            />
            <InfoCard
              icon={BadgeDollarSign}
              label="Admin"
              value={formatRupiah(biayaAdminNominal)}
              subValue={
                selectedMetode?.tipe === "Non-Tunai"
                  ? `${formatPercent(selectedMetode.biayaAdmin || 0)} dari total`
                  : "Tidak ada biaya admin"
              }
            />
            <InfoCard
              icon={CircleDollarSign}
              label="Grand Total"
              value={formatRupiah(grandTotal)}
              subValue={`${totalItem} item`}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full">
                <FieldLabel icon={Search} label="Cari Barang" />
                <div className="relative">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    strokeWidth={2}
                  />
                  <input
                    value={searchBarang}
                    onChange={(e) => setSearchBarang(e.target.value)}
                    placeholder="Cari kode barang, nama, merk, kategori..."
                    className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
              </div>
            </div>

            {!selectedTokoId ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10">
                <Store size={30} className="text-slate-300" strokeWidth={1.6} />
                <p className="text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  Pilih toko untuk menampilkan barang
                </p>
              </div>
            ) : barangByToko.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10">
                <Boxes size={30} className="text-slate-300" strokeWidth={1.6} />
                <p className="text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  Barang tidak ditemukan
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {barangByToko.map((barang) => {
                  const diskon = getBestDiskonForBarang(
                    barang.id,
                    diskonList.filter((d) => d.tokoId === barang.tokoId && d.isActive)
                  )

                  const hargaPromo = hitungHargaSetelahDiskon(
                    barang.hargaJual,
                    diskon?.tipeDiskon,
                    diskon?.nilaiDiskon
                  )

                  const isLowStock = barang.stok <= barang.stokMinimum
                  const isOutStock = barang.stok <= 0

                  return (
                    <motion.div
                      key={barang.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-cyan-300 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">
                            {barang.nama}
                          </p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {barang.kodeBarang || "-"} · {barang.kategoriNama || "-"}
                          </p>
                        </div>

                        <button
                          onClick={() => addToCart(barang)}
                          disabled={isOutStock}
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Plus size={15} strokeWidth={3} />
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="rounded-lg bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700">
                          {barang.merk || "-"}
                        </span>
                        <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                          {barang.satuan || "-"}
                        </span>
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                            isOutStock
                              ? "bg-red-100 text-red-700"
                              : isLowStock
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          Stok: {barang.stok}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Harga
                          </p>
                          {diskon ? (
                            <div>
                              <p className="text-[11px] font-bold text-slate-400 line-through">
                                {formatRupiah(barang.hargaJual)}
                              </p>
                              <p className="text-sm font-black text-emerald-600">
                                {formatRupiah(hargaPromo)}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm font-black text-slate-800">
                              {formatRupiah(barang.hargaJual)}
                            </p>
                          )}
                        </div>

                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Promo
                          </p>
                          {diskon ? (
                            <div>
                              <p className="truncate text-xs font-black text-slate-700">
                                {diskon.namaPromo}
                              </p>
                              <p className="text-[10px] font-semibold text-emerald-600">
                                {diskon.tipeDiskon === "persen"
                                  ? formatPercent(diskon.nilaiDiskon)
                                  : formatRupiah(diskon.nilaiDiskon)}
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs font-semibold text-slate-500">
                              Tidak ada
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Keranjang
                </p>
                <p className="mt-1 text-sm font-black text-slate-800">
                  {totalJenisBarang} jenis · {totalItem} item
                </p>
              </div>

              <button
                onClick={clearCart}
                disabled={cart.length === 0}
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-red-600 transition-all hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Kosongkan
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12">
                <ShoppingCart size={32} className="text-slate-300" strokeWidth={1.6} />
                <p className="text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  Belum ada barang di keranjang
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => {
                  const totalLine = item.hargaSetelahDiskon * item.qty
                  const lineDiskon = (item.hargaAsli - item.hargaSetelahDiskon) * item.qty

                  return (
                    <div
                      key={item.barangId}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">
                            {item.nama}
                          </p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {item.kodeBarang} · {item.kategoriNama || "-"}
                          </p>
                        </div>

                        <button
                          onClick={() => removeItem(item.barangId)}
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-500 transition-all hover:bg-red-100"
                        >
                          <Trash2 size={14} strokeWidth={2.5} />
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-lg bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700">
                          {item.merk || "-"}
                        </span>
                        <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                          {item.satuan || "-"}
                        </span>
                        {item.diskonNama ? (
                          <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            {item.diskonNama}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Harga satuan
                          </p>
                          {item.hargaAsli !== item.hargaSetelahDiskon ? (
                            <div>
                              <p className="text-[11px] font-bold text-slate-400 line-through">
                                {formatRupiah(item.hargaAsli)}
                              </p>
                              <p className="text-sm font-black text-emerald-600">
                                {formatRupiah(item.hargaSetelahDiskon)}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm font-black text-slate-800">
                              {formatRupiah(item.hargaAsli)}
                            </p>
                          )}
                        </div>

                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Total line
                          </p>
                          <p className="text-sm font-black text-slate-800">
                            {formatRupiah(totalLine)}
                          </p>
                          {lineDiskon > 0 ? (
                            <p className="text-[10px] font-bold text-emerald-600">
                              Hemat {formatRupiah(lineDiskon)}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                          Qty
                        </p>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQty(item.barangId, "minus")}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-all hover:bg-slate-50"
                          >
                            <Minus size={14} strokeWidth={2.5} />
                          </button>

                          <div className="min-w-[2.2rem] text-center text-sm font-black text-slate-800">
                            {item.qty}
                          </div>

                          <button
                            onClick={() => updateQty(item.barangId, "plus")}
                            disabled={item.qty >= item.stok}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Plus size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              Ringkasan Pembayaran
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-500">Subtotal</span>
                <span className="font-black text-slate-800">{formatRupiah(subtotal)}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-500">Diskon</span>
                <span className="font-black text-emerald-600">
                  - {formatRupiah(totalDiskon)}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-500">Biaya admin</span>
                <span className="font-black text-slate-800">
                  {formatRupiah(biayaAdminNominal)}
                </span>
              </div>

              <div className="border-t border-dashed border-slate-200 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black uppercase tracking-wide text-slate-500">
                    Total bayar
                  </span>
                  <span className="text-lg font-black text-slate-900">
                    {formatRupiah(grandTotal)}
                  </span>
                </div>
              </div>

              <div>
                <FieldLabel icon={BadgeDollarSign} label="Uang Bayar" />
                <input
                  type="number"
                  min="0"
                  value={uangBayar}
                  onChange={(e) => setUangBayar(e.target.value)}
                  placeholder="Masukkan nominal bayar"
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>

              <div>
                <FieldLabel icon={Tag} label="Catatan" />
                <textarea
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  rows={3}
                  placeholder="Catatan transaksi, opsional"
                  className="w-full resize-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Kembalian
                  </p>
                  <p className="mt-1 text-base font-black text-emerald-600">
                    {formatRupiah(kembalian)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Kurang bayar
                  </p>
                  <p className="mt-1 text-base font-black text-red-500">
                    {formatRupiah(kurangBayar)}
                  </p>
                </div>
              </div>

              <button
                onClick={handleSimulasiBayar}
                disabled={!isBisaCheckout}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-3 text-sm font-black uppercase tracking-wide text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ScanBarcode size={16} strokeWidth={2.8} />
                Proses Transaksi
              </button>

              <p className="text-center text-[10px] font-semibold text-slate-400">
                Saat ini tombol masih simulasi. Langkah berikutnya tinggal sambungkan simpan transaksi + potong stok.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              Info Aktif
            </p>

            <div className="mt-3 space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mt-0.5 text-slate-400">
                  <Store size={14} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Toko
                  </p>
                  <p className="truncate text-sm font-black text-slate-800">
                    {selectedToko?.nama || "Belum dipilih"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mt-0.5 text-slate-400">
                  <Wallet size={14} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Pembayaran
                  </p>
                  <p className="truncate text-sm font-black text-slate-800">
                    {selectedMetode?.nama || "Belum dipilih"}
                  </p>
                  {selectedMetode?.provider ? (
                    <p className="text-[11px] font-semibold text-slate-500">
                      {selectedMetode.provider}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mt-0.5 text-slate-400">
                  <Layers3 size={14} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Promo aktif di toko ini
                  </p>
                  <p className="text-sm font-black text-slate-800">
                    {
                      diskonList.filter(
                        (d) => d.tokoId === selectedTokoId && d.isActive
                      ).length
                    }{" "}
                    promo
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mt-0.5 text-slate-400">
                  <Package size={14} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Barang tersedia
                  </p>
                  <p className="text-sm font-black text-slate-800">
                    {barangList.filter((b) => b.tokoId === selectedTokoId).length} barang
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}