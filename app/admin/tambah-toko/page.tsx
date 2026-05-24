// Halaman admin tambah toko untuk CRUD data toko, termasuk koordinat GPS.
// + Download template Excel & Import massal dari Excel
// + Tab Atur Lokasi Absensi toko
// Revisi layout:
// - Tema dibuat konsisten biru muda dan mengikuti shell layout putih.
// - Ditambah tab "Data Toko" dan "Atur Lokasi Absensi".
// - Desktop tetap punya mode input/detail.
// - Mobile tidak memakai tab input/detail; tap toko membuka popup edit data.
// - Tab lokasi: desktop memakai form sisi kanan, mobile klik toko membuka popup GPS.
// - Card mobile dibuat satu lapis agar tidak saling tindih.
// - Logika CRUD/import toko tetap dipertahankan.
// - Simpan lokasi absensi menulis latitude, longitude, dan lokasiAbsensi { lat, lng, radiusKm }.

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
  Navigation,
  Crosshair,
  Save,
  RefreshCcw,
  ListFilter,
  ChevronDown,
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
  radiusKm: number | null
  aktif: boolean
  lokasiAbsensi?: {
    lat?: number
    lng?: number
    radiusKm?: number
  } | null
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

type ActiveTab = "data" | "lokasi"
type DataSubTab = "input" | "detail"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseCoordinate = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null
  const cleaned = String(value).trim().replace(",", ".")
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

