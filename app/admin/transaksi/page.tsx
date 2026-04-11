/* 
  Halaman admin transaksi kasir.
  File ini mengambil data toko, barang, diskon, dan metode pembayaran dari Firestore,
  lalu membuat UI kasir dengan keranjang, total bayar, simpan transaksi,
  potong stok, catat mutasi stok keluar, serta update laporan harian dan bulanan.
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  runTransaction,
  serverTimestamp,
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
  hargaModal: number
  hargaAsli: number
  hargaSetelahDiskon: number
  diskonId?: string
  diskonNama?: string
  diskonTipe?: "persen" | "nominal"
  diskonNilai?: number
}

type LaporanMetodeBreakdown = {
  nama: string
  jumlahTransaksi: number
  omzet: number
  admin: number
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatRibuanInput(value: string) {
  if (!value) return ""
  const angka = Number(value.replace(/\D/g, "") || 0)
  if (!angka) return ""
  return new Intl.NumberFormat("id-ID").format(angka)
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

function getTanggalParts(nowMs: number) {
  const date = new Date(nowMs)
  const tahun = date.getFullYear()
  const bulan = date.getMonth() + 1
  const hari = date.getDate()

  const mm = `${bulan}`.padStart(2, "0")
  const dd = `${hari}`.padStart(2, "0")

  return {
    tahun,
    bulan,
    hari,
    tanggalKey: `${tahun}-${mm}-${dd}`,
    bulanKey: `${tahun}-${mm}`,
  }
}

function mergeMetodeBreakdown(
  existing: any,
  metodeNama: string,
  omzetTambah: number,
  adminTambah: number
): LaporanMetodeBreakdown[] {
  const list: LaporanMetodeBreakdown[] = Array.isArray(existing)
    ? existing.map((item: any) => ({
        nama: item?.nama || "Tanpa Nama",
        jumlahTransaksi: Number(item?.jumlahTransaksi || 0),
        omzet: Number(item?.omzet || 0),
        admin: Number(item?.admin || 0),
      }))
    : []

  const index = list.findIndex((item) => item.nama === metodeNama)

  if (index >= 0) {
    list[index] = {
      ...list[index],
      jumlahTransaksi: Number(list[index].jumlahTransaksi || 0) + 1,
      omzet: Number(list[index].omzet || 0) + Number(omzetTambah || 0),
      admin: Number(list[index].admin || 0) + Number(adminTambah || 0),
    }
  } else {
    list.push({
      nama: metodeNama || "Tanpa Nama",
      jumlahTransaksi: 1,
      omzet: Number(omzetTambah || 0),
      admin: Number(adminTambah || 0),
    })
  }

  return list.sort((a, b) => b.omzet - a.omzet)
}

function buildLaporanPayload({
  existingData,
  id,
  periodeKey,
  tahun,
  bulan,
  hari,
  tokoId,
  tokoNama,
  metodeNama,
  omzetTambah,
  subtotalTambah,
  totalDiskonTambah,
  totalSetelahDiskonTambah,
  totalBiayaAdminTambah,
  totalModalTambah,
  totalLabaKotorTambah,
  totalItemTambah,
  totalJenisBarangTambah,
  nowMs,
}: {
  existingData: any
  id: string
  periodeKey: string
  tahun: number
  bulan: number
  hari?: number
  tokoId: string
  tokoNama: string
  metodeNama: string
  omzetTambah: number
  subtotalTambah: number
  totalDiskonTambah: number
  totalSetelahDiskonTambah: number
  totalBiayaAdminTambah: number
  totalModalTambah: number
  totalLabaKotorTambah: number
  totalItemTambah: number
  totalJenisBarangTambah: number
  nowMs: number
}) {
  const jumlahTransaksiBaru = Number(existingData?.jumlahTransaksi || 0) + 1
  const omzetBaru = Number(existingData?.omzet || 0) + Number(omzetTambah || 0)
  const subtotalBaru = Number(existingData?.subtotal || 0) + Number(subtotalTambah || 0)
  const totalDiskonBaru =
    Number(existingData?.totalDiskon || 0) + Number(totalDiskonTambah || 0)
  const totalSetelahDiskonBaru =
    Number(existingData?.totalSetelahDiskon || 0) + Number(totalSetelahDiskonTambah || 0)
  const totalBiayaAdminBaru =
    Number(existingData?.totalBiayaAdmin || 0) + Number(totalBiayaAdminTambah || 0)
  const totalModalBaru =
    Number(existingData?.totalModal || 0) + Number(totalModalTambah || 0)
  const totalLabaKotorBaru =
    Number(existingData?.totalLabaKotor || 0) + Number(totalLabaKotorTambah || 0)
  const totalItemTerjualBaru =
    Number(existingData?.totalItemTerjual || 0) + Number(totalItemTambah || 0)
  const totalJenisBarangTerjualBaru =
    Number(existingData?.totalJenisBarangTerjual || 0) + Number(totalJenisBarangTambah || 0)

  return {
    id,
    ...(hari
      ? {
          tanggalKey: periodeKey,
          tahun,
          bulan,
          hari,
        }
      : {
          bulanKey: periodeKey,
          tahun,
          bulan,
        }),
    tokoId,
    tokoNama,
    jumlahTransaksi: jumlahTransaksiBaru,
    omzet: omzetBaru,
    subtotal: subtotalBaru,
    totalDiskon: totalDiskonBaru,
    totalSetelahDiskon: totalSetelahDiskonBaru,
    totalBiayaAdmin: totalBiayaAdminBaru,
    totalModal: totalModalBaru,
    totalLabaKotor: totalLabaKotorBaru,
    totalItemTerjual: totalItemTerjualBaru,
    totalJenisBarangTerjual: totalJenisBarangTerjualBaru,
    rataRataBelanja: jumlahTransaksiBaru > 0 ? Math.round(omzetBaru / jumlahTransaksiBaru) : 0,
    metodePembayaranBreakdown: mergeMetodeBreakdown(
      existingData?.metodePembayaranBreakdown,
      metodeNama,
      omzetTambah,
      totalBiayaAdminTambah
    ),
    createdAt: existingData?.createdAt || serverTimestamp(),
    createdAtMs: Number(existingData?.createdAtMs || nowMs),
    updatedAt: serverTimestamp(),
    updatedAtMs: nowMs,
  }
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
  const [submitLoading, setSubmitLoading] = useState(false)

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
    const snap = await getDocs(query(collection(db, "metode_pembayaran"), orderBy("nama")))

    const list: MetodePembayaran[] = snap.docs
      .map((d) => {
        const x = d.data() as any
        return {
          id: d.id,
          nama: x?.nama || "",
          tipe: (x?.tipe === "Non-Tunai" ? "Non-Tunai" : "Tunai") as
            | "Tunai"
            | "Non-Tunai",
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
                hargaModal: barang.hargaModal,
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
          hargaModal: barang.hargaModal,
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

  const totalDiskon = useMemo(() => subtotal - totalSetelahDiskon, [subtotal, totalSetelahDiskon])

  const biayaAdminNominal = useMemo(() => {
    const persen = Number(selectedMetode?.biayaAdmin || 0)
    if (!selectedMetode || selectedMetode.tipe === "Tunai" || persen <= 0) return 0
    return Math.round(totalSetelahDiskon * (persen / 100))
  }, [selectedMetode, totalSetelahDiskon])

  const grandTotal = useMemo(
    () => totalSetelahDiskon + biayaAdminNominal,
    [totalSetelahDiskon, biayaAdminNominal]
  )

  const totalModal = useMemo(
    () => cart.reduce((acc, item) => acc + item.hargaModal * item.qty, 0),
    [cart]
  )

  const estimasiLabaKotor = useMemo(
    () => totalSetelahDiskon - totalModal - biayaAdminNominal,
    [totalSetelahDiskon, totalModal, biayaAdminNominal]
  )

  const uangBayarNumber = Number(uangBayar.replace(/\D/g, "") || 0)
  const kembalian = Math.max(0, uangBayarNumber - grandTotal)
  const kurangBayar = Math.max(0, grandTotal - uangBayarNumber)

  const totalItem = useMemo(() => cart.reduce((acc, item) => acc + item.qty, 0), [cart])

  const totalJenisBarang = cart.length

  const isBisaCheckout =
    !!selectedTokoId &&
    !!selectedMetodeId &&
    cart.length > 0 &&
    uangBayarNumber >= grandTotal &&
    !submitLoading

  const handleProsesTransaksi = async () => {
  const user = auth.currentUser

  if (!user) {
    setError("Sesi login tidak ditemukan")
    return
  }

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

  if (!selectedToko) {
    setError("Data toko tidak ditemukan")
    return
  }

  if (!selectedMetode) {
    setError("Data metode pembayaran tidak ditemukan")
    return
  }

  setSubmitLoading(true)
  setError(null)
  setSuccessMsg(null)

  try {
    const nowMs = Date.now()
    const nomorTransaksi = `TRX-${nowMs}`
    const { tahun, bulan, hari, tanggalKey, bulanKey } = getTanggalParts(nowMs)

    await runTransaction(db, async (transaction) => {
      const transaksiRef = doc(collection(db, "transaksi"))
      const laporanHarianRef = doc(db, "laporan_harian", `${tanggalKey}__${selectedToko.id}`)
      const laporanBulananRef = doc(db, "laporan_bulanan", `${bulanKey}__${selectedToko.id}`)

      const itemPayload: any[] = []

      // =========================
      // 1) SEMUA READ DULU
      // =========================
      const barangReads = await Promise.all(
        cart.map(async (item) => {
          const barangRef = doc(db, "barang", item.barangId)
          const barangSnap = await transaction.get(barangRef)

          if (!barangSnap.exists()) {
            throw new Error(`Barang ${item.nama} tidak ditemukan`)
          }

          const barangDb = barangSnap.data() as any
          const stokSekarang = Number(barangDb?.stok || 0)

          if (stokSekarang < item.qty) {
            throw new Error(`Stok ${item.nama} tidak cukup`)
          }

          return {
            item,
            barangRef,
            stokSekarang,
            stokSesudah: stokSekarang - item.qty,
          }
        })
      )

      const laporanHarianSnap = await transaction.get(laporanHarianRef)
      const laporanBulananSnap = await transaction.get(laporanBulananRef)

      const laporanHarianData = laporanHarianSnap.exists() ? laporanHarianSnap.data() : null
      const laporanBulananData = laporanBulananSnap.exists() ? laporanBulananSnap.data() : null

      // =========================
      // 2) BARU SEMUA WRITE
      // =========================
      for (const row of barangReads) {
        const { item, barangRef, stokSekarang, stokSesudah } = row

        transaction.update(barangRef, {
          stok: stokSesudah,
          updatedAt: nowMs,
          updatedBy: user.uid,
        })

        const subtotalAsliItem = item.hargaAsli * item.qty
        const subtotalFinalItem = item.hargaSetelahDiskon * item.qty
        const totalDiskonItem = subtotalAsliItem - subtotalFinalItem

        itemPayload.push({
          barangId: item.barangId,
          kodeBarang: item.kodeBarang,
          nama: item.nama,
          kategoriNama: item.kategoriNama,
          merk: item.merk,
          satuan: item.satuan,
          qty: item.qty,
          hargaModal: item.hargaModal,
          hargaAsli: item.hargaAsli,
          hargaSetelahDiskon: item.hargaSetelahDiskon,
          subtotalAsli: subtotalAsliItem,
          subtotalFinal: subtotalFinalItem,
          totalDiskon: totalDiskonItem,
          diskonId: item.diskonId || "",
          diskonNama: item.diskonNama || "",
          diskonTipe: item.diskonTipe || "",
          diskonNilai: Number(item.diskonNilai || 0),
        })

        const mutasiRef = doc(collection(db, "mutasi_stok"))
        transaction.set(mutasiRef, {
          id: mutasiRef.id,
          transaksiId: transaksiRef.id,
          nomorTransaksi,
          tipe: "keluar",
          sumber: "transaksi",
          tokoId: selectedToko.id,
          tokoNama: selectedToko.nama,
          barangId: item.barangId,
          kodeBarang: item.kodeBarang,
          namaBarang: item.nama,
          qty: item.qty,
          stokSebelum: stokSekarang,
          stokSesudah,
          keterangan: `Penjualan kasir ${nomorTransaksi}`,
          createdAt: serverTimestamp(),
          createdAtMs: nowMs,
          createdBy: user.uid,
        })
      }

      transaction.set(transaksiRef, {
        id: transaksiRef.id,
        nomorTransaksi,
        tokoId: selectedToko.id,
        tokoNama: selectedToko.nama,
        metodePembayaranId: selectedMetode.id,
        metodePembayaranNama: selectedMetode.nama,
        metodePembayaranTipe: selectedMetode.tipe,
        metodePembayaranProvider: selectedMetode.provider || "",
        biayaAdminPersen: Number(selectedMetode.biayaAdmin || 0),
        biayaAdminNominal,
        subtotal,
        totalDiskon,
        totalSetelahDiskon,
        grandTotal,
        totalModal,
        estimasiLabaKotor,
        uangBayar: uangBayarNumber,
        kembalian,
        kurangBayar: 0,
        totalItem,
        totalJenisBarang,
        status: "selesai",
        catatan: catatan.trim(),
        items: itemPayload,
        createdAt: serverTimestamp(),
        createdAtMs: nowMs,
        createdBy: user.uid,
        updatedAt: serverTimestamp(),
        updatedAtMs: nowMs,
      })

      const payloadHarian = buildLaporanPayload({
        existingData: laporanHarianData,
        id: laporanHarianRef.id,
        periodeKey: tanggalKey,
        tahun,
        bulan,
        hari,
        tokoId: selectedToko.id,
        tokoNama: selectedToko.nama,
        metodeNama: selectedMetode.nama,
        omzetTambah: grandTotal,
        subtotalTambah: subtotal,
        totalDiskonTambah: totalDiskon,
        totalSetelahDiskonTambah: totalSetelahDiskon,
        totalBiayaAdminTambah: biayaAdminNominal,
        totalModalTambah: totalModal,
        totalLabaKotorTambah: estimasiLabaKotor,
        totalItemTambah: totalItem,
        totalJenisBarangTambah: totalJenisBarang,
        nowMs,
      })

      const payloadBulanan = buildLaporanPayload({
        existingData: laporanBulananData,
        id: laporanBulananRef.id,
        periodeKey: bulanKey,
        tahun,
        bulan,
        tokoId: selectedToko.id,
        tokoNama: selectedToko.nama,
        metodeNama: selectedMetode.nama,
        omzetTambah: grandTotal,
        subtotalTambah: subtotal,
        totalDiskonTambah: totalDiskon,
        totalSetelahDiskonTambah: totalSetelahDiskon,
        totalBiayaAdminTambah: biayaAdminNominal,
        totalModalTambah: totalModal,
        totalLabaKotorTambah: estimasiLabaKotor,
        totalItemTambah: totalItem,
        totalJenisBarangTambah: totalJenisBarang,
        nowMs,
      })

      transaction.set(laporanHarianRef, payloadHarian)
      transaction.set(laporanBulananRef, payloadBulanan)
    })

    await fetchBarang()

    setCart([])
    setUangBayar("")
    setCatatan("")
    setSelectedMetodeId("")
    setSuccessMsg("Transaksi berhasil disimpan, stok diperbarui, dan laporan direkap")

    setTimeout(() => setSuccessMsg(null), 3000)
  } catch (e: any) {
    console.error(e)
    setError(e?.message || "Gagal memproses transaksi")
  } finally {
    setSubmitLoading(false)
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
              disabled={loading || submitLoading}
              className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50"
            >
              <motion.span
                animate={loading ? { rotate: 360 } : {}}
                transition={
                  loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}
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
                  setUangBayar("")
                  setError(null)
                  setSuccessMsg(null)
                }}
                disabled={submitLoading}
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-60"
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
                disabled={submitLoading}
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-60"
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
                    disabled={submitLoading}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-60"
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
                          disabled={isOutStock || submitLoading}
                          className="rounded-xl bg-emerald-500 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Tambah
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Harga
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-800">
                            {formatRupiah(barang.hargaJual)}
                          </p>
                          {diskon ? (
                            <p className="mt-1 text-[11px] font-semibold text-emerald-600">
                              Promo {diskon.namaPromo}
                            </p>
                          ) : null}
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Harga Promo
                          </p>
                          <p className="mt-1 text-sm font-black text-emerald-600">
                            {formatRupiah(hargaPromo)}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {barang.satuan || "-"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Package size={14} className="text-slate-400" strokeWidth={2.5} />
                          <p className="text-[11px] font-semibold text-slate-500">
                            Stok {barang.stok}
                          </p>
                        </div>

                        {isOutStock ? (
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-red-500">
                            Habis
                          </span>
                        ) : isLowStock ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-600">
                            Menipis
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-600">
                            Aman
                          </span>
                        )}
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
                  Barang yang akan diproses
                </p>
              </div>

              {cart.length > 0 ? (
                <button
                  onClick={clearCart}
                  disabled={submitLoading}
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-red-600 transition-all hover:bg-red-100 disabled:opacity-40"
                >
                  Kosongkan
                </button>
              ) : null}
            </div>

            {cart.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10">
                <ShoppingCart size={30} className="text-slate-300" strokeWidth={1.6} />
                <p className="text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  Keranjang masih kosong
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.barangId}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-800">{item.nama}</p>
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          {item.kodeBarang} · {item.kategoriNama || "-"}
                        </p>

                        {item.diskonNama ? (
                          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-600">
                            <Tag size={10} strokeWidth={2.5} />
                            {item.diskonNama}
                          </div>
                        ) : null}
                      </div>

                      <button
                        onClick={() => removeItem(item.barangId)}
                        disabled={submitLoading}
                        className="rounded-xl border border-red-200 bg-white p-2 text-red-500 transition-all hover:bg-red-50 disabled:opacity-40"
                      >
                        <Trash2 size={14} strokeWidth={2.5} />
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Harga Asli
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-800">
                          {formatRupiah(item.hargaAsli)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Harga Final
                        </p>
                        <p className="mt-1 text-sm font-black text-emerald-600">
                          {formatRupiah(item.hargaSetelahDiskon)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQty(item.barangId, "minus")}
                          disabled={submitLoading}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-40"
                        >
                          <Minus size={14} strokeWidth={2.8} />
                        </button>

                        <div className="flex h-8 min-w-[3rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-800">
                          {item.qty}
                        </div>

                        <button
                          onClick={() => updateQty(item.barangId, "plus")}
                          disabled={submitLoading}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-40"
                        >
                          <Plus size={14} strokeWidth={2.8} />
                        </button>
                      </div>

                      <div className="text-right">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Subtotal
                        </p>
                        <p className="text-sm font-black text-slate-800">
                          {formatRupiah(item.hargaSetelahDiskon * item.qty)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              Ringkasan Pembayaran
            </p>

            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Subtotal
                  </p>
                  <p className="text-sm font-black text-slate-800">{formatRupiah(subtotal)}</p>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Diskon
                  </p>
                  <p className="text-sm font-black text-emerald-600">{formatRupiah(totalDiskon)}</p>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Admin
                  </p>
                  <p className="text-sm font-black text-slate-800">
                    {formatRupiah(biayaAdminNominal)}
                  </p>
                </div>

                <div className="mt-3 border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Grand Total
                    </p>
                    <p className="text-base font-black text-cyan-600">{formatRupiah(grandTotal)}</p>
                  </div>
                </div>
              </div>

              <div>
                <FieldLabel icon={Wallet} label="Uang Bayar" />
                <input
                  value={formatRibuanInput(uangBayar)}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "")
                    setUangBayar(raw)
                  }}
                  inputMode="numeric"
                  placeholder="Masukkan uang bayar"
                  disabled={submitLoading}
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-60"
                />
              </div>

              <div>
                <FieldLabel icon={Receipt} label="Catatan" />
                <textarea
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  rows={3}
                  disabled={submitLoading}
                  placeholder="Catatan transaksi..."
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-emerald-50 px-3 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
                    Kembalian
                  </p>
                  <p className="mt-1 text-base font-black text-emerald-600">
                    {formatRupiah(kembalian)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-red-50 px-3 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-red-400">
                    Kurang Bayar
                  </p>
                  <p className="mt-1 text-base font-black text-red-500">
                    {formatRupiah(kurangBayar)}
                  </p>
                </div>
              </div>

              <button
                onClick={handleProsesTransaksi}
                disabled={!isBisaCheckout}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-3 text-sm font-black uppercase tracking-wide text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ScanBarcode size={16} strokeWidth={2.8} />
                {submitLoading ? "Memproses..." : "Proses Transaksi"}
              </button>
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
                    Jenis Barang
                  </p>
                  <p className="truncate text-sm font-black text-slate-800">{totalJenisBarang}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mt-0.5 text-slate-400">
                  <Boxes size={14} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Total Item
                  </p>
                  <p className="truncate text-sm font-black text-slate-800">{totalItem}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mt-0.5 text-slate-400">
                  <BadgeDollarSign size={14} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Estimasi Laba Kotor
                  </p>
                  <p className="truncate text-sm font-black text-emerald-600">
                    {formatRupiah(estimasiLabaKotor)}
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