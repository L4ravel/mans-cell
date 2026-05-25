/*
  Halaman admin riwayat transaksi.
  Menampilkan daftar transaksi dengan pagination Firestore, filter toko, metode, kasir, tanggal, pencarian lokal, dan detail transaksi.
  Layout dibuat konsisten dengan halaman master data terbaru: header biru, stat card, filter collapse mobile, tabel desktop, card mobile, dan modal detail.
*/

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  doc,
  getDoc,
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
  AlertCircle,
  BadgeDollarSign,
  Boxes,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Cpu,
  Eye,
  ListFilter,
  Mail,
  Percent,
  Receipt,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  User2,
  Wallet,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

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

type UserProfile = {
  uid: string
  nama: string
  email: string
  role: string
  roles: string[]
  tokoId: string
  tokoNama: string
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

function normalizeRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
}

function isAdminProfile(profile: UserProfile | null) {
  if (!profile) return false
  const role = String(profile.role || "").trim().toLowerCase()
  if (role === "admin" || role === "superadmin") return true
  return profile.roles.includes("admin") || profile.roles.includes("superadmin")
}

export default function RiwayatTransaksiPage() {
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [data, setData] = useState<Transaksi[]>([])
  const [tokoList, setTokoList] = useState<TokoOption[]>([])
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null)

  const [search, setSearch] = useState("")
  const [filterToko, setFilterToko] = useState("")
  const [filterMetode, setFilterMetode] = useState("")
  const [filterKasir, setFilterKasir] = useState("")
  const [filterTanggalAwal, setFilterTanggalAwal] = useState("")
  const [filterTanggalAkhir, setFilterTanggalAkhir] = useState("")
  const [filterMobileOpen, setFilterMobileOpen] = useState(false)
  const [selectedDetail, setSelectedDetail] = useState<Transaksi | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)

  const isAdminUser = useMemo(() => isAdminProfile(currentUserProfile), [currentUserProfile])

  const lockedTokoId = useMemo(
    () => (isAdminUser ? "" : String(currentUserProfile?.tokoId || "").trim()),
    [isAdminUser, currentUserProfile]
  )

  const lockedKasirUid = useMemo(
    () => (isAdminUser ? "" : String(currentUserProfile?.uid || "").trim()),
    [isAdminUser, currentUserProfile]
  )

  const effectiveTokoId = useMemo(
    () => (isAdminUser ? filterToko : lockedTokoId),
    [isAdminUser, filterToko, lockedTokoId]
  )

  const effectiveKasirUid = useMemo(
    () => (isAdminUser ? filterKasir : lockedKasirUid),
    [isAdminUser, filterKasir, lockedKasirUid]
  )

  const tanggalAwalMs = useMemo(() => getStartOfDayMs(filterTanggalAwal), [filterTanggalAwal])
  const tanggalAkhirMs = useMemo(() => getEndOfDayMs(filterTanggalAkhir), [filterTanggalAkhir])

  const fetchCurrentUserProfile = async (uid: string, emailFallback?: string | null) => {
    try {
      const snap = await getDoc(doc(db, "users", uid))

      if (snap.exists()) {
        const raw = snap.data() as any
        const profile: UserProfile = {
          uid,
          nama: String(raw?.nama || "").trim() || "Tanpa Nama",
          email: String(raw?.email || "").trim() || String(emailFallback || "").trim() || "-",
          role: String(raw?.role || "").trim().toLowerCase(),
          roles: normalizeRoles(raw?.roles),
          tokoId: String(raw?.tokoId || "").trim(),
          tokoNama: String(raw?.tokoNama || "").trim(),
        }
        setCurrentUserProfile(profile)
        return profile
      }
    } catch (err) {
      console.error("Gagal mengambil profil user:", err)
    }

    const fallback: UserProfile = {
      uid,
      nama: "Tanpa Nama",
      email: String(emailFallback || "").trim() || "-",
      role: "",
      roles: [],
      tokoId: "",
      tokoNama: "",
    }
    setCurrentUserProfile(fallback)
    return fallback
  }

  const buildTransaksiQuery = (
    tokoIdValue: string,
    kasirUidValue: string,
    cursor?: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    const constraints: QueryConstraint[] = []

    if (tokoIdValue) constraints.push(where("tokoId", "==", tokoIdValue))
    if (kasirUidValue) constraints.push(where("kasirUid", "==", kasirUidValue))
    if (filterMetode) constraints.push(where("metodePembayaranNama", "==", filterMetode))
    if (tanggalAwalMs !== null) constraints.push(where("createdAtMs", ">=", tanggalAwalMs))
    if (tanggalAkhirMs !== null) constraints.push(where("createdAtMs", "<=", tanggalAkhirMs))

    constraints.push(orderBy("createdAtMs", "desc"))
    if (cursor) constraints.push(startAfter(cursor))
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

  const fetchToko = async (profile?: UserProfile | null) => {
    if (!isAdminProfile(profile || currentUserProfile)) {
      const tokoId = String(profile?.tokoId || currentUserProfile?.tokoId || "").trim()
      const tokoNama = String(profile?.tokoNama || currentUserProfile?.tokoNama || "").trim()

      if (tokoId) setTokoList([{ id: tokoId, nama: tokoNama || "Toko Karyawan" }])
      else setTokoList([])
      return
    }

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

  const fetchData = async (profileOverride?: UserProfile | null) => {
    const activeProfile = profileOverride || currentUserProfile
    const admin = isAdminProfile(activeProfile)
    const tokoIdQuery = admin ? filterToko : String(activeProfile?.tokoId || "").trim()
    const kasirUidQuery = admin ? filterKasir : String(activeProfile?.uid || "").trim()

    if (!admin && !tokoIdQuery) {
      setData([])
      setHasMore(false)
      setLastDoc(null)
      setError("Akun ini belum terhubung ke toko")
      setTokoList([])
      return
    }

    if (!admin && !kasirUidQuery) {
      setData([])
      setHasMore(false)
      setLastDoc(null)
      setError("Akun ini belum memiliki identitas kasir")
      return
    }

    setLoading(true)
    setError(null)

    try {
      await fetchToko(activeProfile)

      const transaksiSnap = await getDocs(buildTransaksiQuery(tokoIdQuery, kasirUidQuery, null))
      const transaksiList = transaksiSnap.docs.map(mapTransaksiDoc)

      setData(transaksiList)
      setLastDoc(transaksiSnap.docs.length > 0 ? transaksiSnap.docs[transaksiSnap.docs.length - 1] : null)
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

    const tokoIdQuery = effectiveTokoId
    const kasirUidQuery = effectiveKasirUid

    if (!isAdminUser && !tokoIdQuery) return
    if (!isAdminUser && !kasirUidQuery) return

    setLoadingMore(true)
    setError(null)

    try {
      const transaksiSnap = await getDocs(buildTransaksiQuery(tokoIdQuery, kasirUidQuery, lastDoc))
      const moreList = transaksiSnap.docs.map(mapTransaksiDoc)

      setData((prev) => [...prev, ...moreList])
      setLastDoc(transaksiSnap.docs.length > 0 ? transaksiSnap.docs[transaksiSnap.docs.length - 1] : lastDoc)
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
      if (!user) {
        setCurrentUserProfile(null)
        setData([])
        setTokoList([])
        setHasMore(false)
        setLastDoc(null)
        return
      }

      const profile = await fetchCurrentUserProfile(user.uid, user.email)
      if (!isAdminProfile(profile)) {
        setFilterToko(String(profile.tokoId || "").trim())
        setFilterKasir(String(profile.uid || "").trim())
      }
      await fetchData(profile)
    })

    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!currentUserProfile) return
    void fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterToko, filterMetode, filterTanggalAwal, filterTanggalAkhir, filterKasir])

  const metodeOptions = useMemo(() => {
    return Array.from(new Set(data.map((item) => item.metodePembayaranNama).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    )
  }, [data])

  const kasirOptionsUnique = useMemo(() => {
    const map = new Map<string, string>()

    for (const item of data) {
      const uid = String(item.kasirUid || "").trim()
      const nama = String(item.kasirNama || "").trim()
      if (!uid || !nama) continue
      if (!map.has(uid)) map.set(uid, nama)
    }

    return Array.from(map.entries())
      .map(([uid, nama]) => ({ uid, nama }))
      .sort((a, b) => a.nama.localeCompare(b.nama))
  }, [data])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()

    return data.filter((item) => {
      const matchSearch =
        !q ||
        item.nomorTransaksi.toLowerCase().includes(q) ||
        item.tokoNama.toLowerCase().includes(q) ||
        item.metodePembayaranNama.toLowerCase().includes(q) ||
        String(item.kasirNama || "").toLowerCase().includes(q) ||
        item.items.some((x) => x.nama?.toLowerCase().includes(q) || x.kodeBarang?.toLowerCase().includes(q))

      return matchSearch
    })
  }, [data, search])

  const totalTransaksi = filtered.length
  const totalOmzet = filtered.reduce((acc, item) => acc + item.grandTotal, 0)
  const totalDiskon = filtered.reduce((acc, item) => acc + item.totalDiskon, 0)
  const totalLabaKotor = filtered.reduce((acc, item) => acc + item.estimasiLabaKotor, 0)

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
                <Receipt size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">Riwayat Transaksi</h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Pantau transaksi kasir, metode bayar, detail barang, dan ringkasan omzet.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <HeaderButton icon={RefreshCw} label="Refresh" onClick={() => fetchData()} loading={loading} />
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.04]">
            <Cpu size={150} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        {/* Toast Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg"
            >
              <AlertCircle size={16} className="text-red-600" strokeWidth={2.5} />
              <p className="max-w-xs text-xs font-black text-red-700">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats */}
        <div className="space-y-2 sm:space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <RiwayatStatCard icon={ShoppingCart} label="Transaksi" value={String(totalTransaksi)} tone="sky" />
            <RiwayatStatCard icon={CircleDollarSign} label="Omzet" value={formatRupiah(totalOmzet)} tone="blue" />
            <RiwayatStatCard icon={Percent} label="Diskon" value={formatRupiah(totalDiskon)} tone="slate" />
            <RiwayatStatCard icon={BadgeDollarSign} label="Laba Kotor" value={formatRupiah(totalLabaKotor)} tone="rose" />
          </div>
        </div>

        {/* Search & Filter */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${isAdminUser ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
            <div className="sm:col-span-2 xl:col-span-1">
              <FieldBox label="Cari Transaksi">
                <div className="relative">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    strokeWidth={2.5}
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nomor, toko, metode, barang..."
                    className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  />
                </div>
              </FieldBox>
            </div>

            <div className="hidden sm:contents">
              {isAdminUser ? (
                <FilterSelect label="Kasir" value={filterKasir} onChange={setFilterKasir} icon={User2}>
                  <option value="">Semua Kasir</option>
                  {kasirOptionsUnique.map((item) => (
                    <option key={item.uid} value={item.uid}>
                      {item.nama}
                    </option>
                  ))}
                </FilterSelect>
              ) : (
                <ReadOnlyField label="Kasir" value={currentUserProfile?.nama || "Kasir Aktif"} />
              )}

              {isAdminUser ? (
                <FilterSelect label="Toko" value={filterToko} onChange={setFilterToko} icon={Store}>
                  <option value="">Semua Toko</option>
                  {tokoList.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nama}
                    </option>
                  ))}
                </FilterSelect>
              ) : (
                <ReadOnlyField label="Toko" value={currentUserProfile?.tokoNama || "Toko belum terhubung"} />
              )}

              <FilterSelect label="Metode" value={filterMetode} onChange={setFilterMetode} icon={Wallet}>
                <option value="">Semua Metode</option>
                {metodeOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </FilterSelect>

              <DateInput label="Tanggal Awal" value={filterTanggalAwal} onChange={setFilterTanggalAwal} />
              <DateInput label="Tanggal Akhir" value={filterTanggalAkhir} onChange={setFilterTanggalAkhir} />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={() => fetchData()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-2 py-2.5 text-[10px] font-black uppercase tracking-[0.06em] text-white shadow-sm shadow-sky-500/15 disabled:opacity-60"
              type="button"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} strokeWidth={2.5} />
              Refresh
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
                  {isAdminUser ? (
                    <FilterSelect label="Kasir" value={filterKasir} onChange={setFilterKasir} icon={User2}>
                      <option value="">Semua Kasir</option>
                      {kasirOptionsUnique.map((item) => (
                        <option key={item.uid} value={item.uid}>
                          {item.nama}
                        </option>
                      ))}
                    </FilterSelect>
                  ) : (
                    <ReadOnlyField label="Kasir" value={currentUserProfile?.nama || "Kasir Aktif"} />
                  )}

                  {isAdminUser ? (
                    <FilterSelect label="Toko" value={filterToko} onChange={setFilterToko} icon={Store}>
                      <option value="">Semua Toko</option>
                      {tokoList.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nama}
                        </option>
                      ))}
                    </FilterSelect>
                  ) : (
                    <ReadOnlyField label="Toko" value={currentUserProfile?.tokoNama || "Toko belum terhubung"} />
                  )}

                  <FilterSelect label="Metode" value={filterMetode} onChange={setFilterMetode} icon={Wallet}>
                    <option value="">Semua Metode</option>
                    {metodeOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </FilterSelect>

                  <DateInput label="Tanggal Awal" value={filterTanggalAwal} onChange={setFilterTanggalAwal} />
                  <DateInput label="Tanggal Akhir" value={filterTanggalAkhir} onChange={setFilterTanggalAkhir} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <RiwayatList
          loading={loading}
          filtered={filtered}
          hasMore={hasMore}
          loadingMore={loadingMore}
          fetchMore={fetchMore}
          setSelectedDetail={setSelectedDetail}
        />

        <DetailModal selectedDetail={selectedDetail} setSelectedDetail={setSelectedDetail} />
      </main>
    </div>
  )
}