const parseRadius = (value: string | number | null | undefined): number | null => {
  const parsed = parseCoordinate(value)
  if (parsed === null || parsed <= 0) return null
  return parsed
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

const getTokoLat = (d: any): number | null => {
  if (typeof d?.lokasiAbsensi?.lat === "number" && Number.isFinite(d.lokasiAbsensi.lat)) return d.lokasiAbsensi.lat
  if (typeof d?.lokasiAbsensi?.latitude === "number" && Number.isFinite(d.lokasiAbsensi.latitude)) return d.lokasiAbsensi.latitude
  if (typeof d?.latitude === "number" && Number.isFinite(d.latitude)) return d.latitude
  if (typeof d?.lat === "number" && Number.isFinite(d.lat)) return d.lat
  return null
}

const getTokoLng = (d: any): number | null => {
  if (typeof d?.lokasiAbsensi?.lng === "number" && Number.isFinite(d.lokasiAbsensi.lng)) return d.lokasiAbsensi.lng
  if (typeof d?.lokasiAbsensi?.longitude === "number" && Number.isFinite(d.lokasiAbsensi.longitude)) return d.lokasiAbsensi.longitude
  if (typeof d?.longitude === "number" && Number.isFinite(d.longitude)) return d.longitude
  if (typeof d?.lng === "number" && Number.isFinite(d.lng)) return d.lng
  return null
}

const getTokoRadius = (d: any): number | null => {
  if (typeof d?.lokasiAbsensi?.radiusKm === "number" && Number.isFinite(d.lokasiAbsensi.radiusKm)) return d.lokasiAbsensi.radiusKm
  if (typeof d?.radiusKm === "number" && Number.isFinite(d.radiusKm)) return d.radiusKm
  if (typeof d?.radius === "number" && Number.isFinite(d.radius)) return d.radius
  return null
}

const syncNamaTokoByTokoId = async ({
  tokoId,
  tokoNama,
  adminUid,
}: {
  tokoId: string
  tokoNama: string
  adminUid: string
}) => {
  const res = await fetch("/api/sinkron-nama-toko", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tokoId,
      tokoNama,
      adminUid,
    }),
  })

  const json = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(json?.message || "Gagal sinkron nama toko")
  }

  return json
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TambahTokoPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("data")
  const [dataSubTab, setDataSubTab] = useState<DataSubTab>("detail")

  const [loading, setLoading] = useState(true)
  const [loadingSave, setLoadingSave] = useState(false)
  const [loadingUpdate, setLoadingUpdate] = useState(false)
  const [loadingDeleteId, setLoadingDeleteId] = useState<string | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [savingLokasi, setSavingLokasi] = useState(false)

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
  const [openDataMobileModal, setOpenDataMobileModal] = useState(false)

  // Lokasi absensi tab
  const [searchLokasi, setSearchLokasi] = useState("")
  const [selectedLokasiTokoId, setSelectedLokasiTokoId] = useState("")
  const [lokasiLat, setLokasiLat] = useState("")
  const [lokasiLng, setLokasiLng] = useState("")
  const [lokasiRadiusKm, setLokasiRadiusKm] = useState("0.2")
  const [openLokasiMobileModal, setOpenLokasiMobileModal] = useState(false)

  // Import state
  const [showImportModal, setShowImportModal] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importResults, setImportResults] = useState<ImportResult[]>([])
  const [importStep, setImportStep] = useState<"upload" | "preview" | "result">("upload")
  const [importError, setImportError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Toast ────────────────────────────────────────────────────────────────────

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setErrorMsg(null)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const showError = (msg: string) => {
    setErrorMsg(msg)
    setSuccessMsg(null)
    setTimeout(() => setErrorMsg(null), 3500)
  }

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
          const lat = getTokoLat(d)
          const lng = getTokoLng(d)
          const radius = getTokoRadius(d)

          return {
            id: s.id,
            kode: d?.kode || "",
            nama: d?.nama || "",
            pemilik: d?.pemilik || "",
            noHp: d?.noHp || "",
            alamat: d?.alamat || "",
            kota: d?.kota || "",
            latitude: lat,
            longitude: lng,
            radiusKm: radius,
            aktif: d?.aktif ?? true,
            lokasiAbsensi: d?.lokasiAbsensi || null,
          }
        })
      )
    } catch (e) {
      console.error(e)
      setData([])
      showError("Gagal memuat data toko")
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
      [
        d.kode,
        d.nama,
        d.pemilik,
        d.noHp,
        d.alamat,
        d.kota,
        String(d.latitude ?? ""),
        String(d.longitude ?? ""),
        String(d.radiusKm ?? ""),
      ].some((v) => v.toLowerCase().includes(s))
    )
  }, [data, search])

  const filteredLokasi = useMemo(() => {
    const s = searchLokasi.toLowerCase().trim()
    if (!s) return data
    return data.filter((d) =>
      [d.kode, d.nama, d.kota, d.alamat, String(d.latitude ?? ""), String(d.longitude ?? "")]
        .some((v) => v.toLowerCase().includes(s))
    )
  }, [data, searchLokasi])

  const selectedLokasiToko = useMemo(() => {
    return data.find((item) => item.id === selectedLokasiTokoId) || null
  }, [data, selectedLokasiTokoId])

  const stats = useMemo(() => {
    const total = data.length
    const aktifCount = data.filter((item) => item.aktif).length
    const lokasiCount = data.filter((item) => item.latitude !== null && item.longitude !== null).length

    return { total, aktifCount, lokasiCount }
  }, [data])

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setKode("")
    setNama("")
    setPemilik("")
    setNoHp("")
    setAlamat("")
    setKota("")
    setLatitude("")
    setLongitude("")
    setAktif(true)
    setEditTarget(null)
  }

  const bukaFormMobile = () => {
    resetForm()
    setActiveTab("data")
    setOpenDataMobileModal(true)
  }

  const closeDataMobileModal = () => {
    if (loadingSave || loadingUpdate) return
    setOpenDataMobileModal(false)
    resetForm()
  }

  const mulaiEdit = (item: Toko) => {
    setActiveTab("data")
    setEditTarget(item)
    setKode(item.kode || "")
    setNama(item.nama || "")
    setPemilik(item.pemilik || "")
    setNoHp(item.noHp || "")
    setAlamat(item.alamat || "")
    setKota(item.kota || "")
    setLatitude(item.latitude !== null ? String(item.latitude) : "")
    setLongitude(item.longitude !== null ? String(item.longitude) : "")
    setAktif(item.aktif ?? true)

    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setOpenDataMobileModal(true)
      return
    }

    setDataSubTab("input")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const simpan = async () => {
    const user = auth.currentUser
    if (!user || loadingSave || loadingUpdate) return

    const kodeVal = kode.trim()
    const namaVal = nama.trim()
    const pemilikVal = pemilik.trim()
    const noHpVal = noHp.trim()
    const alamatVal = alamat.trim()
    const kotaVal = kota.trim()
    const latitudeVal = parseCoordinate(latitude)
    const longitudeVal = parseCoordinate(longitude)

    if (!kodeVal || !namaVal || !pemilikVal || !noHpVal || !alamatVal || !kotaVal) {
      showError("Lengkapi data toko terlebih dahulu")
      return
    }

    if (latitudeVal === null || longitudeVal === null) {
      showError("Latitude dan longitude wajib valid")
      return
    }

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
        latitude: latitudeVal,
        longitude: longitudeVal,
        lokasiAbsensi: {
          lat: latitudeVal,
          lng: longitudeVal,
          radiusKm: 0.2,
        },
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
            latitude: latitudeVal,
            longitude: longitudeVal,
            radiusKm: 0.2,
            lokasiAbsensi: {
              lat: latitudeVal,
              lng: longitudeVal,
              radiusKm: 0.2,
            },
            aktif,
          },
          ...prev,
        ].sort((a, b) => a.nama.localeCompare(b.nama, "id"))
      )

      showSuccess("Data toko berhasil disimpan")
      resetForm()
      setOpenDataMobileModal(false)
    } catch (e) {
      console.error(e)
      showError("Gagal menyimpan data toko")
    } finally {
      setLoadingSave(false)
    }
  }

  const update = async () => {
    const user = auth.currentUser
    if (!user || !editTarget || loadingSave || loadingUpdate) return

    const kodeVal = kode.trim()
    const namaVal = nama.trim()
    const pemilikVal = pemilik.trim()
    const noHpVal = noHp.trim()
    const alamatVal = alamat.trim()
    const kotaVal = kota.trim()
    const latitudeVal = parseCoordinate(latitude)
    const longitudeVal = parseCoordinate(longitude)

    if (!kodeVal || !namaVal || !pemilikVal || !noHpVal || !alamatVal || !kotaVal) {
      showError("Lengkapi data toko terlebih dahulu")
      return
    }

    if (latitudeVal === null || longitudeVal === null) {
      showError("Latitude dan longitude wajib valid")
      return
    }

    setLoadingUpdate(true)

    try {
      const now = Date.now()
      const ref = doc(db, "toko", editTarget.id)
      const nextRadius = editTarget.radiusKm || editTarget.lokasiAbsensi?.radiusKm || 0.2

      await updateDoc(ref, {
        kode: kodeVal,
        nama: namaVal,
        pemilik: pemilikVal,
        noHp: noHpVal,
        alamat: alamatVal,
        kota: kotaVal,
        latitude: latitudeVal,
        longitude: longitudeVal,
        lokasiAbsensi: {
          lat: latitudeVal,
          lng: longitudeVal,
          radiusKm: nextRadius,
        },
        aktif,
        updatedAt: now,
        updatedBy: user.uid,
      })

      if (String(editTarget.nama || "").trim() !== namaVal) {
        await syncNamaTokoByTokoId({
          tokoId: editTarget.id,
          tokoNama: namaVal,
          adminUid: user.uid,
        })
      }

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
                  latitude: latitudeVal,
                  longitude: longitudeVal,
                  radiusKm: nextRadius,
                  lokasiAbsensi: {
                    lat: latitudeVal,
                    lng: longitudeVal,
                    radiusKm: nextRadius,
                  },
                  aktif,
                }
              : x
          )
          .sort((a, b) => a.nama.localeCompare(b.nama, "id"))
      )

      showSuccess("Data toko berhasil diupdate dan relasi toko ikut disinkronkan")
      resetForm()
      setOpenDataMobileModal(false)
    } catch (e) {
      console.error(e)
      showError("Gagal mengupdate data toko")
    } finally {
      setLoadingUpdate(false)
    }
  }

  const hapus = async () => {
    if (!openDelete || loadingDeleteId) return

    setLoadingDeleteId(openDelete.id)

    try {
      const ref = doc(db, "toko", openDelete.id)
      const snap = await getDoc(ref)

      if (snap.exists()) await deleteDoc(ref)
      if (editTarget?.id === openDelete.id) resetForm()
      if (selectedLokasiTokoId === openDelete.id) resetLokasiForm()

      setData((prev) => prev.filter((x) => x.id !== openDelete.id))
      setOpenDelete(null)
      showSuccess("Data toko berhasil dihapus")
    } catch (e) {
      console.error(e)
      showError("Gagal menghapus data toko")
    } finally {
      setLoadingDeleteId(null)
    }
  }

  const canSubmit = useMemo(
    () =>
      !!kode.trim() &&
      !!nama.trim() &&
      !!pemilik.trim() &&
      !!noHp.trim() &&
      !!alamat.trim() &&
      !!kota.trim() &&
      parseCoordinate(latitude) !== null &&
      parseCoordinate(longitude) !== null &&
      !loadingSave &&
      !loadingUpdate,
    [kode, nama, pemilik, noHp, alamat, kota, latitude, longitude, loadingSave, loadingUpdate]
  )

  // ── Lokasi Absensi ───────────────────────────────────────────────────────────

  const resetLokasiForm = () => {
    setSelectedLokasiTokoId("")
    setLokasiLat("")
    setLokasiLng("")
    setLokasiRadiusKm("0.2")
    setOpenLokasiMobileModal(false)
  }

  const pilihTokoLokasi = (item: Toko) => {
    setSelectedLokasiTokoId(item.id)
    setLokasiLat(item.latitude !== null ? String(item.latitude) : "")
    setLokasiLng(item.longitude !== null ? String(item.longitude) : "")
    setLokasiRadiusKm(item.radiusKm !== null ? String(item.radiusKm) : "0.2")

    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setOpenLokasiMobileModal(true)
    }
  }

  const handleGunakanLokasiSaya = async () => {
    if (!navigator.geolocation) {
      showError("Browser tidak mendukung GPS")
      return
    }

    setGpsLoading(true)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLokasiLat(String(pos.coords.latitude))
        setLokasiLng(String(pos.coords.longitude))
        setGpsLoading(false)
        showSuccess("Lokasi perangkat berhasil diambil")
      },
      (error) => {
        console.error("GPS error:", error)
        setGpsLoading(false)

        if (error.code === 1) {
          showError("Izin lokasi ditolak. Aktifkan izin GPS di browser")
          return
        }

        if (error.code === 2) {
          showError("Lokasi tidak tersedia. Pastikan GPS perangkat aktif")
          return
        }

        showError("Gagal mengambil lokasi perangkat")
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    )
  }

  const handleSimpanLokasiAbsensi = async () => {
    const user = auth.currentUser

    if (!user) {
      showError("Anda belum login")
      return
    }

    if (!selectedLokasiToko) {
      showError("Pilih toko dulu")
      return
    }

    const latVal = parseCoordinate(lokasiLat)
    const lngVal = parseCoordinate(lokasiLng)
    const radiusVal = parseRadius(lokasiRadiusKm)

    if (latVal === null || latVal < -90 || latVal > 90) {
      showError("Latitude tidak valid")
      return
    }

    if (lngVal === null || lngVal < -180 || lngVal > 180) {
      showError("Longitude tidak valid")
      return
    }

    if (radiusVal === null) {
      showError("Radius wajib lebih dari 0")
      return
    }

    setSavingLokasi(true)

    try {
      const now = Date.now()
      const ref = doc(db, "toko", selectedLokasiToko.id)

      const lokasiAbsensi = {
        lat: latVal,
        lng: lngVal,
        radiusKm: radiusVal,
      }

      await updateDoc(ref, {
        latitude: latVal,
        longitude: lngVal,
        radiusKm: radiusVal,
        lokasiAbsensi,
        updatedAt: now,
        updatedBy: user.uid,
      })

      setData((prev) =>
        prev.map((item) =>
          item.id === selectedLokasiToko.id
            ? {
                ...item,
                latitude: latVal,
                longitude: lngVal,
                radiusKm: radiusVal,
                lokasiAbsensi,
              }
            : item
        )
      )

      showSuccess("Lokasi absensi toko berhasil disimpan")
      setOpenLokasiMobileModal(false)
    } catch (e) {
      console.error(e)
      showError("Gagal menyimpan lokasi absensi toko")
    } finally {
      setSavingLokasi(false)
    }
  }

  const canSubmitLokasi = useMemo(() => {
    return (
      !!selectedLokasiToko &&
      parseCoordinate(lokasiLat) !== null &&
      parseCoordinate(lokasiLng) !== null &&
      parseRadius(lokasiRadiusKm) !== null &&
      !savingLokasi
    )
  }, [selectedLokasiToko, lokasiLat, lokasiLng, lokasiRadiusKm, savingLokasi])

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
          kode: row.kode,
          nama: row.nama,
          pemilik: row.pemilik,
          noHp: row.noHp,
          alamat: row.alamat,
          kota: row.kota,
          latitude: row.latitude,
          longitude: row.longitude,
          lokasiAbsensi:
            row.latitude !== null && row.longitude !== null
              ? {
                  lat: row.latitude,
                  lng: row.longitude,
                  radiusKm: 0.2,
                }
              : null,
          aktif: row.aktif,
          createdAt: Date.now(),
          createdBy: user.uid,
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
      showSuccess(`${successCount} toko berhasil diimport`)
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
    <div className="relative min-h-full overflow-x-hidden bg-transparent text-slate-900">
      <main className="relative w-full space-y-4 pb-28">
        {/* ── Header Banner ── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-500 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <Store size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Pengaturan Toko
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-sky-50/85 sm:text-sm">
                  Data toko dan titik lokasi absensi karyawan.
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={handleDownloadTemplate}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15"
                title="Download Template Excel"
              >
                <Download size={12} strokeWidth={2.8} />
                <span>Template</span>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={() => setShowImportModal(true)}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.06em] text-white transition-colors hover:bg-white/15"
                title="Import dari Excel"
              >
                <Upload size={12} strokeWidth={2.8} />
                <span>Import</span>
              </motion.button>
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.04]">
            <Cpu size={150} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        {/* ── Toast ── */}
        <AnimatePresence>
          {(successMsg || errorMsg) && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-2xl border px-4 py-3 shadow-lg ${
                successMsg
                  ? "border-sky-200 bg-sky-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              {successMsg ? (
                <CheckCircle2 size={16} className="text-sky-600" strokeWidth={2.5} />
              ) : (
                <AlertCircle size={16} className="text-red-600" strokeWidth={2.5} />
              )}
              <p className={`max-w-xs text-xs font-black ${successMsg ? "text-sky-700" : "text-red-700"}`}>
                {successMsg || errorMsg}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Tabs ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
        >
          <div className="grid grid-cols-2 gap-2">
            <TabButton
              active={activeTab === "data"}
              icon={Store}
              label="Data Toko"
              onClick={() => setActiveTab("data")}
            />
            <TabButton
              active={activeTab === "lokasi"}
              icon={Navigation}
              label="Atur Lokasi Absensi"
              onClick={() => setActiveTab("lokasi")}
            />
          </div>
        </motion.div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
  <StatCard label="Total Toko" value={stats.total} icon={Store} tone="slate" />
  <StatCard label="Toko Aktif" value={stats.aktifCount} icon={CheckCircle2} tone="sky" />
  <StatCard label="Lokasi Terisi" value={stats.lokasiCount} icon={MapPin} tone="blue" />
