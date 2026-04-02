// Halaman admin tambah toko untuk CRUD data toko dengan UI modern seperti referensi input mapel.
// Menggunakan Firebase Firestore, responsive mobile/desktop, search, edit, hapus, dan modal konfirmasi.

"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  updateDoc,
} from "firebase/firestore"

import {
  Store,
  Search,
  Cpu,
  Trash2,
  Plus,
  Loader2,
  Building2,
  Pencil,
  X,
  MapPin,
  Phone,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type Toko = {
  id: string
  kode: string
  nama: string
  pemilik: string
  noHp: string
  alamat: string
  kota: string
  aktif: boolean
}

export default function TambahTokoPage() {
  const [loading, setLoading] = useState(true)
  const [loadingSave, setLoadingSave] = useState(false)
  const [loadingUpdate, setLoadingUpdate] = useState(false)
  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null)

  const [data, setData] = useState<Toko[]>([])

  const [kode, setKode] = useState("")
  const [nama, setNama] = useState("")
  const [pemilik, setPemilik] = useState("")
  const [noHp, setNoHp] = useState("")
  const [alamat, setAlamat] = useState("")
  const [kota, setKota] = useState("")
  const [aktif, setAktif] = useState(true)

  const [editTarget, setEditTarget] = useState<Toko | null>(null)
  const [search, setSearch] = useState("")
  const [openDelete, setOpenDelete] = useState<Toko | null>(null)

  const fetchToko = async () => {
    const user = auth.currentUser
    if (!user) return

    setLoading(true)
    try {
      const qRef = query(collection(db, "toko"), orderBy("nama"))
      const snap = await getDocs(qRef)

      const list: Toko[] = snap.docs.map((s) => {
        const d = s.data() as any
        return {
          id: s.id,
          kode: d?.kode || "",
          nama: d?.nama || "",
          pemilik: d?.pemilik || "",
          noHp: d?.noHp || "",
          alamat: d?.alamat || "",
          kota: d?.kota || "",
          aktif: d?.aktif ?? true,
        }
      })

      setData(list)
    } catch (e) {
      console.error(e)
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        await fetchToko()
      } else {
        setLoading(false)
      }
    })

    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim()
    if (!s) return data

    return data.filter((d) => {
      return (
        (d.kode || "").toLowerCase().includes(s) ||
        (d.nama || "").toLowerCase().includes(s) ||
        (d.pemilik || "").toLowerCase().includes(s) ||
        (d.noHp || "").toLowerCase().includes(s) ||
        (d.alamat || "").toLowerCase().includes(s) ||
        (d.kota || "").toLowerCase().includes(s)
      )
    })
  }, [data, search])

  const resetForm = () => {
    setKode("")
    setNama("")
    setPemilik("")
    setNoHp("")
    setAlamat("")
    setKota("")
    setAktif(true)
    setEditTarget(null)
  }

  const mulaiEdit = (item: Toko) => {
    setEditTarget(item)
    setKode(item.kode || "")
    setNama(item.nama || "")
    setPemilik(item.pemilik || "")
    setNoHp(item.noHp || "")
    setAlamat(item.alamat || "")
    setKota(item.kota || "")
    setAktif(item.aktif ?? true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const simpan = async () => {
    const user = auth.currentUser
    if (!user) return
    if (loadingSave || loadingUpdate) return

    const kodeVal = kode.trim()
    const namaVal = nama.trim()
    const pemilikVal = pemilik.trim()
    const noHpVal = noHp.trim()
    const alamatVal = alamat.trim()
    const kotaVal = kota.trim()

    if (!kodeVal || !namaVal || !pemilikVal || !noHpVal || !alamatVal || !kotaVal) return

    setLoadingSave(true)
    try {
      const newRef = doc(collection(db, "toko"))
      await setDoc(newRef, {
        id: newRef.id,
        kode: kodeVal,
        nama: namaVal,
        pemilik: pemilikVal,
        noHp: noHpVal,
        alamat: alamatVal,
        kota: kotaVal,
        aktif,
        createdAt: Date.now(),
        createdBy: user.uid,
      })

      setData((prev) =>
        [
          {
            id: newRef.id,
            kode: kodeVal,
            nama: namaVal,
            pemilik: pemilikVal,
            noHp: noHpVal,
            alamat: alamatVal,
            kota: kotaVal,
            aktif,
          },
          ...prev,
        ].sort((a, b) => (a.nama || "").localeCompare(b.nama || "", "id"))
      )

      resetForm()
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingSave(false)
    }
  }

  const update = async () => {
    const user = auth.currentUser
    if (!user) return
    if (!editTarget) return
    if (loadingSave || loadingUpdate) return

    const kodeVal = kode.trim()
    const namaVal = nama.trim()
    const pemilikVal = pemilik.trim()
    const noHpVal = noHp.trim()
    const alamatVal = alamat.trim()
    const kotaVal = kota.trim()

    if (!kodeVal || !namaVal || !pemilikVal || !noHpVal || !alamatVal || !kotaVal) return

    setLoadingUpdate(true)
    try {
      const ref = doc(db, "toko", editTarget.id)
      await updateDoc(ref, {
        kode: kodeVal,
        nama: namaVal,
        pemilik: pemilikVal,
        noHp: noHpVal,
        alamat: alamatVal,
        kota: kotaVal,
        aktif,
        updatedAt: Date.now(),
        updatedBy: user.uid,
      })

      setData((prev) =>
        prev
          .map((x) =>
            x.id === editTarget.id
              ? {
                  ...x,
                  kode: kodeVal,
                  nama: namaVal,
                  pemilik: pemilikVal,
                  noHp: noHpVal,
                  alamat: alamatVal,
                  kota: kotaVal,
                  aktif,
                }
              : x
          )
          .sort((a, b) => (a.nama || "").localeCompare(b.nama || "", "id"))
      )

      resetForm()
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingUpdate(false)
    }
  }

  const hapus = async () => {
    if (!openDelete) return
    if (loadingDeleteId) return

    setLoadingDeleteId(openDelete.id)
    try {
      const ref = doc(db, "toko", openDelete.id)
      const snap = await getDoc(ref)
      if (snap.exists()) await deleteDoc(ref)

      if (editTarget?.id === openDelete.id) resetForm()
      setData((prev) => prev.filter((x) => x.id !== openDelete.id))
      setOpenDelete(null)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingDeleteId(null)
    }
  }

  const canSubmit = useMemo(() => {
    return (
      !!kode.trim() &&
      !!nama.trim() &&
      !!pemilik.trim() &&
      !!noHp.trim() &&
      !!alamat.trim() &&
      !!kota.trim() &&
      !loadingSave &&
      !loadingUpdate
    )
  }, [kode, nama, pemilik, noHp, alamat, kota, loadingSave, loadingUpdate])

  return (
    <div className="space-y-4 sm:space-y-5 text-slate-900 overflow-x-hidden">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-xl border-l-4 border-l-blue-500 border-t border-r border-b border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-cyan-500 shadow-lg shadow-blue-200/50">
              <Store size={24} className="text-white sm:w-7 sm:h-7" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight leading-none">
                Tambah Toko
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-1">
                Kode toko · nama toko · pemilik · kota
              </p>
            </div>
          </div>
        </div>

        <div className="absolute right-0 top-0 opacity-[0.03] pointer-events-none">
          <Cpu size={140} strokeWidth={1} />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="overflow-hidden rounded-xl border border-slate-200 bg-white/60 backdrop-blur-xl shadow-sm"
      >
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-white/70">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            {editTarget ? "Edit Toko" : "Tambah Toko Baru"}
          </p>
        </div>

        <div className="p-4 sm:p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                Kode Toko
              </p>
              <input
                value={kode}
                onChange={(e) => setKode(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                Nama Toko
              </p>
              <input
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                Pemilik
              </p>
              <input
                value={pemilik}
                onChange={(e) => setPemilik(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                No HP
              </p>
              <input
                value={noHp}
                onChange={(e) => setNoHp(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                Kota
              </p>
              <input
                value={kota}
                onChange={(e) => setKota(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                Status
              </p>
              <select
                value={aktif ? "aktif" : "nonaktif"}
                onChange={(e) => setAktif(e.target.value === "aktif")}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
              >
                <option value="aktif">Aktif</option>
                <option value="nonaktif">Nonaktif</option>
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                Alamat
              </p>
              <textarea
                value={alamat}
                onChange={(e) => setAlamat(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <motion.button
              whileHover={canSubmit ? { scale: 1.02 } : {}}
              whileTap={canSubmit ? { scale: 0.98 } : {}}
              onClick={editTarget ? update : simpan}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-blue-400 to-cyan-500 font-black text-white text-[11px] uppercase tracking-[0.1em] shadow-lg shadow-blue-200/50 hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingSave || loadingUpdate ? (
                <Loader2 size={16} className="animate-spin" />
              ) : editTarget ? (
                <Pencil size={16} />
              ) : (
                <Plus size={16} />
              )}
              {loadingSave || loadingUpdate
                ? "Memproses..."
                : editTarget
                ? "Update Toko"
                : "Simpan Toko"}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={resetForm}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-slate-200 bg-white font-bold text-slate-600 text-sm hover:bg-slate-50 transition-colors shadow-sm"
            >
              {editTarget ? (
                <>
                  <X size={16} />
                  Batal Edit
                </>
              ) : (
                "Reset"
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08 }}
        className="flex flex-wrap gap-2 sm:gap-3"
      >
        <div className="relative flex-1 min-w-[180px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            strokeWidth={2.5}
          />
          <input
            placeholder="Cari kode/nama toko/pemilik/kota..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
          />
        </div>
      </motion.div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-blue-500"
            />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Memuat data toko...
            </p>
          </div>
        </div>
      )}

      {!loading && (
        <div className="sm:hidden space-y-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <Store size={28} className="text-slate-300" strokeWidth={2} />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Data toko belum tersedia
              </p>
            </div>
          ) : (
            filtered.map((d, idx) => (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.04 }}
                className="rounded-xl border border-slate-200 border-l-4 border-l-blue-400 bg-white p-3 shadow-sm flex items-start justify-between gap-3 max-w-full overflow-hidden"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-800 break-words whitespace-normal leading-tight">
                    {d.nama}
                  </p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5 leading-tight break-words whitespace-normal">
                    {d.kode || "-"} · {d.kota || "-"}
                  </p>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                      <Phone size={12} /> {d.noHp || "-"}
                    </p>
                    <p className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                      <MapPin size={12} /> {d.alamat || "-"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 w-auto min-w-[90px] max-w-[110px] flex-shrink-0">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => mulaiEdit(d)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-black shadow-sm transition-all bg-gradient-to-r from-amber-400 to-orange-500 shadow-amber-200/50"
                  >
                    <Pencil size={12} strokeWidth={2.5} />
                    Edit
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setOpenDelete(d)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-black shadow-sm transition-all bg-gradient-to-r from-rose-400 to-red-500 shadow-rose-200/50"
                  >
                    <Trash2 size={12} strokeWidth={2.5} />
                    Hapus
                  </motion.button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {!loading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="hidden sm:block overflow-hidden rounded-xl border border-slate-200 bg-white/60 backdrop-blur-xl shadow-sm"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/70 border-b border-slate-200">
                <tr>
                  {["No", "Kode", "Nama Toko", "Pemilik", "No HP", "Kota", "Status", "Aksi"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 ${
                          i === 0 || i === 7 ? "text-center" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <Building2 size={24} className="text-slate-300" strokeWidth={2} />
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Data toko belum tersedia
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((d, idx) => (
                    <motion.tr
                      key={d.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: idx * 0.04 }}
                      className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="px-4 py-3 text-center text-xs font-bold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 text-xs font-black text-slate-700">{d.kode || "-"}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{d.nama}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs font-semibold">{d.pemilik}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs font-semibold">{d.noHp}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs font-semibold">{d.kota}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                            d.aktif
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {d.aktif ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => mulaiEdit(d)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-black shadow-sm transition-all bg-gradient-to-r from-amber-400 to-orange-500 shadow-amber-200/50 hover:shadow-md"
                          >
                            <Pencil size={12} strokeWidth={2.5} />
                            Edit
                          </motion.button>

                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setOpenDelete(d)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-black shadow-sm transition-all bg-gradient-to-r from-rose-400 to-red-500 shadow-rose-200/50 hover:shadow-md"
                          >
                            <Trash2 size={12} strokeWidth={2.5} />
                            Hapus
                          </motion.button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {openDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden"
            >
              <div className="relative overflow-hidden p-5 bg-gradient-to-br from-rose-400 to-red-500">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
                    <Trash2 size={20} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white tracking-tight leading-none">
                      Hapus Toko
                    </h2>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/70 mt-0.5 truncate max-w-[220px]">
                      {openDelete.nama}
                    </p>
                  </div>
                </div>
                <div className="absolute right-0 top-0 opacity-10 pointer-events-none">
                  <Cpu size={100} strokeWidth={1} className="text-white" />
                </div>
              </div>

              <div className="p-5 space-y-3">
                <p className="text-[11px] font-semibold text-slate-600">
                  Kamu yakin mau menghapus toko ini?
                </p>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-black text-slate-800">{openDelete.nama}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                    {openDelete.kode || "-"} · {openDelete.kota || "-"}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 px-5 pb-5">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setOpenDelete(null)}
                  className="flex-1 py-2.5 rounded-full border border-slate-200 bg-white font-bold text-slate-600 text-sm hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Batal
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={hapus}
                  disabled={loadingDeleteId === openDelete.id}
                  className="flex-1 py-2.5 rounded-full bg-gradient-to-r from-rose-400 to-red-500 font-black text-white text-[11px] uppercase tracking-[0.1em] shadow-lg shadow-rose-200/50 hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loadingDeleteId === openDelete.id ? (
                    <span className="inline-flex items-center gap-2 justify-center">
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
    </div>
  )
}