function HeaderButton({
  icon: Icon,
  label,
  onClick,
  loading = false,
}: {
  icon: any
  label: string
  onClick: () => void
  loading?: boolean
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      onClick={onClick}
      className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15 disabled:opacity-60"
      title={label}
      type="button"
      disabled={loading}
    >
      <Icon size={12} strokeWidth={2.8} className={loading ? "animate-spin" : ""} />
      <span>{label}</span>
    </motion.button>
  )
}

function RiwayatStatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
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
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
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
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  label: string
  icon?: any
}) {
  return (
    <FieldBox label={label}>
      <div className="relative">
        {Icon && (
          <Icon
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2.5}
          />
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border-2 border-slate-200 bg-white ${
            Icon ? "pl-9" : "pl-3"
          } py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20`}
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

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <FieldBox label={label}>
      <div className="relative">
        <CalendarDays
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          strokeWidth={2.5}
        />
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
        />
      </div>
    </FieldBox>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <FieldBox label={label}>
      <div className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
        {value}
      </div>
    </FieldBox>
  )
}

function RiwayatList({
  loading,
  filtered,
  hasMore,
  loadingMore,
  fetchMore,
  setSelectedDetail,
}: {
  loading: boolean
  filtered: Transaksi[]
  hasMore: boolean
  loadingMore: boolean
  fetchMore: () => void
  setSelectedDetail: (item: Transaksi) => void
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
          />
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Memuat riwayat...</p>
        </div>
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <Boxes size={28} className="text-slate-300" strokeWidth={2} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Belum ada data transaksi</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2 sm:hidden">
        {filtered.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: idx * 0.03 }}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100/70"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                <Receipt size={20} strokeWidth={2.5} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black leading-tight text-slate-800">{item.nomorTransaksi}</p>
                    <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                      {formatTanggal(item.createdAtMs)}
                    </p>
                  </div>

                  <span className="inline-flex shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-sky-700">
                    {item.status || "selesai"}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                  <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                    <Store size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                    <span className="truncate">{item.tokoNama || "-"}</span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                    <Wallet size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                    <span className="truncate">{item.metodePembayaranNama || "-"}</span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
                    <User2 size={13} className="shrink-0 text-slate-400" strokeWidth={2.5} />
                    <span className="truncate">{item.kasirNama || "Tanpa Kasir"}</span>
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Grand Total</p>
                    <p className="truncate text-xs font-black text-slate-800">{formatRupiah(item.grandTotal)}</p>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    onClick={() => setSelectedDetail(item)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-sky-700 shadow-sm transition hover:bg-sky-100"
                    type="button"
                  >
                    <Eye size={13} strokeWidth={2.6} />
                    Detail
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
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
                {["No", "Transaksi", "Tanggal", "Toko", "Kasir", "Metode", "Item", "Grand Total", "Aksi"].map((head) => (
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
              {filtered.map((item, index) => (
                <tr key={item.id} className="border-t border-slate-100 transition-colors hover:bg-sky-50/40">
                  <td className="px-3 py-3 text-center font-bold text-slate-400">{index + 1}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{item.nomorTransaksi}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{formatTanggal(item.createdAtMs)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.tokoNama || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.kasirNama || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className="rounded-lg bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">
                      {item.metodePembayaranNama || "-"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{item.totalItem} item</td>
                  <td className="whitespace-nowrap px-3 py-3 font-black text-slate-800">{formatRupiah(item.grandTotal)}</td>
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setSelectedDetail(item)}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 text-[10px] font-black uppercase tracking-wide text-sky-700 shadow-sm transition hover:bg-sky-100"
                      title="Detail transaksi"
                    >
                      <Eye size={13} strokeWidth={2.6} />
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <div className="pt-1">
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
    </>
  )
}

function DetailModal({
  selectedDetail,
  setSelectedDetail,
}: {
  selectedDetail: Transaksi | null
  setSelectedDetail: (item: Transaksi | null) => void
}) {
  return (
    <AnimatePresence>
      {selectedDetail && (
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
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Detail Transaksi</p>
                <h2 className="truncate text-base font-black text-slate-800">{selectedDetail.nomorTransaksi}</h2>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{formatTanggal(selectedDetail.createdAtMs)}</p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
              >
                <X size={17} strokeWidth={2.5} />
              </button>
            </div>

            <div className="max-h-[calc(90vh-74px)] overflow-y-auto p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                <RiwayatStatCard icon={Store} label="Toko" value={selectedDetail.tokoNama || "-"} tone="sky" />
                <RiwayatStatCard icon={Wallet} label="Metode" value={selectedDetail.metodePembayaranNama || "-"} tone="blue" />
                <RiwayatStatCard icon={CircleDollarSign} label="Total" value={formatRupiah(selectedDetail.grandTotal)} tone="slate" />
                <RiwayatStatCard icon={BadgeDollarSign} label="Laba" value={formatRupiah(selectedDetail.estimasiLabaKotor)} tone="rose" />
              </div>

              <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-600">Kasir Konfirmasi</p>

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

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Item Transaksi</p>

                <div className="mt-4 space-y-3">
                  {selectedDetail.items?.map((detail, idx) => (
                    <div key={`${detail.barangId}-${idx}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">{detail.nama}</p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {detail.kodeBarang} · {detail.kategoriNama || "-"}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Qty</p>
                          <p className="text-sm font-black text-slate-800">{detail.qty}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <InfoMini label="Harga Asli" value={formatRupiah(detail.hargaAsli)} />
                        <InfoMini label="Harga Final" value={formatRupiah(detail.hargaSetelahDiskon)} tone="sky" />
                        <InfoMini label="Diskon" value={formatRupiah(detail.totalDiskon)} />
                        <InfoMini label="Subtotal" value={formatRupiah(detail.subtotalFinal)} />
                      </div>

                      {detail.diskonNama ? (
                        <div className="mt-3 inline-flex rounded-lg bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700">
                          {detail.diskonNama}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <SummaryCard title="Ringkasan Pembayaran">
                  <SummaryRow label="Subtotal" value={formatRupiah(selectedDetail.subtotal)} />
                  <SummaryRow label="Diskon" value={`- ${formatRupiah(selectedDetail.totalDiskon)}`} highlight="sky" />
                  <SummaryRow label="Biaya Admin" value={formatRupiah(selectedDetail.biayaAdminNominal)} />
                  <div className="border-t border-dashed border-slate-200 pt-3">
                    <SummaryRow label="Grand Total" value={formatRupiah(selectedDetail.grandTotal)} strong />
                  </div>
                </SummaryCard>

                <SummaryCard title="Pembayaran Pelanggan">
                  <SummaryRow label="Uang Bayar" value={formatRupiah(selectedDetail.uangBayar)} />
                  <SummaryRow label="Kembalian" value={formatRupiah(selectedDetail.kembalian)} highlight="sky" />
                  <SummaryRow label="Catatan" value={selectedDetail.catatan || "-"} />
                </SummaryCard>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function InfoMini({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "sky" }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`text-sm font-black ${tone === "sky" ? "text-sky-600" : "text-slate-800"}`}>{value}</p>
    </div>
  )
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  highlight = "slate",
  strong = false,
}: {
  label: string
  value: string
  highlight?: "slate" | "sky"
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className={`font-semibold ${strong ? "uppercase tracking-wide text-slate-500" : "text-slate-500"}`}>{label}</span>
      <span
        className={`max-w-[60%] text-right ${strong ? "text-lg" : "text-sm"} font-black ${
          highlight === "sky" ? "text-sky-600" : "text-slate-800"
        }`}
      >
        {value}
      </span>
    </div>
  )
}
