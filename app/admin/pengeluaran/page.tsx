/* 
  Halaman admin pengeluaran.
  File ini dipakai untuk:
  - tambah kategori pengeluaran dinamis
  - tambah data pengeluaran per toko
  - lihat ringkasan total pengeluaran
  - filter dan cari data pengeluaran
  - hapus data pengeluaran dan kategori
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
} from "firebase/firestore"
import {
  AlertCircle,
  BadgeDollarSign,
  CalendarDays,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Store,
  Tags,
  Trash2,
  Wallet,
} from "lucide-react"
import { motion } from "framer-motion"

type Toko = {
  id: string
  nama: string
  aktif?: boolean
}

type KategoriPengeluaran = {
  id: string
  nama: string
  namaLower: string
  deskripsi: string
  aktif: boolean
  createdAtMs: number
}

type Pengeluaran = {
  id: string
  tanggal: string
  tanggalKey: string
  bulanKey: string
  tokoId: string
  tokoNama: string
  kategoriId: string
  kategoriNama: string
  nominal: number
  catatan: string
  createdAtMs: number
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatTanggal(value?: string) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date)
}

function formatBulanKey(value?: string) {
  if (!value) return "-"
  const [year, month] = String(value).split("-")
  const y = Number(year || 0)
  const m = Number(month || 0)
  if (!y || !m) return value

  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1))
}

function getTodayInputValue() {
  const now = new Date()
  const y = now.getFullYear()
  const m = `${now.getMonth() + 1}`.padStart(2, "0")
  const d = `${now.getDate()}`.padStart(2, "0")
  return `${y}-${m}-${d}`
}

function getMonthInputValue(date = new Date()) {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, "0")
  return `${y}-${m}`
}

function toNumberOnly(value: string) {
  return Number(String(value || "").replace(/[^\d]/g, "") || 0)
}

function InputLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
      {children}
    </label>
  )
}

function FilterSelect({
  value,
  onChange,
  children,
  label,
  icon: Icon,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  label: string
  icon?: any
  disabled?: boolean
}) {
  return (
    <div>
      <InputLabel>{label}</InputLabel>

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
          disabled={disabled}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${
            Icon ? "pl-8" : "pl-3"
          } pr-8 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:cursor-not-allowed disabled:bg-slate-100`}
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

export default function PengeluaranPage() {
  const [loadingPage, setLoadingPage] = useState(false)
  const [savingPengeluaran, setSavingPengeluaran] = useState(false)
  const [savingKategori, setSavingKategori] = useState(false)
  const [deletingId, setDeletingId] = useState("")
  const [deletingKategoriId, setDeletingKategoriId] = useState("")
  const [error, setError] = useState<string | null>(null)

  const [tokoList, setTokoList] = useState<Toko[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriPengeluaran[]>([])
  const [pengeluaranList, setPengeluaranList] = useState<Pengeluaran[]>([])

  const [tanggal, setTanggal] = useState(getTodayInputValue())
  const [tokoId, setTokoId] = useState("")
  const [kategoriId, setKategoriId] = useState("")
  const [nominalInput, setNominalInput] = useState("")
  const [catatan, setCatatan] = useState("")

  const [kategoriBaruNama, setKategoriBaruNama] = useState("")
  const [kategoriBaruDeskripsi, setKategoriBaruDeskripsi] = useState("")

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterKategori, setFilterKategori] = useState("")
  const [filterBulan, setFilterBulan] = useState(getMonthInputValue())

  const fetchAll = async () => {
    setLoadingPage(true)
    setError(null)

    try {
      const [tokoSnap, kategoriSnap, pengeluaranSnap] = await Promise.all([
        getDocs(query(collection(db, "toko"), orderBy("nama"))),
        getDocs(query(collection(db, "kategori_pengeluaran"), orderBy("nama"))),
        getDocs(query(collection(db, "pengeluaran"), orderBy("createdAtMs", "desc"))),
      ])

      const tokoData: Toko[] = tokoSnap.docs.map((item) => {
        const data = item.data() as any
        return {
          id: item.id,
          nama: String(data?.nama || ""),
          aktif: Boolean(data?.aktif),
        }
      })

      const kategoriData: KategoriPengeluaran[] = kategoriSnap.docs.map((item) => {
        const data = item.data() as any
        return {
          id: item.id,
          nama: String(data?.nama || ""),
          namaLower: String(data?.namaLower || ""),
          deskripsi: String(data?.deskripsi || ""),
          aktif: Boolean(data?.aktif ?? true),
          createdAtMs: Number(data?.createdAtMs || 0),
        }
      })

      const pengeluaranData: Pengeluaran[] = pengeluaranSnap.docs.map((item) => {
        const data = item.data() as any
        return {
          id: item.id,
          tanggal: String(data?.tanggal || ""),
          tanggalKey: String(data?.tanggalKey || ""),
          bulanKey: String(data?.bulanKey || ""),
          tokoId: String(data?.tokoId || ""),
          tokoNama: String(data?.tokoNama || ""),
          kategoriId: String(data?.kategoriId || ""),
          kategoriNama: String(data?.kategoriNama || ""),
          nominal: Number(data?.nominal || 0),
          catatan: String(data?.catatan || ""),
          createdAtMs: Number(data?.createdAtMs || 0),
        }
      })

      const tokoAktif = tokoData.filter((item) => item.nama && item.aktif !== false)
      const kategoriAktif = kategoriData.filter((item) => item.nama && item.aktif !== false)

      setTokoList(tokoAktif)
      setKategoriList(kategoriAktif)
      setPengeluaranList(pengeluaranData)

      if (!tokoId && tokoAktif.length > 0) {
        setTokoId(tokoAktif[0].id)
      }

      if (!kategoriId && kategoriAktif.length > 0) {
        setKategoriId(kategoriAktif[0].id)
      }
    } catch (err) {
      console.error(err)
      setError("Gagal memuat data pengeluaran")
      setTokoList([])
      setKategoriList([])
      setPengeluaranList([])
    } finally {
      setLoadingPage(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) {
        await fetchAll()
      }
    })

    return () => unsub()
  }, [])

  const kategoriSelected = useMemo(
    () => kategoriList.find((item) => item.id === kategoriId) || null,
    [kategoriId, kategoriList]
  )

  const tokoSelected = useMemo(
    () => tokoList.find((item) => item.id === tokoId) || null,
    [tokoId, tokoList]
  )

  const filteredPengeluaran = useMemo(() => {
    const q = search.toLowerCase().trim()

    return pengeluaranList.filter((item) => {
      const matchSearch =
        !q ||
        item.kategoriNama.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.catatan.toLowerCase().includes(q) ||
        item.tanggalKey.toLowerCase().includes(q)

      const matchToko = !filterToko || item.tokoId === filterToko
      const matchKategori = !filterKategori || item.kategoriId === filterKategori
      const matchBulan = !filterBulan || item.bulanKey === filterBulan

      return matchSearch && matchToko && matchKategori && matchBulan
    })
  }, [pengeluaranList, search, filterToko, filterKategori, filterBulan])

  const totalPengeluaran = filteredPengeluaran.reduce(
    (acc, item) => acc + Number(item.nominal || 0),
    0
  )

  const totalTransaksiPengeluaran = filteredPengeluaran.length

  const kategoriBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { kategoriId: string; kategoriNama: string; total: number; jumlah: number }
    >()

    for (const item of filteredPengeluaran) {
      const key = item.kategoriId || item.kategoriNama || item.id
      const current = map.get(key) || {
        kategoriId: item.kategoriId,
        kategoriNama: item.kategoriNama || "Tanpa Kategori",
        total: 0,
        jumlah: 0,
      }

      current.total += Number(item.nominal || 0)
      current.jumlah += 1
      map.set(key, current)
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [filteredPengeluaran])

  const totalKategoriAktif = kategoriList.length

  const handleTambahKategori = async () => {
    const nama = kategoriBaruNama.trim()
    const deskripsi = kategoriBaruDeskripsi.trim()

    if (!nama) {
      alert("Nama kategori wajib diisi")
      return
    }

    const namaLower = nama.toLowerCase()
    const isExist = kategoriList.some((item) => item.namaLower === namaLower)

    if (isExist) {
      alert("Kategori sudah ada")
      return
    }

    try {
      setSavingKategori(true)

      const now = Date.now()

      await addDoc(collection(db, "kategori_pengeluaran"), {
        nama,
        namaLower,
        deskripsi,
        aktif: true,
        createdAtMs: now,
        updatedAtMs: now,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      setKategoriBaruNama("")
      setKategoriBaruDeskripsi("")
      await fetchAll()
      alert("Kategori berhasil ditambahkan")
    } catch (err) {
      console.error(err)
      alert("Gagal menambah kategori")
    } finally {
      setSavingKategori(false)
    }
  }

  const handleTambahPengeluaran = async () => {
    const nominal = toNumberOnly(nominalInput)

    if (!tanggal) {
      alert("Tanggal wajib diisi")
      return
    }

    if (!tokoSelected) {
      alert("Toko wajib dipilih")
      return
    }

    if (!kategoriSelected) {
      alert("Kategori wajib dipilih")
      return
    }

    if (!nominal || nominal <= 0) {
      alert("Nominal pengeluaran wajib diisi")
      return
    }

    try {
      setSavingPengeluaran(true)

      const now = Date.now()
      const bulanKey = tanggal.slice(0, 7)

      await addDoc(collection(db, "pengeluaran"), {
        tanggal,
        tanggalKey: tanggal,
        bulanKey,
        tokoId: tokoSelected.id,
        tokoNama: tokoSelected.nama,
        kategoriId: kategoriSelected.id,
        kategoriNama: kategoriSelected.nama,
        nominal,
        catatan: catatan.trim(),
        createdAtMs: now,
        updatedAtMs: now,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      setNominalInput("")
      setCatatan("")
      setFilterBulan(bulanKey)
      await fetchAll()
      alert("Pengeluaran berhasil ditambahkan")
    } catch (err) {
      console.error(err)
      alert("Gagal menambah pengeluaran")
    } finally {
      setSavingPengeluaran(false)
    }
  }

  const handleDeletePengeluaran = async (id: string) => {
    const ok = window.confirm("Hapus data pengeluaran ini?")
    if (!ok) return

    try {
      setDeletingId(id)
      await deleteDoc(doc(db, "pengeluaran", id))
      await fetchAll()
    } catch (err) {
      console.error(err)
      alert("Gagal menghapus pengeluaran")
    } finally {
      setDeletingId("")
    }
  }

  const handleDeleteKategori = async (id: string, nama: string) => {
    const masihDipakai = pengeluaranList.some((item) => item.kategoriId === id)
    if (masihDipakai) {
      alert(`Kategori "${nama}" sudah dipakai di data pengeluaran, jadi belum bisa dihapus`)
      return
    }

    const ok = window.confirm(`Hapus kategori "${nama}"?`)
    if (!ok) return

    try {
      setDeletingKategoriId(id)
      await deleteDoc(doc(db, "kategori_pengeluaran", id))
      await fetchAll()
    } catch (err) {
      console.error(err)
      alert("Gagal menghapus kategori")
    } finally {
      setDeletingKategoriId("")
    }
  }

  return (
    <div className="space-y-4 text-slate-900 sm:space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border-b border-r border-t border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
  <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50 sm:h-14 sm:w-14">
      <Wallet size={22} className="text-white sm:h-7 sm:w-7" strokeWidth={2.5} />
    </div>

    <div className="min-w-0 self-center sm:self-auto">
      <h1 className="text-lg font-black leading-none tracking-tight text-slate-800 sm:text-2xl">
        Pengeluaran
      </h1>
      <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 sm:block">
        Dinamis · kategori · toko · rekap
      </p>
    </div>
  </div>

  <motion.button
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    onClick={fetchAll}
    disabled={loadingPage}
    className="flex h-8 items-center justify-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50 sm:self-auto"
  >
    <motion.span
      animate={loadingPage ? { rotate: 360 } : {}}
      transition={
        loadingPage ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}
      }
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-4 xl:col-span-7"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Tambah Pengeluaran
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Input pengeluaran operasional per toko
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <InputLabel>Tanggal</InputLabel>
                <div className="relative">
                  <CalendarDays
                    size={13}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    strokeWidth={2}
                  />
                  <input
                    type="date"
                    value={tanggal}
                    onChange={(e) => setTanggal(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
              </div>

              <FilterSelect
                label="Toko"
                value={tokoId}
                onChange={setTokoId}
                icon={Store}
                disabled={tokoList.length === 0}
              >
                <option value="">Pilih toko</option>
                {tokoList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nama}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect
                label="Kategori Pengeluaran"
                value={kategoriId}
                onChange={setKategoriId}
                icon={Tags}
                disabled={kategoriList.length === 0}
              >
                <option value="">Pilih kategori</option>
                {kategoriList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nama}
                  </option>
                ))}
              </FilterSelect>

              <div>
                <InputLabel>Nominal</InputLabel>
                <div className="relative">
                  <BadgeDollarSign
                    size={13}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    strokeWidth={2}
                  />
                  <input
                    inputMode="numeric"
                    value={nominalInput}
                    onChange={(e) => {
                      const angka = toNumberOnly(e.target.value)
                      setNominalInput(angka ? String(angka) : "")
                    }}
                    placeholder="Contoh: 500000"
                    className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                  {formatRupiah(toNumberOnly(nominalInput))}
                </p>
              </div>

              <div className="md:col-span-2">
                <InputLabel>Catatan</InputLabel>
                <textarea
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  rows={3}
                  placeholder="Contoh: bayar listrik toko pusat bulan ini"
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={handleTambahPengeluaran}
                disabled={savingPengeluaran}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-white transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingPengeluaran ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Plus size={16} />
                )}
                Simpan Pengeluaran
              </button>

              <p className="text-[11px] font-semibold text-slate-500">
                Kategori bisa kamu tambah dinamis di panel sebelah kanan
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Filter Data
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Cari dan saring pengeluaran
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <InputLabel>Cari</InputLabel>
                <div className="relative">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    strokeWidth={2}
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Kategori, toko, tanggal, catatan..."
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
                <option value="">Semua toko</option>
                {tokoList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nama}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect
                label="Kategori"
                value={filterKategori}
                onChange={setFilterKategori}
                icon={Tags}
              >
                <option value="">Semua kategori</option>
                {kategoriList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nama}
                  </option>
                ))}
              </FilterSelect>

              <div>
                <InputLabel>Bulan</InputLabel>
                <div className="relative">
                  <CalendarDays
                    size={13}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    strokeWidth={2}
                  />
                  <input
                    type="month"
                    value={filterBulan}
                    onChange={(e) => setFilterBulan(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-semibold text-slate-700 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  />
                </div>
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSearch("")
                    setFilterToko("")
                    setFilterKategori("")
                    setFilterBulan(getMonthInputValue())
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
                >
                  Reset Filter
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
  <InfoCard
    icon={Wallet}
    label="Total Pengeluaran"
    value={formatRupiah(totalPengeluaran)}
    subValue={`${totalTransaksiPengeluaran} data`}
  />
  <InfoCard
    icon={Tags}
    label="Kategori Pengeluaran"
    value={String(totalKategoriAktif)}
    subValue="Master kategori pengeluaran"
  />
  <InfoCard
    icon={Store}
    label="Jumlah Toko"
    value={String(new Set(filteredPengeluaran.map((i) => i.tokoId)).size)}
    subValue={filterBulan ? formatBulanKey(filterBulan) : "Semua bulan"}
  />
</div>
         

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Data Pengeluaran
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Daftar pengeluaran yang sudah diinput
              </p>
            </div>

            {filteredPengeluaran.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPengeluaran.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-800">{item.kategoriNama}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                          <span>{formatTanggal(item.tanggalKey)}</span>
                          <span>•</span>
                          <span>{item.tokoNama || "Tanpa Toko"}</span>
                          <span>•</span>
                          <span>{formatBulanKey(item.bulanKey)}</span>
                        </div>

                        {item.catatan ? (
                          <p className="mt-2 text-[12px] font-semibold text-slate-600">
                            {item.catatan}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-start gap-3 sm:items-end">
                        <p className="text-base font-black text-rose-600">
                          {formatRupiah(item.nominal)}
                        </p>

                        <button
                          onClick={() => handleDeletePengeluaran(item.id)}
                          disabled={deletingId === item.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-[11px] font-black text-red-600 transition-all hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingId === item.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="space-y-4 xl:col-span-5"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Tambah Kategori
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Kategori pengeluaran bersifat dinamis
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <InputLabel>Nama Kategori</InputLabel>
                <input
                  value={kategoriBaruNama}
                  onChange={(e) => setKategoriBaruNama(e.target.value)}
                  placeholder="Contoh: Gaji Karyawan"
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>

              <div>
                <InputLabel>Deskripsi</InputLabel>
                <textarea
                  value={kategoriBaruDeskripsi}
                  onChange={(e) => setKategoriBaruDeskripsi(e.target.value)}
                  rows={3}
                  placeholder="Opsional"
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all hover:border-cyan-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>

              <button
                onClick={handleTambahKategori}
                disabled={savingKategori}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-white transition-all hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingKategori ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Plus size={16} />
                )}
                Tambah Kategori
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Breakdown Kategori
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Total pengeluaran per kategori
              </p>
            </div>

            {kategoriBreakdown.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada data
              </div>
            ) : (
              <div className="space-y-3">
                {kategoriBreakdown.map((item) => {
                  const persen = totalPengeluaran > 0 ? (item.total / totalPengeluaran) * 100 : 0

                  return (
                    <div
                      key={item.kategoriId}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">
                            {item.kategoriNama}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {item.jumlah} data
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-black text-slate-800">
                            {formatRupiah(item.total)}
                          </p>
                          <p className="mt-1 text-[10px] font-bold text-slate-500">
                            {persen.toFixed(1)}%
                          </p>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500"
                            style={{ width: `${Math.min(100, persen)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Master Kategori
              </p>
              <p className="mt-1 text-sm font-black text-slate-800">
                Daftar kategori yang tersedia
              </p>
            </div>

            {kategoriList.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Belum ada kategori
              </div>
            ) : (
              <div className="space-y-3">
                {kategoriList.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-800">{item.nama}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          {item.deskripsi || "Tanpa deskripsi"}
                        </p>
                      </div>

                      <button
                        onClick={() => handleDeleteKategori(item.id, item.nama)}
                        disabled={deletingKategoriId === item.id}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-[11px] font-black text-red-600 transition-all hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingKategoriId === item.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}