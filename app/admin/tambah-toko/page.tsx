// Halaman admin tambah toko untuk CRUD data toko, termasuk koordinat GPS.
// + Download template Excel & Import massal dari Excel

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Check,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import * as XLSX from "xlsx"

// ─── Types ────────────────────────────────────────────────────────────────────

type Toko = {
  id: string
  kode: string
  nama: string
  pemilik: string
  noHp: string
  alamat: string
  kota: string
  latitude: number | null
  longitude: number | null
  aktif: boolean
}

type ImportRow = {
  kode: string
  nama: string
  pemilik: string
  noHp: string
  kota: string
  latitude: number | null
  longitude: number | null
  alamat: string
  aktif: boolean
}

type ImportResult = {
  row: number
  nama: string
  status: "success" | "error" | "skipped"
  message: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseCoordinate = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null
  const cleaned = String(value).trim().replace(",", ".")
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

const validateImportRow = (r: ImportRow, idx: number): string | null => {
  if (!r.kode) return `Baris ${idx + 1}: Kode toko wajib diisi`
  if (!r.nama) return `Baris ${idx + 1}: Nama toko wajib diisi`
  if (!r.pemilik) return `Baris ${idx + 1}: Pemilik wajib diisi`
  if (!r.noHp) return `Baris ${idx + 1}: No HP wajib diisi`
  if (!r.kota) return `Baris ${idx + 1}: Kota wajib diisi`
  if (!r.alamat) return `Baris ${idx + 1}: Alamat wajib diisi`
  if (r.latitude === null || r.latitude < -90 || r.latitude > 90)
    return `Baris ${idx + 1}: Latitude tidak valid`
  if (r.longitude === null || r.longitude < -180 || r.longitude > 180)
    return `Baris ${idx + 1}: Longitude tidak valid`
  return null
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TambahTokoPage() {
  const [loading, setLoading] = useState(true)
  const [loadingSave, setLoadingSave] = useState(false)
  const [loadingUpdate, setLoadingUpdate] = useState(false)
  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null)

  const [data, setData] = useState<Toko[]>([])

  // Form fields
  const [kode, setKode] = useState("")
  const [nama, setNama] = useState("")
  const [pemilik, setPemilik] = useState("")
  const [noHp, setNoHp] = useState("")
  const [alamat, setAlamat] = useState("")
  const [kota, setKota] = useState("")
  const [latitude, setLatitude] = useState("")
  const [longitude, setLongitude] = useState("")
  const [aktif, setAktif] = useState(true)

  const [editTarget, setEditTarget] = useState<Toko | null>(null)
  const [search, setSearch] = useState("")
  const [openDelete, setOpenDelete] = useState<Toko | null>(null)

  // Import state
  const [showImportModal, setShowImportModal] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importResults, setImportResults] = useState<ImportResult[]>([])
  const [importStep, setImportStep] = useState<"upload" | "preview" | "result">("upload")
  const [importError, setImportError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchToko = async () => {
    const user = auth.currentUser
    if (!user) return
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, "toko"), orderBy("nama")))
      setData(
        snap.docs.map((s) => {
          const d = s.data() as any
          return {
            id: s.id,
            kode: d?.kode || "",
            nama: d?.nama || "",
            pemilik: d?.pemilik || "",
            noHp: d?.noHp || "",
            alamat: d?.alamat || "",
            kota: d?.kota || "",
            latitude: typeof d?.latitude === "number" && Number.isFinite(d.latitude) ? d.latitude : null,
            longitude: typeof d?.longitude === "number" && Number.isFinite(d.longitude) ? d.longitude : null,
            aktif: d?.aktif ?? true,
          }
        })
      )
    } catch (e) {
      console.error(e)
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) await fetchToko()
      else setLoading(false)
    })
    return () => unsub()
  }, [])

  // ── Filter ───────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim()
    if (!s) return data
    return data.filter((d) =>
      [d.kode, d.nama, d.pemilik, d.noHp, d.alamat, d.kota,
        String(d.latitude ?? ""), String(d.longitude ?? "")]
        .some((v) => v.toLowerCase().includes(s))
    )
  }, [data, search])

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setKode(""); setNama(""); setPemilik(""); setNoHp("")
    setAlamat(""); setKota(""); setLatitude(""); setLongitude("")
    setAktif(true); setEditTarget(null)
  }

  const mulaiEdit = (item: Toko) => {
    setEditTarget(item)
    setKode(item.kode || ""); setNama(item.nama || "")
    setPemilik(item.pemilik || ""); setNoHp(item.noHp || "")
    setAlamat(item.alamat || ""); setKota(item.kota || "")
    setLatitude(item.latitude !== null ? String(item.latitude) : "")
    setLongitude(item.longitude !== null ? String(item.longitude) : "")
    setAktif(item.aktif ?? true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const simpan = async () => {
    const user = auth.currentUser
    if (!user || loadingSave || loadingUpdate) return
    const kodeVal = kode.trim(), namaVal = nama.trim(), pemilikVal = pemilik.trim()
    const noHpVal = noHp.trim(), alamatVal = alamat.trim(), kotaVal = kota.trim()
    const latitudeVal = parseCoordinate(latitude), longitudeVal = parseCoordinate(longitude)
    if (!kodeVal || !namaVal || !pemilikVal || !noHpVal || !alamatVal || !kotaVal) return
    if (latitudeVal === null || longitudeVal === null) return
    setLoadingSave(true)
    try {
      const newRef = doc(collection(db, "toko"))
      await setDoc(newRef, {
        id: newRef.id, kode: kodeVal, nama: namaVal, pemilik: pemilikVal,
        noHp: noHpVal, alamat: alamatVal, kota: kotaVal,
        latitude: latitudeVal, longitude: longitudeVal, aktif,
        createdAt: Date.now(), createdBy: user.uid,
      })
      setData((prev) =>
        [{ id: newRef.id, kode: kodeVal, nama: namaVal, pemilik: pemilikVal,
           noHp: noHpVal, alamat: alamatVal, kota: kotaVal,
           latitude: latitudeVal, longitude: longitudeVal, aktif }, ...prev]
          .sort((a, b) => a.nama.localeCompare(b.nama, "id"))
      )
      resetForm()
    } catch (e) { console.error(e) }
    finally { setLoadingSave(false) }
  }

  const update = async () => {
    const user = auth.currentUser
    if (!user || !editTarget || loadingSave || loadingUpdate) return
    const kodeVal = kode.trim(), namaVal = nama.trim(), pemilikVal = pemilik.trim()
    const noHpVal = noHp.trim(), alamatVal = alamat.trim(), kotaVal = kota.trim()
    const latitudeVal = parseCoordinate(latitude), longitudeVal = parseCoordinate(longitude)
    if (!kodeVal || !namaVal || !pemilikVal || !noHpVal || !alamatVal || !kotaVal) return
    if (latitudeVal === null || longitudeVal === null) return
    setLoadingUpdate(true)
    try {
      const ref = doc(db, "toko", editTarget.id)
      await updateDoc(ref, {
        kode: kodeVal, nama: namaVal, pemilik: pemilikVal, noHp: noHpVal,
        alamat: alamatVal, kota: kotaVal, latitude: latitudeVal, longitude: longitudeVal,
        aktif, updatedAt: Date.now(), updatedBy: user.uid,
      })
      setData((prev) =>
        prev.map((x) =>
          x.id === editTarget.id
            ? { ...x, kode: kodeVal, nama: namaVal, pemilik: pemilikVal, noHp: noHpVal,
                alamat: alamatVal, kota: kotaVal, latitude: latitudeVal, longitude: longitudeVal, aktif }
            : x
        ).sort((a, b) => a.nama.localeCompare(b.nama, "id"))
      )
      resetForm()
    } catch (e) { console.error(e) }
    finally { setLoadingUpdate(false) }
  }

  const hapus = async () => {
    if (!openDelete || loadingDeleteId) return
    setLoadingDeleteId(openDelete.id)
    try {
      const ref = doc(db, "toko", openDelete.id)
      const snap = await getDoc(ref)
      if (snap.exists()) await deleteDoc(ref)
      if (editTarget?.id === openDelete.id) resetForm()
      setData((prev) => prev.filter((x) => x.id !== openDelete.id))
      setOpenDelete(null)
    } catch (e) { console.error(e) }
    finally { setLoadingDeleteId(null) }
  }

  const canSubmit = useMemo(
    () =>
      !!kode.trim() && !!nama.trim() && !!pemilik.trim() && !!noHp.trim() &&
      !!alamat.trim() && !!kota.trim() &&
      parseCoordinate(latitude) !== null && parseCoordinate(longitude) !== null &&
      !loadingSave && !loadingUpdate,
    [kode, nama, pemilik, noHp, alamat, kota, latitude, longitude, loadingSave, loadingUpdate]
  )

  // ── Download Template ────────────────────────────────────────────────────────

  const handleDownloadTemplate = () => {
    const link = document.createElement("a")
    link.href = "/templates/template_import_toko.xlsx"
    link.download = "template_import_toko.xlsx"
    link.click()
  }

  // ── Import Excel ─────────────────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: "array" })

        const sheetName = workbook.SheetNames.find((s) => s === "Import Toko") ?? workbook.SheetNames[0]
        const ws = workbook.Sheets[sheetName]
        // range: 5 → skip 5 baris header (banner + petunjuk + spacer + kolom)
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { range: 5, defval: "" })

        const parsed: ImportRow[] = rows
          .filter((r) => r["Kode Toko *"] || r["Nama Toko *"])
          .map((r) => ({
            kode: String(r["Kode Toko *"] || "").trim(),
            nama: String(r["Nama Toko *"] || "").trim(),
            pemilik: String(r["Pemilik *"] || "").trim(),
            noHp: String(r["No HP *"] || "").trim(),
            kota: String(r["Kota *"] || "").trim(),
            latitude: parseCoordinate(r["Latitude *"]),
            longitude: parseCoordinate(r["Longitude *"]),
            alamat: String(r["Alamat *"] || "").trim(),
            aktif: String(r["Status Aktif"] || "aktif").trim().toLowerCase() !== "nonaktif",
          }))

        if (parsed.length === 0) {
          setImportError("Tidak ada data yang ditemukan. Pastikan file menggunakan template yang benar.")
          return
        }
        if (parsed.length > 100) {
          setImportError(`Maksimal 100 baris data per import. File Anda memiliki ${parsed.length} baris.`)
          return
        }

        setImportRows(parsed)
        setImportStep("preview")
      } catch {
        setImportError("Gagal membaca file. Pastikan format .xlsx dan menggunakan template yang benar.")
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ""
  }

  const handleImport = async () => {
    const user = auth.currentUser
    if (!user || importRows.length === 0) return

    setImportLoading(true)
    const results: ImportResult[] = []
    const existingKode = new Set(data.map((d) => d.kode.toLowerCase()))

    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i]

      const validationErr = validateImportRow(row, i)
      if (validationErr) {
        results.push({ row: i + 1, nama: row.nama || `Baris ${i + 1}`, status: "error", message: validationErr })
        continue
      }

      if (existingKode.has(row.kode.toLowerCase())) {
        results.push({ row: i + 1, nama: row.nama, status: "skipped", message: `Kode "${row.kode}" sudah terdaftar` })
        continue
      }

      try {
        const newRef = doc(collection(db, "toko"))
        await setDoc(newRef, {
          id: newRef.id,
          kode: row.kode, nama: row.nama, pemilik: row.pemilik, noHp: row.noHp,
          alamat: row.alamat, kota: row.kota,
          latitude: row.latitude, longitude: row.longitude,
          aktif: row.aktif,
          createdAt: Date.now(), createdBy: user.uid,
        })
        existingKode.add(row.kode.toLowerCase())
        results.push({ row: i + 1, nama: row.nama, status: "success", message: "Berhasil ditambahkan" })
      } catch {
        results.push({ row: i + 1, nama: row.nama, status: "error", message: "Gagal menyimpan ke database" })
      }
    }

    setImportResults(results)
    setImportStep("result")
    setImportLoading(false)

    const successCount = results.filter((r) => r.status === "success").length
    if (successCount > 0) {
      fetchToko()
      setSuccessMsg(`${successCount} toko berhasil diimport`)
      setTimeout(() => setSuccessMsg(null), 4000)
    }
  }

  const closeImportModal = () => {
    if (importLoading) return
    setShowImportModal(false)
    setImportRows([])
    setImportResults([])
    setImportStep("upload")
    setImportError(null)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-5 text-slate-900 overflow-x-hidden">

      {/* ── Header Banner ── */}
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
                Kode toko · nama toko · pemilik · kota · GPS toko
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-slate-200 bg-white text-slate-600 text-[10px] font-black uppercase tracking-wide shadow-sm hover:bg-slate-50 transition-all"
              title="Download Template Excel"
            >
              <Download size={13} strokeWidth={2.5} />
              <span className="hidden sm:inline">Template</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 text-[10px] font-black uppercase tracking-wide shadow-sm hover:bg-cyan-100 transition-all"
              title="Import dari Excel"
            >
              <Upload size={13} strokeWidth={2.5} />
              <span className="hidden sm:inline">Import</span>
            </motion.button>
          </div>
        </div>

        <div className="absolute right-0 top-0 opacity-[0.03] pointer-events-none">
          <Cpu size={140} strokeWidth={1} />
        </div>
      </motion.div>

      {/* ── Success Toast ── */}
      <AnimatePresence>
        {successMsg && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
              <Check size={11} className="text-white" strokeWidth={3} />
            </div>
            <p className="text-[11px] font-bold text-emerald-700">{successMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Form Tambah / Edit ── */}
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
            {[
              { label: "Kode Toko", val: kode, set: setKode },
              { label: "Nama Toko", val: nama, set: setNama },
              { label: "Pemilik", val: pemilik, set: setPemilik },
              { label: "No HP", val: noHp, set: setNoHp },
              { label: "Kota", val: kota, set: setKota },
            ].map(({ label, val, set }) => (
              <div key={label}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                <input
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
                />
              </div>
            ))}

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Status</p>
              <select
                value={aktif ? "aktif" : "nonaktif"}
                onChange={(e) => setAktif(e.target.value === "aktif")}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
              >
                <option value="aktif">Aktif</option>
                <option value="nonaktif">Nonaktif</option>
              </select>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Latitude</p>
              <input
                type="number" step="any" value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="-7.257472"
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Longitude</p>
              <input
                type="number" step="any" value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="112.752090"
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Preview Koordinat</p>
              <div className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 min-h-[46px] flex items-center">
                {parseCoordinate(latitude) !== null && parseCoordinate(longitude) !== null
                  ? `${parseCoordinate(latitude)}, ${parseCoordinate(longitude)}`
                  : <span className="text-slate-300 font-normal">Belum diisi</span>}
              </div>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Alamat</p>
              <textarea
                value={alamat} onChange={(e) => setAlamat(e.target.value)} rows={3}
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
              ) : editTarget ? <Pencil size={16} /> : <Plus size={16} />}
              {loadingSave || loadingUpdate ? "Memproses..." : editTarget ? "Update Toko" : "Simpan Toko"}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={resetForm}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-slate-200 bg-white font-bold text-slate-600 text-sm hover:bg-slate-50 transition-colors shadow-sm"
            >
              {editTarget ? <><X size={16} />Batal Edit</> : "Reset"}
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ── Search ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08 }}
        className="flex flex-wrap gap-2 sm:gap-3"
      >
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" strokeWidth={2.5} />
          <input
            placeholder="Cari kode/nama toko/pemilik/kota/koordinat..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
          />
        </div>
      </motion.div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-blue-500" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Memuat data toko...</p>
          </div>
        </div>
      )}

      {/* ── Mobile Cards ── */}
      {!loading && (
        <div className="sm:hidden space-y-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <Store size={28} className="text-slate-300" strokeWidth={2} />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Data toko belum tersedia</p>
              <div className="flex gap-2 flex-wrap justify-center">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700 text-xs font-black">
                  <Upload size={13} strokeWidth={2.5} />Import Excel
                </motion.button>
              </div>
            </div>
          ) : (
            filtered.map((d, idx) => (
              <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.04 }}
                className="rounded-xl border border-slate-200 border-l-4 border-l-blue-400 bg-white p-3 shadow-sm flex items-start justify-between gap-3 max-w-full overflow-hidden">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-800 break-words leading-tight">{d.nama}</p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5 break-words">
                    {d.kode || "-"} · {d.kota || "-"}
                  </p>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-semibold text-slate-600 flex items-center gap-1"><Phone size={12} /> {d.noHp || "-"}</p>
                    <p className="text-xs font-semibold text-slate-600 flex items-center gap-1"><MapPin size={12} /> {d.alamat || "-"}</p>
                    <p className="text-xs font-semibold text-slate-600 break-all">GPS: {d.latitude ?? "-"}, {d.longitude ?? "-"}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 w-auto min-w-[90px] max-w-[110px] flex-shrink-0">
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => mulaiEdit(d)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-black bg-gradient-to-r from-amber-400 to-orange-500 shadow-amber-200/50 shadow-sm">
                    <Pencil size={12} strokeWidth={2.5} />Edit
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setOpenDelete(d)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-black bg-gradient-to-r from-rose-400 to-red-500 shadow-rose-200/50 shadow-sm">
                    <Trash2 size={12} strokeWidth={2.5} />Hapus
                  </motion.button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* ── Desktop Table ── */}
      {!loading && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
          className="hidden sm:block overflow-hidden rounded-xl border border-slate-200 bg-white/60 backdrop-blur-xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/70 border-b border-slate-200">
                <tr>
                  {["No", "Kode", "Nama Toko", "Pemilik", "No HP", "Kota", "GPS", "Status", "Aksi"].map((h, i) => (
                    <th key={h} className={`px-4 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 ${i === 0 || i === 8 ? "text-center" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <Building2 size={24} className="text-slate-300" strokeWidth={2} />
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Data toko belum tersedia</p>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          onClick={() => setShowImportModal(true)}
                          className="flex items-center gap-2 px-4 py-2 rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700 text-xs font-black">
                          <Upload size={13} strokeWidth={2.5} />Import Excel
                        </motion.button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((d, idx) => (
                    <motion.tr key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: idx * 0.04 }}
                      className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-center text-xs font-bold text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3 text-xs font-black text-slate-700">{d.kode || "-"}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{d.nama}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs font-semibold">{d.pemilik}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs font-semibold">{d.noHp}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs font-semibold">{d.kota}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs font-semibold whitespace-nowrap">
                        {d.latitude ?? "-"}, {d.longitude ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${d.aktif ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                          {d.aktif ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => mulaiEdit(d)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-black bg-gradient-to-r from-amber-400 to-orange-500 shadow-amber-200/50 shadow-sm hover:shadow-md">
                            <Pencil size={12} strokeWidth={2.5} />Edit
                          </motion.button>
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setOpenDelete(d)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-black bg-gradient-to-r from-rose-400 to-red-500 shadow-rose-200/50 shadow-sm hover:shadow-md">
                            <Trash2 size={12} strokeWidth={2.5} />Hapus
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

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: Hapus Toko
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {openDelete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
              <div className="relative overflow-hidden p-5 bg-gradient-to-br from-rose-400 to-red-500">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
                    <Trash2 size={20} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white tracking-tight leading-none">Hapus Toko</h2>
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
                <p className="text-[11px] font-semibold text-slate-600">Kamu yakin mau menghapus toko ini?</p>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-black text-slate-800">{openDelete.nama}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                    {openDelete.kode || "-"} · {openDelete.kota || "-"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 px-5 pb-5">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setOpenDelete(null)}
                  className="flex-1 py-2.5 rounded-full border border-slate-200 bg-white font-bold text-slate-600 text-sm hover:bg-slate-50 transition-colors shadow-sm">
                  Batal
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={hapus} disabled={loadingDeleteId === openDelete.id}
                  className="flex-1 py-2.5 rounded-full bg-gradient-to-r from-rose-400 to-red-500 font-black text-white text-[11px] uppercase tracking-[0.1em] shadow-lg shadow-rose-200/50 disabled:opacity-60 disabled:cursor-not-allowed">
                  {loadingDeleteId === openDelete.id
                    ? <span className="inline-flex items-center gap-2 justify-center"><Loader2 size={16} className="animate-spin" />Menghapus...</span>
                    : "Hapus"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: Import Excel
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showImportModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget && !importLoading) closeImportModal() }}>
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

              {/* Header */}
              <div className="relative flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    <FileSpreadsheet size={18} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white leading-none">Import Data Toko</h2>
                    <p className="text-[10px] text-white/70 font-semibold mt-0.5">
                      {importStep === "upload" && "Upload file Excel template"}
                      {importStep === "preview" && `${importRows.length} baris siap diimport`}
                      {importStep === "result" && "Hasil import selesai"}
                    </p>
                  </div>
                </div>
                {!importLoading && (
                  <button onClick={closeImportModal}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors">
                    <X size={16} strokeWidth={2.5} />
                  </button>
                )}
              </div>

              {/* Step indicator */}
              <div className="flex items-center gap-0 px-6 py-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
                {[{ key: "upload", label: "Upload" }, { key: "preview", label: "Preview" }, { key: "result", label: "Hasil" }].map((step, idx) => (
                  <div key={step.key} className="flex items-center">
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${importStep === step.key ? "bg-blue-500 text-white" : (["upload", "preview", "result"].indexOf(importStep) > idx ? "text-emerald-600" : "text-slate-400")}`}>
                      {["upload", "preview", "result"].indexOf(importStep) > idx
                        ? <Check size={10} strokeWidth={3} />
                        : <span>{idx + 1}</span>}
                      {step.label}
                    </div>
                    {idx < 2 && <div className="w-6 h-px bg-slate-200 mx-1" />}
                  </div>
                ))}
              </div>

              <div className="overflow-y-auto flex-1 p-6 space-y-4">

                {/* Step 1: Upload */}
                {importStep === "upload" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
                      <FileSpreadsheet size={20} className="text-blue-600 flex-shrink-0" strokeWidth={2} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-blue-800">Belum punya template?</p>
                        <p className="text-[10px] text-blue-600 font-semibold mt-0.5">
                          Download template Excel, isi data termasuk koordinat GPS, lalu upload di sini.
                        </p>
                      </div>
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        onClick={handleDownloadTemplate}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-[10px] font-black flex-shrink-0">
                        <Download size={11} strokeWidth={2.5} />Download
                      </motion.button>
                    </div>

                    {importError && (
                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                        <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                        <p className="text-[11px] font-bold text-red-600">{importError}</p>
                      </div>
                    )}

                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
                    <motion.div whileHover={{ scale: 1.01 }} onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer transition-all">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                        <Upload size={28} className="text-slate-400" strokeWidth={1.5} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-black text-slate-600">Klik untuk pilih file</p>
                        <p className="text-[10px] text-slate-400 font-semibold mt-1">Format: .xlsx · Maks. 100 baris data</p>
                      </div>
                    </motion.div>

                    {/* GPS hint */}
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-200">
                      <MapPin size={14} className="text-violet-500 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                      <p className="text-[10px] font-semibold text-violet-700">
                        <span className="font-black">Tip GPS:</span> Buka Google Maps → klik kanan lokasi toko → salin koordinat yang muncul. Contoh Surabaya: <span className="font-mono font-black">-7.257472, 112.752090</span>
                      </p>
                    </div>
                  </div>
                )}

                {/* Step 2: Preview */}
                {importStep === "preview" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-slate-700">{importRows.length} baris ditemukan</p>
                      <button onClick={() => { setImportStep("upload"); setImportRows([]) }}
                        className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline">
                        Ganti File
                      </button>
                    </div>

                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="overflow-x-auto max-h-72">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                            <tr>
                              {["#", "Kode", "Nama Toko", "Pemilik", "Kota", "Lat", "Lon", "Status"].map((h) => (
                                <th key={h} className="px-3 py-2 text-[9px] font-black uppercase tracking-wide text-slate-400 text-left whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {importRows.map((r, i) => {
                              const err = validateImportRow(r, i)
                              return (
                                <tr key={i} className={`border-t border-slate-100 ${err ? "bg-red-50" : i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                                  <td className="px-3 py-2 text-slate-400 font-bold">{i + 1}</td>
                                  <td className="px-3 py-2 font-black text-slate-700 whitespace-nowrap">{r.kode || <span className="text-red-400">—</span>}</td>
                                  <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{r.nama || <span className="text-red-400">—</span>}</td>
                                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.pemilik || "—"}</td>
                                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.kota || "—"}</td>
                                  <td className={`px-3 py-2 font-mono whitespace-nowrap ${r.latitude === null ? "text-red-500" : "text-slate-600"}`}>
                                    {r.latitude ?? <span className="text-red-400">—</span>}
                                  </td>
                                  <td className={`px-3 py-2 font-mono whitespace-nowrap ${r.longitude === null ? "text-red-500" : "text-slate-600"}`}>
                                    {r.longitude ?? <span className="text-red-400">—</span>}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.aktif ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                                      {r.aktif ? "Aktif" : "Nonaktif"}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {importRows.some((r, i) => validateImportRow(r, i)) && (
                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                        <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                        <p className="text-[11px] font-bold text-amber-700">
                          Beberapa baris memiliki error (ditandai merah) dan akan dilewati saat import.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: Result */}
                {importStep === "result" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Berhasil", count: importResults.filter(r => r.status === "success").length, color: "emerald" },
                        { label: "Dilewati", count: importResults.filter(r => r.status === "skipped").length, color: "amber" },
                        { label: "Gagal",    count: importResults.filter(r => r.status === "error").length,   color: "red" },
                      ].map(({ label, count, color }) => (
                        <div key={label} className={`rounded-xl p-3 text-center bg-${color}-50 border border-${color}-200`}>
                          <p className={`text-2xl font-black text-${color}-600`}>{count}</p>
                          <p className={`text-[10px] font-bold uppercase tracking-wide text-${color}-500 mt-0.5`}>{label}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-slate-200 overflow-hidden max-h-60 overflow-y-auto">
                      {importResults.map((r, i) => (
                        <div key={i} className={`flex items-center gap-2 px-3 py-2 border-b last:border-b-0 border-slate-100 ${r.status === "success" ? "bg-white" : r.status === "skipped" ? "bg-amber-50" : "bg-red-50"}`}>
                          {r.status === "success"
                            ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" strokeWidth={2.5} />
                            : r.status === "skipped"
                            ? <AlertCircle size={14} className="text-amber-500 flex-shrink-0" strokeWidth={2.5} />
                            : <XCircle size={14} className="text-red-500 flex-shrink-0" strokeWidth={2.5} />}
                          <span className="text-xs font-bold text-slate-700 flex-shrink-0 w-5 text-right">{r.row}</span>
                          <span className="text-xs font-semibold text-slate-800 min-w-0 truncate">{r.nama}</span>
                          <span className={`text-[10px] font-semibold ml-auto flex-shrink-0 ${r.status === "success" ? "text-emerald-600" : r.status === "skipped" ? "text-amber-600" : "text-red-600"}`}>
                            {r.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex gap-3 justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex-shrink-0">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={closeImportModal} disabled={importLoading}
                  className="px-5 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-600 text-sm font-black hover:bg-slate-50 disabled:opacity-50 transition-colors">
                  {importStep === "result" ? "Tutup" : "Batal"}
                </motion.button>

                {importStep === "preview" && (
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleImport} disabled={importLoading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-black shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-all">
                    {importLoading
                      ? <><Loader2 size={14} className="animate-spin" strokeWidth={2.5} />Mengimport {importRows.length} toko...</>
                      : <><Upload size={14} strokeWidth={2.5} />Import {importRows.length} Toko</>}
                  </motion.button>
                )}

                {importStep === "result" && importResults.some((r) => r.status !== "success") && (
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => { setImportStep("upload"); setImportRows([]); setImportResults([]) }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-700 text-sm font-black">
                    <Upload size={14} strokeWidth={2.5} />Import Lagi
                  </motion.button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}