</div>

        {activeTab === "data" ? (
          <>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:block"
            >
              <div className="grid grid-cols-2 gap-2">
                <DataModeTabButton
                  active={dataSubTab === "input"}
                  icon={Plus}
                  label={editTarget ? "Edit Toko" : "Input Toko"}
                  description="Tambah atau ubah data toko"
                  onClick={() => setDataSubTab("input")}
                />
                <DataModeTabButton
                  active={dataSubTab === "detail"}
                  icon={ListFilter}
                  label="Detail Toko"
                  description="Lihat data yang sudah terisi"
                  onClick={() => setDataSubTab("detail")}
                />
              </div>
            </motion.div>

            {dataSubTab === "input" ? (
              <>
            {/* ── Form Tambah / Edit ── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 }}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-100 bg-white px-4 py-3 sm:px-5">
                <p className="text-xs font-black uppercase tracking-wide text-slate-700">
                  {editTarget ? "Edit Toko" : "Tambah Toko Baru"}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Kode toko · nama toko · pemilik · kota · GPS toko
                </p>
              </div>

              <div className="space-y-3 p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
                  {[
                    { label: "Kode Toko", val: kode, set: setKode },
                    { label: "Nama Toko", val: nama, set: setNama },
                    { label: "Pemilik", val: pemilik, set: setPemilik },
                    { label: "No HP", val: noHp, set: setNoHp },
                    { label: "Kota", val: kota, set: setKota },
                  ].map(({ label, val, set }) => (
                    <FieldBox key={label} label={label}>
                      <input
                        value={val}
                        onChange={(e) => set(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                      />
                    </FieldBox>
                  ))}

                  <FieldBox label="Status">
                    <div className="relative">
                      <select
                        value={aktif ? "aktif" : "nonaktif"}
                        onChange={(e) => setAktif(e.target.value === "aktif")}
                        className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                      >
                        <option value="aktif">Aktif</option>
                        <option value="nonaktif">Nonaktif</option>
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                  </FieldBox>

                  <FieldBox label="Latitude">
                    <input
                      type="number"
                      step="any"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      placeholder="-7.257472"
                      className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                    />
                  </FieldBox>

                  <FieldBox label="Longitude">
                    <input
                      type="number"
                      step="any"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      placeholder="112.752090"
                      className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                    />
                  </FieldBox>

                  <FieldBox label="Preview Koordinat" className="sm:col-span-2 lg:col-span-1">
                    <div className="flex min-h-[46px] w-full items-center rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
                      {parseCoordinate(latitude) !== null && parseCoordinate(longitude) !== null ? (
                        `${parseCoordinate(latitude)}, ${parseCoordinate(longitude)}`
                      ) : (
                        <span className="font-normal text-slate-300">Belum diisi</span>
                      )}
                    </div>
                  </FieldBox>

                  <FieldBox label="Alamat" className="sm:col-span-2 lg:col-span-3">
                    <textarea
                      value={alamat}
                      onChange={(e) => setAlamat(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                    />
                  </FieldBox>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <motion.button
                    whileTap={canSubmit ? { scale: 0.97 } : {}}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    onClick={editTarget ? update : simpan}
                    disabled={!canSubmit}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-sky-500/15 transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingSave || loadingUpdate ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : editTarget ? (
                      <Pencil size={16} />
                    ) : (
                      <Plus size={16} />
                    )}
                    {loadingSave || loadingUpdate ? "Memproses..." : editTarget ? "Update Toko" : "Simpan Toko"}
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    onClick={resetForm}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
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
              </>
            ) : (
              <>

            {/* ── Search ── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08 }}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                <input
                  placeholder="Cari kode/nama toko/pemilik/kota/koordinat..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-8 pr-4 text-sm font-semibold text-slate-700 placeholder:text-slate-300 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  onClick={bukaFormMobile}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.08em] text-white shadow-sm shadow-sky-500/15"
                >
                  <Plus size={14} strokeWidth={2.5} />
                  Tambah
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  onClick={() => setShowImportModal(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-700"
                >
                  <Upload size={14} strokeWidth={2.5} />
                  Import
                </motion.button>
              </div>
            </motion.div>

            <DataTokoSection
              loading={loading}
              filtered={filtered}
              mulaiEdit={mulaiEdit}
              setOpenDelete={setOpenDelete}
              setShowImportModal={setShowImportModal}
            />
              </>
            )}
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="grid grid-cols-1 gap-4 lg:grid-cols-3"
          >
            <div className="lg:col-span-1 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-4 lg:shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Daftar Toko
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Pilih toko untuk mengatur titik absensi.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={fetchToko}
                  disabled={loading}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCcw size={15} strokeWidth={2.5} className={loading ? "animate-spin" : ""} />
                </button>
              </div>

              <div className="relative mb-3">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  strokeWidth={2.5}
                />
                <input
                  value={searchLokasi}
                  onChange={(e) => setSearchLokasi(e.target.value)}
                  placeholder="Cari toko..."
                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
                />
              </div>

              <div className="space-y-2 lg:max-h-[560px] lg:overflow-y-auto lg:pr-1">
  {loading ? (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-xs font-bold text-slate-400 shadow-sm">
      <Loader2 size={16} className="animate-spin" />
      Memuat data...
    </div>
  ) : filteredLokasi.length === 0 ? (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs font-semibold text-slate-400 shadow-sm">
      Toko tidak ditemukan.
    </div>
  ) : (
    filteredLokasi.map((item) => {
      const active = selectedLokasiTokoId === item.id
      const adaLokasi = item.latitude !== null && item.longitude !== null

      return (
        <motion.button
          key={item.id}
          type="button"
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          onClick={() => pilihTokoLokasi(item)}
          className={`w-full overflow-hidden rounded-2xl border p-3 text-left shadow-sm ring-1 transition ${
            active
              ? "border-sky-200 bg-sky-50 ring-sky-100"
              : "border-slate-200 bg-white ring-slate-100/70 hover:border-sky-200 hover:bg-sky-50/50"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${
                adaLokasi
                  ? "bg-sky-50 text-sky-600 ring-sky-100"
                  : "bg-slate-50 text-slate-500 ring-slate-100"
              }`}
            >
              <Store size={20} strokeWidth={2.5} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black leading-tight text-slate-800">
                    {item.nama}
                  </p>
                  <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                    {item.kode || "-"} · {item.kota || "-"}
                  </p>
                </div>

                <span
                  className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                    adaLokasi ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {adaLokasi ? "Ada" : "Kosong"}
                </span>
              </div>

              <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                <p className="flex min-w-0 items-start gap-2 text-xs font-semibold leading-relaxed text-slate-600">
                  <MapPin size={13} className="mt-0.5 shrink-0 text-slate-400" strokeWidth={2.5} />
                  <span className="line-clamp-2">{item.alamat || "-"}</span>
                </p>

                <p
                  className={`text-[10px] font-black uppercase tracking-[0.12em] ${
                    adaLokasi ? "text-sky-600" : "text-slate-400"
                  }`}
                >
                  {adaLokasi ? "Ketuk untuk atur ulang lokasi" : "Ketuk untuk isi lokasi"}
                </p>
              </div>
            </div>
          </div>
        </motion.button>
      )
    })
  )}
</div>
            </div>

            <div className="hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2 lg:block">
              {!selectedLokasiToko ? (
                <EmptyState
                  title="Pilih Toko Dulu"
                  description="Setelah toko dipilih, kamu bisa mengatur titik lokasi absensi dan radius yang diperbolehkan."
                />
              ) : (
                <LokasiAbsensiForm
                  selectedLokasiToko={selectedLokasiToko}
                  lokasiLat={lokasiLat}
                  lokasiLng={lokasiLng}
                  lokasiRadiusKm={lokasiRadiusKm}
                  setLokasiLat={setLokasiLat}
                  setLokasiLng={setLokasiLng}
                  setLokasiRadiusKm={setLokasiRadiusKm}
                  handleGunakanLokasiSaya={handleGunakanLokasiSaya}
                  handleSimpanLokasiAbsensi={handleSimpanLokasiAbsensi}
                  resetLokasiForm={resetLokasiForm}
                  gpsLoading={gpsLoading}
                  savingLokasi={savingLokasi}
                  canSubmitLokasi={canSubmitLokasi}
                />
              )}
            </div>
          </motion.div>
        )}

        {/* ── Modal: Hapus Toko ── */}
        <AnimatePresence>
          {openDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
              >
                <div className="relative overflow-hidden bg-gradient-to-br from-rose-500 to-red-600 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
                      <Trash2 size={20} className="text-white" strokeWidth={2.5} />
                    </div>
                    <div>
                      <h2 className="text-base font-black leading-none tracking-tight text-white">Hapus Toko</h2>
                      <p className="mt-0.5 max-w-[220px] truncate text-[10px] font-bold uppercase tracking-[0.15em] text-white/70">
                        {openDelete.nama}
                      </p>
                    </div>
                  </div>
                  <div className="pointer-events-none absolute right-0 top-0 opacity-10">
                    <Cpu size={100} strokeWidth={1} className="text-white" />
                  </div>
                </div>

                <div className="space-y-3 p-5">
                  <p className="text-[11px] font-semibold text-slate-600">
                    Kamu yakin mau menghapus toko ini?
                  </p>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-black text-slate-800">{openDelete.nama}</p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {openDelete.kode || "-"} · {openDelete.kota || "-"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 px-5 pb-5">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    onClick={() => setOpenDelete(null)}
                    className="flex-1 rounded-full border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
                  >
                    Batal
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    onClick={hapus}
                    disabled={loadingDeleteId === openDelete.id}
                    className="flex-1 rounded-full bg-gradient-to-r from-rose-500 to-red-600 py-2.5 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-rose-200/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingDeleteId === openDelete.id ? (
                      <span className="inline-flex items-center justify-center gap-2">
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

        <AnimatePresence>
          {openDataMobileModal && activeTab === "data" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
              onClick={(e) => {
                if (e.target === e.currentTarget && !loadingSave && !loadingUpdate) {
                  closeDataMobileModal()
                }
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="max-h-[84vh] w-full max-w-lg overflow-y-auto rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                      {editTarget ? "Edit Data Toko" : "Tambah Data Toko"}
                    </p>
                    <h2 className="truncate text-base font-black text-slate-800">
                      {editTarget?.nama || "Toko Baru"}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={closeDataMobileModal}
                    disabled={loadingSave || loadingUpdate}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    <X size={17} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="space-y-3 p-4">
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { label: "Kode Toko", val: kode, set: setKode },
                      { label: "Nama Toko", val: nama, set: setNama },
                      { label: "Pemilik", val: pemilik, set: setPemilik },
                      { label: "No HP", val: noHp, set: setNoHp },
                      { label: "Kota", val: kota, set: setKota },
                    ].map(({ label, val, set }) => (
                      <FieldBox key={label} label={label}>
                        <input
                          value={val}
                          onChange={(e) => set(e.target.value)}
                          className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                        />
                      </FieldBox>
                    ))}

                    <FieldBox label="Status">
                      <div className="relative">
                        <select
                          value={aktif ? "aktif" : "nonaktif"}
                          onChange={(e) => setAktif(e.target.value === "aktif")}
                          className="w-full appearance-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                        >
                          <option value="aktif">Aktif</option>
                          <option value="nonaktif">Nonaktif</option>
                        </select>
                        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      </div>
                    </FieldBox>

                    <FieldBox label="Latitude">
                      <input
                        type="number"
                        step="any"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        placeholder="-7.257472"
                        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                      />
                    </FieldBox>

                    <FieldBox label="Longitude">
                      <input
                        type="number"
                        step="any"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        placeholder="112.752090"
                        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                      />
                    </FieldBox>

                    <FieldBox label="Alamat">
                      <textarea
                        value={alamat}
                        onChange={(e) => setAlamat(e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                      />
                    </FieldBox>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={closeDataMobileModal}
                      disabled={loadingSave || loadingUpdate}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <X size={16} strokeWidth={2.5} />
                      Batal
                    </button>

                    <button
                      type="button"
                      onClick={editTarget ? update : simpan}
                      disabled={!canSubmit}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-sky-500/15 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingSave || loadingUpdate ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : editTarget ? (
                        <Pencil size={16} strokeWidth={2.5} />
                      ) : (
                        <Plus size={16} strokeWidth={2.5} />
                      )}
                      {loadingSave || loadingUpdate ? "Proses" : editTarget ? "Update" : "Simpan"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {openLokasiMobileModal && selectedLokasiToko && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
              onClick={(e) => {
                if (e.target === e.currentTarget && !savingLokasi && !gpsLoading) {
                  setOpenLokasiMobileModal(false)
                }
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="max-h-[84vh] w-full max-w-lg overflow-y-auto rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                      Atur GPS Absensi
                    </p>
                    <h2 className="truncate text-base font-black text-slate-800">
                      {selectedLokasiToko.nama}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpenLokasiMobileModal(false)}
                    disabled={savingLokasi || gpsLoading}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    <X size={17} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="p-4">
                  <LokasiAbsensiForm
                    selectedLokasiToko={selectedLokasiToko}
                    lokasiLat={lokasiLat}
                    lokasiLng={lokasiLng}
                    lokasiRadiusKm={lokasiRadiusKm}
                    setLokasiLat={setLokasiLat}
                    setLokasiLng={setLokasiLng}
                    setLokasiRadiusKm={setLokasiRadiusKm}
                    handleGunakanLokasiSaya={handleGunakanLokasiSaya}
                    handleSimpanLokasiAbsensi={handleSimpanLokasiAbsensi}
                    resetLokasiForm={resetLokasiForm}
                    gpsLoading={gpsLoading}
                    savingLokasi={savingLokasi}
                    canSubmitLokasi={canSubmitLokasi}
                    compact
                  />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <ImportModal
          show={showImportModal}
          importStep={importStep}
          importRows={importRows}
          importResults={importResults}
          importLoading={importLoading}
          importError={importError}
          fileInputRef={fileInputRef}
          handleFileSelect={handleFileSelect}
          handleDownloadTemplate={handleDownloadTemplate}
          handleImport={handleImport}
          closeImportModal={closeImportModal}
          setImportStep={setImportStep}
          setImportRows={setImportRows}
          setImportResults={setImportResults}
        />
      </main>
    </div>
  )
}

// ─── Components ───────────────────────────────────────────────────────────────

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: any
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wide transition ${
        active
          ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-lg shadow-sky-500/15"
          : "border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon size={16} strokeWidth={2.5} />
      {label}
    </button>
  )
}


function DataModeTabButton({
  active,
  icon: Icon,
  label,
  description,
  onClick,
}: {
  active: boolean
  icon: any
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
        active
          ? "bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 text-white shadow-lg shadow-sky-500/15"
          : "border-2 border-slate-200 bg-white text-slate-700 hover:bg-sky-50 hover:text-sky-700"
      }`}
    >
      <span
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${
          active ? "bg-white/15 text-white" : "bg-sky-50 text-sky-600"
        }`}
      >
        <Icon size={18} strokeWidth={2.5} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-black uppercase tracking-wide sm:text-sm">
          {label}
        </span>
        <span
          className={`mt-0.5 hidden truncate text-[10px] font-bold sm:block ${
            active ? "text-sky-50/85" : "text-slate-400"
          }`}
        >
          {description}
        </span>
      </span>
    </button>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: any
  tone: "slate" | "sky" | "blue"
}) {
  const cls =
    tone === "sky"
      ? "bg-sky-50 text-sky-600"
      : tone === "blue"
        ? "bg-blue-50 text-blue-600"
        : "bg-slate-100 text-slate-500"

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
      <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left">
       <div className={`hidden h-9 w-9 items-center justify-center rounded-2xl sm:flex sm:h-11 sm:w-11 ${cls}`}>
  <Icon size={18} strokeWidth={2.5} className="sm:h-[21px] sm:w-[21px]" />
</div>
        <div className="min-w-0">
          <p className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[10px] sm:tracking-widest">
            {label}
          </p>
          <p className="text-lg font-black leading-tight text-slate-800 sm:text-2xl">{value}</p>
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
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      {children}
    </div>
  )
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
      />
    </div>
  )
}

function PreviewBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-all text-sm font-black text-slate-800">{value}</p>
    </div>
  )
}

function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <MapPin size={28} strokeWidth={2.5} />
      </div>
      <h2 className="text-lg font-black text-slate-800">{title}</h2>
      <p className="mt-2 max-w-sm text-sm font-semibold leading-relaxed text-slate-500">
        {description}
      </p>
    </div>
  )
}


function LokasiAbsensiForm({
  selectedLokasiToko,
  lokasiLat,
  lokasiLng,
  lokasiRadiusKm,
  setLokasiLat,
  setLokasiLng,
  setLokasiRadiusKm,
  handleGunakanLokasiSaya,
  handleSimpanLokasiAbsensi,
  resetLokasiForm,
  gpsLoading,
  savingLokasi,
  canSubmitLokasi,
  compact = false,
}: {
  selectedLokasiToko: Toko
  lokasiLat: string
  lokasiLng: string
  lokasiRadiusKm: string
  setLokasiLat: (value: string) => void
  setLokasiLng: (value: string) => void
  setLokasiRadiusKm: (value: string) => void
  handleGunakanLokasiSaya: () => void
  handleSimpanLokasiAbsensi: () => void
  resetLokasiForm: () => void
  gpsLoading: boolean
  savingLokasi: boolean
  canSubmitLokasi: boolean
  compact?: boolean
}) {
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact && (
        <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
            Toko Terpilih
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-800">
            {selectedLokasiToko.nama}
          </h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Isi koordinat pusat lokasi absensi dan radius yang diperbolehkan.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FieldInput
          label="Latitude"
          value={lokasiLat}
          onChange={setLokasiLat}
          placeholder="-7.257472"
        />
        <FieldInput
          label="Longitude"
          value={lokasiLng}
          onChange={setLokasiLng}
          placeholder="112.752090"
        />
        <FieldInput
          label="Radius KM"
          value={lokasiRadiusKm}
          onChange={setLokasiRadiusKm}
          placeholder="0.2"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        

        <div className="mt-3">
          <button
            type="button"
            onClick={handleGunakanLokasiSaya}
            disabled={gpsLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-sky-500/15 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {gpsLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Mengambil GPS...
              </>
            ) : (
              <>
                <Crosshair size={16} strokeWidth={2.5} />
                Gunakan Lokasi Saya
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={handleSimpanLokasiAbsensi}
          disabled={!canSubmitLokasi}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-sky-500/15 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingLokasi ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Menyimpan...
            </>
          ) : (
            <>
              <Save size={16} strokeWidth={2.5} />
              Simpan Lokasi
            </>
          )}
        </button>

        <button
          type="button"
          onClick={resetLokasiForm}
          disabled={savingLokasi}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X size={16} strokeWidth={2.5} />
          Reset Pilihan
        </button>
      </div>
  
    </div>
  )
}

function DataTokoSection({
  loading,
  filtered,
  mulaiEdit,
  setOpenDelete,
  setShowImportModal,
}: {
  loading: boolean
  filtered: Toko[]
  mulaiEdit: (item: Toko) => void
  setOpenDelete: (item: Toko) => void
  setShowImportModal: (v: boolean) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-sky-500"
          />
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Memuat data toko...
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ── Mobile Cards ── */}
      <div className="space-y-2 sm:hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Store size={28} className="text-slate-300" strokeWidth={2} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Data toko belum tersedia
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-black text-sky-700"
              >
                <Upload size={13} strokeWidth={2.5} />
                Import Excel
              </motion.button>
            </div>
          </div>
        ) : (
          filtered.map((d, idx) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.03 }}
              role="button"
              tabIndex={0}
              onClick={() => mulaiEdit(d)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") mulaiEdit(d)
              }}
              className="cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100/70 transition hover:border-sky-200 hover:bg-sky-50/30"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                  <Store size={20} strokeWidth={2.5} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black leading-tight text-slate-800">
                        {d.nama}
                      </p>
                      <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                        {d.kode || "-"} · {d.kota || "-"}
                      </p>
                    </div>
                    <span
                      className={`inline-flex flex-shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                        d.aktif ? "bg-sky-50 text-sky-700" : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {d.aktif ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
  <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
    <Phone size={13} className="flex-shrink-0 text-slate-400" strokeWidth={2.5} />
    <span className="truncate">{d.noHp || "-"}</span>
  </p>
  <p className="flex min-w-0 items-start gap-2 text-xs font-semibold leading-relaxed text-slate-600">
    <MapPin size={13} className="mt-0.5 flex-shrink-0 text-slate-400" strokeWidth={2.5} />
    <span className="line-clamp-2">{d.alamat || "-"}</span>
  </p>
</div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-sky-600">
                      Ketuk card untuk edit
                    </p>

                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.12, ease: "easeOut" }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenDelete(d)
                      }}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 px-3 py-2 text-xs font-black text-white shadow-sm shadow-rose-200/50"
                    >
                      <Trash2 size={12} strokeWidth={2.5} />
                      Hapus
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* ── Desktop Table ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08 }}
        className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:block"
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-700">
            Daftar Toko
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70">
              <tr>
                {["No", "Kode", "Nama Toko", "Pemilik", "No HP", "Kota", "GPS", "Status", "Aksi"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 ${
                      i === 0 || i === 8 ? "text-center" : "text-left"
                    }`}
                  >
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
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                        <Building2 size={24} className="text-slate-300" strokeWidth={2} />
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Data toko belum tersedia
                      </p>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        transition={{ duration: 0.12, ease: "easeOut" }}
                        onClick={() => setShowImportModal(true)}
                        className="flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-black text-sky-700"
                      >
                        <Upload size={13} strokeWidth={2.5} />
                        Import Excel
                      </motion.button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((d, idx) => (
                  <motion.tr
                    key={d.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: idx * 0.03 }}
                    className="border-t border-slate-100 transition-colors hover:bg-slate-50/60"
                  >
                    <td className="px-4 py-3 text-center text-xs font-bold text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3 text-xs font-black text-slate-700">{d.kode || "-"}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{d.nama}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{d.pemilik}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{d.noHp}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{d.kota}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-600">
                      {d.latitude ?? "-"}, {d.longitude ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                          d.aktif ? "bg-sky-100 text-sky-700" : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {d.aktif ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          transition={{ duration: 0.12, ease: "easeOut" }}
                          onClick={() => mulaiEdit(d)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1.5 text-xs font-black text-white shadow-sm shadow-amber-200/50 hover:shadow-md"
                        >
                          <Pencil size={12} strokeWidth={2.5} />
                          Edit
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          transition={{ duration: 0.12, ease: "easeOut" }}
                          onClick={() => setOpenDelete(d)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 px-3 py-1.5 text-xs font-black text-white shadow-sm shadow-rose-200/50 hover:shadow-md"
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
    </>
  )
}

function ImportModal({
  show,
  importStep,
  importRows,
  importResults,
  importLoading,
  importError,
  fileInputRef,
  handleFileSelect,
  handleDownloadTemplate,
  handleImport,
  closeImportModal,
  setImportStep,
  setImportRows,
  setImportResults,
}: {
  show: boolean
  importStep: "upload" | "preview" | "result"
  importRows: ImportRow[]
  importResults: ImportResult[]
  importLoading: boolean
  importError: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleDownloadTemplate: () => void
  handleImport: () => void
  closeImportModal: () => void
  setImportStep: (step: "upload" | "preview" | "result") => void
  setImportRows: (rows: ImportRow[]) => void
  setImportResults: (rows: ImportResult[]) => void
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !importLoading) closeImportModal()
          }}
        >
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="relative flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                  <FileSpreadsheet size={18} className="text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-base font-black leading-none text-white">Import Data Toko</h2>
                  <p className="mt-0.5 text-[10px] font-semibold text-white/70">
                    {importStep === "upload" && "Upload file Excel template"}
                    {importStep === "preview" && `${importRows.length} baris siap diimport`}
                    {importStep === "result" && "Hasil import selesai"}
                  </p>
                </div>
              </div>

              {!importLoading && (
                <button
                  onClick={closeImportModal}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white transition-colors hover:bg-white/30"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              )}
            </div>

            <div className="flex flex-shrink-0 items-center gap-0 border-b border-slate-100 bg-slate-50 px-6 py-3">
              {[
                { key: "upload", label: "Upload" },
                { key: "preview", label: "Preview" },
                { key: "result", label: "Hasil" },
              ].map((step, idx) => (
                <div key={step.key} className="flex items-center">
                  <div
                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wide transition-all ${
                      importStep === step.key
                        ? "bg-sky-600 text-white"
                        : ["upload", "preview", "result"].indexOf(importStep) > idx
                          ? "text-sky-600"
                          : "text-slate-400"
                    }`}
                  >
                    {["upload", "preview", "result"].indexOf(importStep) > idx ? (
                      <Check size={10} strokeWidth={3} />
                    ) : (
                      <span>{idx + 1}</span>
                    )}
                    {step.label}
                  </div>
                  {idx < 2 && <div className="mx-1 h-px w-6 bg-slate-200" />}
                </div>
              ))}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {importStep === "upload" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <FileSpreadsheet size={20} className="flex-shrink-0 text-sky-600" strokeWidth={2} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-sky-700">Belum punya template?</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-sky-600">
                        Download template Excel, isi data termasuk koordinat GPS, lalu upload di sini.
                      </p>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.12, ease: "easeOut" }}
                      onClick={handleDownloadTemplate}
                      className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-[10px] font-black text-white"
                    >
                      <Download size={11} strokeWidth={2.5} />
                      Download
                    </motion.button>
                  </div>

                  {importError && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                      <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-red-500" strokeWidth={2.5} />
                      <p className="text-[11px] font-bold text-red-600">{importError}</p>
                    </div>
                  )}

                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />

                  <motion.div
                    whileTap={{ scale: 0.99 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-8 transition-all hover:border-sky-400 hover:bg-sky-50/30"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                      <Upload size={28} className="text-slate-400" strokeWidth={1.5} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-black text-slate-600">Klik untuk pilih file</p>
                      <p className="mt-1 text-[10px] font-semibold text-slate-400">
                        Format: .xlsx · Maks. 100 baris data
                      </p>
                    </div>
                  </motion.div>

                  <div className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
                    <MapPin size={14} className="mt-0.5 flex-shrink-0 text-violet-500" strokeWidth={2.5} />
                    <p className="text-[10px] font-semibold text-violet-700">
                      <span className="font-black">Tip GPS:</span> Buka Google Maps → klik kanan lokasi toko → salin koordinat. Contoh:{" "}
                      <span className="font-mono font-black">-7.257472, 112.752090</span>
                    </p>
                  </div>
                </div>
              )}

              {importStep === "preview" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-slate-700">{importRows.length} baris ditemukan</p>
                    <button
                      onClick={() => {
                        setImportStep("upload")
                        setImportRows([])
                      }}
                      className="text-[10px] font-bold text-slate-400 underline hover:text-slate-600"
                    >
                      Ganti File
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="max-h-72 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
                          <tr>
                            {["#", "Kode", "Nama Toko", "Pemilik", "Kota", "Lat", "Lon", "Status"].map((h) => (
                              <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-[9px] font-black uppercase tracking-wide text-slate-400">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>

                        <tbody>
                          {importRows.map((r, i) => {
                            const err = validateImportRow(r, i)
                            return (
                              <tr
                                key={i}
                                className={`border-t border-slate-100 ${
                                  err ? "bg-red-50" : i % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                                }`}
                              >
                                <td className="px-3 py-2 font-bold text-slate-400">{i + 1}</td>
                                <td className="whitespace-nowrap px-3 py-2 font-black text-slate-700">
                                  {r.kode || <span className="text-red-400">—</span>}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-800">
                                  {r.nama || <span className="text-red-400">—</span>}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.pemilik || "—"}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.kota || "—"}</td>
                                <td className={`whitespace-nowrap px-3 py-2 font-mono ${r.latitude === null ? "text-red-500" : "text-slate-600"}`}>
                                  {r.latitude ?? <span className="text-red-400">—</span>}
                                </td>
                                <td className={`whitespace-nowrap px-3 py-2 font-mono ${r.longitude === null ? "text-red-500" : "text-slate-600"}`}>
                                  {r.longitude ?? <span className="text-red-400">—</span>}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${r.aktif ? "bg-sky-100 text-sky-700" : "bg-rose-100 text-rose-700"}`}>
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
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" strokeWidth={2.5} />
                      <p className="text-[11px] font-bold text-amber-700">
                        Beberapa baris memiliki error dan akan dilewati saat import.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {importStep === "result" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <ImportResultBox
                      label="Berhasil"
                      count={importResults.filter((r) => r.status === "success").length}
                      tone="sky"
                    />
                    <ImportResultBox
                      label="Dilewati"
                      count={importResults.filter((r) => r.status === "skipped").length}
                      tone="amber"
                    />
                    <ImportResultBox
                      label="Gagal"
                      count={importResults.filter((r) => r.status === "error").length}
                      tone="red"
                    />
                  </div>

                  <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200">
                    {importResults.map((r, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 ${
                          r.status === "success" ? "bg-white" : r.status === "skipped" ? "bg-amber-50" : "bg-red-50"
                        }`}
                      >
                        {r.status === "success" ? (
                          <CheckCircle2 size={14} className="flex-shrink-0 text-sky-500" strokeWidth={2.5} />
                        ) : r.status === "skipped" ? (
                          <AlertCircle size={14} className="flex-shrink-0 text-amber-500" strokeWidth={2.5} />
                        ) : (
                          <XCircle size={14} className="flex-shrink-0 text-red-500" strokeWidth={2.5} />
                        )}
                        <span className="w-5 flex-shrink-0 text-right text-xs font-bold text-slate-700">{r.row}</span>
                        <span className="min-w-0 truncate text-xs font-semibold text-slate-800">{r.nama}</span>
                        <span
                          className={`ml-auto flex-shrink-0 text-[10px] font-semibold ${
                            r.status === "success" ? "text-sky-600" : r.status === "skipped" ? "text-amber-600" : "text-red-600"
                          }`}
                        >
                          {r.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-shrink-0 justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                onClick={closeImportModal}
                disabled={importLoading}
                className="rounded-xl border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {importStep === "result" ? "Tutup" : "Batal"}
              </motion.button>

              {importStep === "preview" && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  onClick={handleImport}
                  disabled={importLoading}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-blue-500 px-5 py-2.5 text-sm font-black text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" strokeWidth={2.5} />
                      Mengimport {importRows.length} toko...
                    </>
                  ) : (
                    <>
                      <Upload size={14} strokeWidth={2.5} />
                      Import {importRows.length} Toko
                    </>
                  )}
                </motion.button>
              )}

              {importStep === "result" && importResults.some((r) => r.status !== "success") && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  onClick={() => {
                    setImportStep("upload")
                    setImportRows([])
                    setImportResults([])
                  }}
                  className="flex items-center gap-2 rounded-xl border-2 border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-black text-sky-700"
                >
                  <Upload size={14} strokeWidth={2.5} />
                  Import Lagi
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ImportResultBox({
  label,
  count,
  tone,
}: {
  label: string
  count: number
  tone: "sky" | "amber" | "red"
}) {
  const cls =
    tone === "sky"
      ? "bg-sky-50 border-sky-200 text-sky-600"
      : tone === "amber"
        ? "bg-amber-50 border-amber-200 text-amber-600"
        : "bg-red-50 border-red-200 text-red-600"

  return (
    <div className={`rounded-xl border p-3 text-center ${cls}`}>
      <p className="text-2xl font-black">{count}</p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide">{label}</p>
    </div>
  )
}
