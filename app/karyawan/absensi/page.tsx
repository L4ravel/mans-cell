// Halaman ini dipakai untuk absensi harian karyawan berbasis GPS dan jadwal dinamis.
// Lokasi absensi sekarang diambil dinamis dari data toko karyawan, bukan hardcode koordinat.

"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { auth, db } from "@/lib/firebase"
import { doc, getDoc, onSnapshot } from "firebase/firestore"
import { motion, AnimatePresence } from "framer-motion"
import {
  MapPin,
  Calendar,
  Clock,
  LogIn,
  LogOut,
  FileText,
  AlertCircle,
  Loader2,
} from "lucide-react"
import "leaflet/dist/leaflet.css"

type ModalType = null | "izin" | "sakit" | "terlambat" | "pulang_cepat"

type DaySchedule = {
  enabled: boolean
  jamMasuk: string
  jamPulang: string
}

type JadwalAbsensi = {
  jamMasuk: string
  jamPulang: string
  isLibur: boolean
  sumber: "default" | "instansi" | "individu"
  mode: "weekly" | "monthly_override"
}

type LokasiToko = {
  tokoId: string
  nama: string
  latitude: number | null
  longitude: number | null
  radiusKm: number
}

const ALASAN_KHUSUS = [
  "Sakit",
  "Izin",
  "Sistem Error",
  "Lupa",
  "Tidak ada koneksi internet",
  "Ada keperluan mendadak",
  "Lainnya",
]

const DEFAULT_DAY_SCHEDULE: DaySchedule = {
  enabled: true,
  jamMasuk: "07:30",
  jamPulang: "14:00",
}

const DEFAULT_JADWAL: JadwalAbsensi = {
  jamMasuk: "07:30",
  jamPulang: "14:00",
  isLibur: false,
  sumber: "default",
  mode: "weekly",
}

const DEFAULT_RADIUS_KM = 0.2
const OPEN_BEFORE_MINUTES = 60
const CLOSE_AFTER_MINUTES = 240

function createDefaultWeeklySchedule(): Record<number, DaySchedule> {
  return {
    0: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
    1: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
    2: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
    3: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
    4: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
    5: { enabled: false, jamMasuk: "07:30", jamPulang: "14:00" },
    6: { enabled: true, jamMasuk: "07:30", jamPulang: "14:00" },
  }
}

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7)
}

function normalizeWeeklySchedule(data: any): Record<number, DaySchedule> {
  const defaults = createDefaultWeeklySchedule()

  if (data?.weeklySchedule && typeof data.weeklySchedule === "object") {
    const normalized: Record<number, DaySchedule> = { ...defaults }

    for (let i = 0; i < 7; i++) {
      const raw = data.weeklySchedule?.[i] ?? data.weeklySchedule?.[String(i)]
      if (raw) {
        normalized[i] = {
          enabled:
            typeof raw.enabled === "boolean" ? raw.enabled : defaults[i].enabled,
          jamMasuk: raw.jamMasuk || defaults[i].jamMasuk,
          jamPulang: raw.jamPulang || defaults[i].jamPulang,
        }
      }
    }

    return normalized
  }

  const jamMasuk = data?.jamMasuk || "07:30"
  const jamPulang = data?.jamPulang || "14:00"
  const hariLibur = Array.isArray(data?.hariLibur) ? data.hariLibur : [5]

  const migrated: Record<number, DaySchedule> = { ...defaults }
  for (let i = 0; i < 7; i++) {
    migrated[i] = {
      enabled: !hariLibur.includes(i),
      jamMasuk,
      jamPulang,
    }
  }

  return migrated
}

function getResolvedScheduleFromData(
  data: any,
  dateString: string
): { schedule: DaySchedule; mode: "weekly" | "monthly_override" } {
  const weeklySchedule = normalizeWeeklySchedule(data)
  const hariKe = new Date(dateString).getDay()
  const monthKey = getMonthKey(dateString)

  const monthlyOverride =
    data?.monthlyOverrides?.[monthKey]?.[dateString] ||
    data?.monthlyOverrides?.[monthKey]?.[String(dateString)]

  if (monthlyOverride && typeof monthlyOverride === "object") {
    return {
      schedule: {
        enabled:
          typeof monthlyOverride.enabled === "boolean"
            ? monthlyOverride.enabled
            : weeklySchedule[hariKe]?.enabled ?? DEFAULT_DAY_SCHEDULE.enabled,
        jamMasuk:
          monthlyOverride.jamMasuk ||
          weeklySchedule[hariKe]?.jamMasuk ||
          DEFAULT_DAY_SCHEDULE.jamMasuk,
        jamPulang:
          monthlyOverride.jamPulang ||
          weeklySchedule[hariKe]?.jamPulang ||
          DEFAULT_DAY_SCHEDULE.jamPulang,
      },
      mode: "monthly_override",
    }
  }

  return {
    schedule: weeklySchedule[hariKe] || DEFAULT_DAY_SCHEDULE,
    mode: "weekly",
  }
}

export default function AbsensiKaryawanPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [tanggal, setTanggal] = useState("")
  const [jam, setJam] = useState("")

  const [modal, setModal] = useState<ModalType>(null)
  const [alasan, setAlasan] = useState("")
  const [keterangan, setKeterangan] = useState("")
  const [pendingType, setPendingType] = useState<"masuk" | "pulang" | null>(null)
  const [mounted, setMounted] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [jadwalLoading, setJadwalLoading] = useState(true)
  const [lokasiLoading, setLokasiLoading] = useState(true)

  const wajibPilihAlasan = modal === "terlambat" || modal === "pulang_cepat"
  const alasanBelumDipilih = wajibPilihAlasan && !alasan

  const [alertModal, setAlertModal] = useState<{
    show: boolean
    type: "success" | "error" | "warning" | "info"
    title: string
    message: string
  } | null>(null)

  const [sudahMasuk, setSudahMasuk] = useState(false)
  const [sudahPulang, setSudahPulang] = useState(false)
  const [sudahIzinAtauSakit, setSudahIzinAtauSakit] = useState(false)
  const [sudahAbsenHariIni, setSudahAbsenHariIni] = useState(false)
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [karyawanId, setKaryawanId] = useState<string | null>(null)
  const [namaInstansi, setNamaInstansi] = useState("")
  const [isTidakWajib, setIsTidakWajib] = useState(false)
  const [jadwalAbsensi, setJadwalAbsensi] = useState<JadwalAbsensi>(DEFAULT_JADWAL)
  const [lokasiToko, setLokasiToko] = useState<LokasiToko>({
    tokoId: "",
    nama: "",
    latitude: null,
    longitude: null,
    radiusKm: DEFAULT_RADIUS_KM,
  })

  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const [Leaflet, setLeaflet] = useState<any>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const userMarkerRef = useRef<any>(null)
  const circleRef = useRef<any>(null)
  const geoWatchIdRef = useRef<number | null>(null)
  const hasCenteredToUserRef = useRef(false)
  const hasCenteredToTokoRef = useRef(false)
  const userInteractingRef = useRef(false)

  const showAlert = (
    type: "success" | "error" | "warning" | "info",
    title: string,
    message: string
  ) => {
    setAlertModal({ show: true, type, title, message })
  }

  const closeAlert = () => {
    if (alertModal?.type === "success") {
      setAlertModal(null)
      router.push("/karyawan")
      return
    }
    setAlertModal(null)
  }

  const hitungJarakKm = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ) => {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const targetLat = lokasiToko.latitude
  const targetLng = lokasiToko.longitude
  const targetRadiusKm = lokasiToko.radiusKm || DEFAULT_RADIUS_KM

  const diDalamRadius =
    userLat !== null &&
    userLng !== null &&
    targetLat !== null &&
    targetLng !== null &&
    hitungJarakKm(userLat, userLng, targetLat, targetLng) <= targetRadiusKm

  const nowMinute = jam ? toMinutes(jam) : 0
  const jamMasukMinute = toMinutes(jadwalAbsensi.jamMasuk)
  const jamPulangMinute = toMinutes(jadwalAbsensi.jamPulang)
  const jamBukaMinute = jamMasukMinute - OPEN_BEFORE_MINUTES
  const jamTutupMinute = jamPulangMinute + CLOSE_AFTER_MINUTES

  const isHariLibur = mounted ? jadwalAbsensi.isLibur : false

  const isJamAbsensiAktif =
    mounted &&
    !jadwalLoading &&
    !isHariLibur &&
    nowMinute >= jamBukaMinute &&
    nowMinute <= jamTutupMinute

  const lokasiTokoValid = targetLat !== null && targetLng !== null

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()

      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, "0")
      const dd = String(now.getDate()).padStart(2, "0")

      const hh = String(now.getHours()).padStart(2, "0")
      const min = String(now.getMinutes()).padStart(2, "0")

      setTanggal(`${yyyy}-${mm}-${dd}`)
      setJam(`${hh}:${min}`)
    }

    updateTime()
    const interval = setInterval(updateTime, 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    let active = true

    ;(async () => {
      const L = await import("leaflet")

      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      })

      if (active) setLeaflet(L)
    })()

    return () => {
      active = false
    }
  }, [])

  const saveToLocal = (data: {
    sudahMasuk?: boolean
    sudahPulang?: boolean
    sudahIzinAtauSakit?: boolean
  }) => {
    const key = `absensi-karyawan-${tanggal}`
    const prev = JSON.parse(localStorage.getItem(key) || "{}")

    localStorage.setItem(
      key,
      JSON.stringify({
        sudahMasuk: data.sudahMasuk ?? prev.sudahMasuk ?? false,
        sudahPulang: data.sudahPulang ?? prev.sudahPulang ?? false,
        sudahIzinAtauSakit:
          data.sudahIzinAtauSakit ?? prev.sudahIzinAtauSakit ?? false,
      })
    )
  }

  const applyResolvedSchedule = useCallback(
    (
      data: any,
      sumber: "default" | "instansi" | "individu",
      currentTanggal: string
    ) => {
      const resolved = getResolvedScheduleFromData(data, currentTanggal)

      setJadwalAbsensi({
        jamMasuk: resolved.schedule.jamMasuk,
        jamPulang: resolved.schedule.jamPulang,
        isLibur: !resolved.schedule.enabled,
        sumber,
        mode: resolved.mode,
      })
    },
    []
  )

  const loadPengaturanJamAbsensi = useCallback(
    async (
      currentKaryawanId: string,
      currentInstansi: string,
      currentTanggal: string
    ) => {
      setJadwalLoading(true)

      try {
        const individuRef = doc(
          db,
          "pengaturan_jam_absensi",
          `karyawan_${currentKaryawanId}`
        )
        const instansiRef = doc(
          db,
          "pengaturan_jam_absensi",
          `instansi_${currentInstansi}`
        )
        const defaultRef = doc(db, "pengaturan_jam_absensi", "default")

        const individuSnap = await getDoc(individuRef)
        if (individuSnap.exists()) {
          applyResolvedSchedule(individuSnap.data(), "individu", currentTanggal)
          setJadwalLoading(false)
          return
        }

        if (currentInstansi) {
          const instansiSnap = await getDoc(instansiRef)
          if (instansiSnap.exists()) {
            applyResolvedSchedule(instansiSnap.data(), "instansi", currentTanggal)
            setJadwalLoading(false)
            return
          }
        }

        const defaultSnap = await getDoc(defaultRef)
        if (defaultSnap.exists()) {
          applyResolvedSchedule(defaultSnap.data(), "default", currentTanggal)
        } else {
          setJadwalAbsensi(DEFAULT_JADWAL)
        }
      } catch (error) {
        console.error("Error load pengaturan jam absensi:", error)
        setJadwalAbsensi(DEFAULT_JADWAL)
      } finally {
        setJadwalLoading(false)
      }
    },
    [applyResolvedSchedule]
  )

  useEffect(() => {
    if (!tanggal) return

    let unsubAbsensi: (() => void) | null = null

    const unsubAuth = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setSudahMasuk(false)
        setSudahPulang(false)
        setSudahIzinAtauSakit(false)
        setSudahAbsenHariIni(false)
        setJadwalAbsensi(DEFAULT_JADWAL)
        setLokasiToko({
          tokoId: "",
          nama: "",
          latitude: null,
          longitude: null,
          radiusKm: DEFAULT_RADIUS_KM,
        })
        setJadwalLoading(false)
        setLokasiLoading(false)
        return
      }

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid))

        if (!userSnap.exists()) {
          setSudahMasuk(false)
          setSudahPulang(false)
          setSudahIzinAtauSakit(false)
          setSudahAbsenHariIni(false)
          setJadwalAbsensi(DEFAULT_JADWAL)
          setLokasiLoading(false)
          setJadwalLoading(false)
          return
        }

        const userData = userSnap.data()
        const instansiNama =
          userData?.instansi?.nama || userData?.instansi || ""
        setNamaInstansi(instansiNama)

        const karyawanIdValue =
          userData?.permissions?.karyawanId ||
          userData?.permissions?.karyawanid ||
          userData?.karyawanId ||
          user.uid

        setKaryawanId(karyawanIdValue)

        const tokoIdValue =
          userData?.permissions?.tokoId ||
          userData?.tokoId ||
          userData?.toko?.id ||
          null

        if (tokoIdValue) {
          setLokasiLoading(true)
          const tokoSnap = await getDoc(doc(db, "toko", tokoIdValue))

          if (tokoSnap.exists()) {
            const tokoData = tokoSnap.data()
            setLokasiToko({
              tokoId: tokoSnap.id,
              nama: tokoData?.nama || "",
              latitude:
                typeof tokoData?.latitude === "number" ? tokoData.latitude : null,
              longitude:
                typeof tokoData?.longitude === "number" ? tokoData.longitude : null,
              radiusKm:
                typeof tokoData?.radiusKm === "number" && tokoData.radiusKm > 0
                  ? tokoData.radiusKm
                  : DEFAULT_RADIUS_KM,
            })
          } else {
            setLokasiToko({
              tokoId: "",
              nama: "",
              latitude: null,
              longitude: null,
              radiusKm: DEFAULT_RADIUS_KM,
            })
          }
          setLokasiLoading(false)
        } else {
          setLokasiToko({
            tokoId: "",
            nama: "",
            latitude: null,
            longitude: null,
            radiusKm: DEFAULT_RADIUS_KM,
          })
          setLokasiLoading(false)
        }

        const tidakWajibSnap = await getDoc(
          doc(db, "karyawan_tidak_wajib_absen", karyawanIdValue)
        )
        setIsTidakWajib(tidakWajibSnap.exists())

        await loadPengaturanJamAbsensi(karyawanIdValue, instansiNama, tanggal)

        const docId = `${karyawanIdValue}_${tanggal}`
        const absensiRef = doc(db, "absensi_karyawan", docId)

        unsubAbsensi = onSnapshot(
          absensiRef,
          (snap) => {
            if (!snap.exists()) {
              setSudahMasuk(false)
              setSudahPulang(false)
              setSudahIzinAtauSakit(false)
              setSudahAbsenHariIni(false)
              localStorage.removeItem(`absensi-karyawan-${tanggal}`)
              return
            }

            const data = snap.data()
            const isMasuk = !!data?.jamMasuk
            const isPulang = !!data?.jamPulang
            const isIzinSakit = data?.status === "izin" || data?.status === "sakit"

            setSudahMasuk(isMasuk)
            setSudahPulang(isPulang)
            setSudahIzinAtauSakit(isIzinSakit)
            setSudahAbsenHariIni(isMasuk || isIzinSakit)

            saveToLocal({
              sudahMasuk: isMasuk,
              sudahPulang: isPulang,
              sudahIzinAtauSakit: isIzinSakit,
            })
          },
          (error) => {
            console.error("Firestore listener error:", error)
          }
        )
      } catch (error) {
        console.error("Error dalam auth listener:", error)
        setJadwalAbsensi(DEFAULT_JADWAL)
        setLokasiToko({
          tokoId: "",
          nama: "",
          latitude: null,
          longitude: null,
          radiusKm: DEFAULT_RADIUS_KM,
        })
        setLokasiLoading(false)
        setJadwalLoading(false)
      }
    })

    return () => {
      unsubAuth()
      if (unsubAbsensi) unsubAbsensi()
    }
  }, [tanggal, loadPengaturanJamAbsensi])

  const stopWatchLocation = useCallback(() => {
    if (geoWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchIdRef.current)
      geoWatchIdRef.current = null
    }
  }, [])

  const startWatchLocation = useCallback(() => {
    if (!navigator.geolocation) {
      showAlert("error", "GPS Tidak Tersedia", "Browser Anda tidak mendukung GPS.")
      return
    }

    setGpsLoading(true)
    stopWatchLocation()

    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
        setGpsLoading(false)
      },
      (err) => {
        console.error("GPS error:", err)
        setUserLat(null)
        setUserLng(null)
        setGpsLoading(false)

        let errorMsg = "Tidak dapat mengakses lokasi GPS."
        if (err.code === 1) {
          errorMsg = "Izin akses lokasi ditolak. Silakan aktifkan GPS anda."
        } else if (err.code === 2) {
          errorMsg = "Lokasi tidak tersedia. Pastikan GPS perangkat aktif."
        } else if (err.code === 3) {
          errorMsg = "Waktu tunggu GPS habis. Silakan coba lagi."
        }

        showAlert("error", "GPS Error", errorMsg)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 20000,
      }
    )
  }, [stopWatchLocation])

  const handleRefreshGPS = async () => {
    if (!navigator.geolocation) {
      showAlert("error", "Tidak Support", "Browser tidak mendukung GPS.")
      return
    }

    try {
      const permission = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      })

      if (permission.state === "granted") {
        showAlert("info", "GPS Aktif", "Browser menggunakan GPS perangkat.")
      } else if (permission.state === "prompt") {
        showAlert("info", "Meminta Izin", "Browser akan meminta izin GPS.")
      } else {
        showAlert("error", "GPS Ditolak", "Aktifkan GPS di browser / device.")
        return
      }
    } catch {
      showAlert("warning", "Status Tidak Diketahui", "Coba aktifkan GPS manual.")
    }

    startWatchLocation()
  }

  useEffect(() => {
    if (!mounted) return

    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((res) => {
        if (res.state === "granted" || res.state === "prompt") {
          startWatchLocation()
        }
      })
      .catch(() => {
        startWatchLocation()
      })

    return () => {
      stopWatchLocation()
    }
  }, [mounted, startWatchLocation, stopWatchLocation])

  useEffect(() => {
    if (!Leaflet || !isJamAbsensiAktif || !mapRef.current || !lokasiTokoValid) return

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = Leaflet.map(mapRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([targetLat!, targetLng!], 14)

      Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(mapInstanceRef.current)

      mapInstanceRef.current.on("dragstart", () => {
        userInteractingRef.current = true
      })

      mapInstanceRef.current.on("zoomstart", () => {
        userInteractingRef.current = true
      })

      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize()
      }, 300)

      setIsMapReady(true)
    }

    return () => {
      if ((!isJamAbsensiAktif || !lokasiTokoValid) && mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        userMarkerRef.current = null
        circleRef.current = null
        hasCenteredToUserRef.current = false
        hasCenteredToTokoRef.current = false
        userInteractingRef.current = false
        setIsMapReady(false)
      }
    }
  }, [Leaflet, isJamAbsensiAktif, lokasiTokoValid, targetLat, targetLng])

  useEffect(() => {
    if (!Leaflet || !mapInstanceRef.current || !isMapReady || !lokasiTokoValid) return

    const radius = targetRadiusKm * 1000

    if (circleRef.current) {
      mapInstanceRef.current.removeLayer(circleRef.current)
    }

    circleRef.current = Leaflet.circle([targetLat!, targetLng!], {
      radius,
      color: "green",
      weight: 2,
      fillColor: "rgb(20, 231, 83)",
      fillOpacity: 0.25,
    }).addTo(mapInstanceRef.current)

    if (!hasCenteredToTokoRef.current && userLat === null && userLng === null) {
      mapInstanceRef.current.setView([targetLat!, targetLng!], 14)
      hasCenteredToTokoRef.current = true
    }

    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize()
    }, 200)
  }, [Leaflet, userLat, userLng, isMapReady, lokasiTokoValid, targetLat, targetLng, targetRadiusKm])

  useEffect(() => {
    if (!Leaflet || !mapInstanceRef.current || !isMapReady) return
    if (userLat === null || userLng === null) return

    const gpsIcon = Leaflet.divIcon({
      className: "",
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #3b82f6, #06b6d4);
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(59,130,246,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    })

    if (!userMarkerRef.current) {
      userMarkerRef.current = Leaflet.marker([userLat, userLng], { icon: gpsIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup("Lokasi Anda")
    } else {
      userMarkerRef.current.setLatLng([userLat, userLng])
      userMarkerRef.current.setIcon(gpsIcon)
    }

    if (!hasCenteredToUserRef.current && !userInteractingRef.current) {
      mapInstanceRef.current.setView([userLat, userLng], 16)
      hasCenteredToUserRef.current = true
    }
  }, [Leaflet, userLat, userLng, isMapReady])

  const submitAbsensi = async (payload: Record<string, any>) => {
    const user = auth.currentUser
    if (!user) return

    setLoading(true)
    const token = await user.getIdToken()

    const butuhGPS = payload.type === "masuk" || payload.type === "pulang"

    if (butuhGPS && (userLat === null || userLng === null)) {
      showAlert("error", "GPS Tidak Aktif", "GPS wajib aktif untuk absen masuk atau pulang.")
      setLoading(false)
      return
    }

    const res = await fetch("/api/laporan-absensi-karyawan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tanggal,
        jam,
        metode: butuhGPS ? "gps" : "manual",
        lokasi: butuhGPS ? { lat: userLat, lng: userLng } : null,
        tokoId: lokasiToko.tokoId || null,
        ...payload,
      }),
    })

    const data = await res.json()

    if (res.status === 409 && data.code === "ALREADY_ABSENT") {
      let pesan = "Anda sudah absensi hari ini"

      if (payload.type === "masuk") {
        pesan = "Anda sudah absensi masuk hari ini"
        setSudahMasuk(true)
        saveToLocal({ sudahMasuk: true })
      } else if (payload.type === "pulang") {
        pesan = "Anda sudah absensi pulang hari ini"
        setSudahPulang(true)
        saveToLocal({ sudahPulang: true })
      } else if (payload.status === "izin") {
        pesan = "Anda sudah mengajukan izin hari ini"
        setSudahIzinAtauSakit(true)
        saveToLocal({ sudahIzinAtauSakit: true })
      } else if (payload.status === "sakit") {
        pesan = "Anda sudah mengajukan sakit hari ini"
        setSudahIzinAtauSakit(true)
        saveToLocal({ sudahIzinAtauSakit: true })
      }

      showAlert("warning", "Sudah Absen", pesan)
      setLoading(false)
      return
    }

    if (!res.ok) {
      showAlert(
        "error",
        "Gagal Absensi",
        data.error || "Terjadi kesalahan saat melakukan absensi."
      )
      setLoading(false)
      setPendingType(null)
      return
    }

    if (payload.status === "izin" || payload.status === "sakit") {
      setSudahIzinAtauSakit(true)
      saveToLocal({ sudahIzinAtauSakit: true })
    }

    if (payload.type === "masuk") {
      setSudahMasuk(true)
      saveToLocal({ sudahMasuk: true })
    }

    if (payload.type === "pulang") {
      setSudahPulang(true)
      saveToLocal({ sudahPulang: true })
    }

    setLoading(false)
    setModal(null)
    setAlasan("")
    setKeterangan("")
    setPendingType(null)
    showAlert("success", "Berhasil", "Absensi Anda telah berhasil disimpan.")
  }

  const handleMasukPulang = (type: "masuk" | "pulang") => {
    setPendingType(type)

    if (jadwalLoading) {
      showAlert("info", "Memuat Jadwal", "Pengaturan jam absensi masih dimuat.")
      setPendingType(null)
      return
    }

    if (lokasiLoading) {
      showAlert("info", "Memuat Lokasi", "Lokasi toko masih dimuat.")
      setPendingType(null)
      return
    }

    if (!lokasiTokoValid) {
      showAlert("error", "Lokasi Toko Belum Ada", "Koordinat toko belum diatur.")
      setPendingType(null)
      return
    }

    if (isHariLibur) {
      showAlert("warning", "Hari Libur", "Hari ini termasuk hari libur absensi.")
      setPendingType(null)
      return
    }

    if (!isJamAbsensiAktif) {
      if (nowMinute < jamBukaMinute) {
        showAlert(
          "warning",
          "Belum Waktu Absensi",
          `Absensi dibuka mulai pukul ${String(Math.floor(jamBukaMinute / 60)).padStart(2, "0")}:${String(jamBukaMinute % 60).padStart(2, "0")}.`
        )
      } else {
        showAlert(
          "warning",
          "Waktu Absensi Selesai",
          `Absensi ditutup pukul ${String(Math.floor(jamTutupMinute / 60)).padStart(2, "0")}:${String(jamTutupMinute % 60).padStart(2, "0")}.`
        )
      }
      setPendingType(null)
      return
    }

    if (!diDalamRadius) {
      showAlert(
        "error",
        "Di Luar Radius",
        "Anda berada di luar radius toko. Masuk dan pulang hanya bisa dilakukan di lokasi toko."
      )
      setPendingType(null)
      return
    }

    if (type === "masuk" && sudahMasuk) {
      showAlert("warning", "Sudah Absen", "Anda sudah melakukan absen masuk hari ini.")
      setPendingType(null)
      return
    }

    if (type === "pulang" && !sudahMasuk) {
      showAlert("warning", "Belum Absen Masuk", "Silakan absen masuk terlebih dahulu.")
      setPendingType(null)
      return
    }

    if (type === "pulang" && sudahPulang) {
      showAlert("warning", "Sudah Absen", "Anda sudah melakukan absen pulang hari ini.")
      setPendingType(null)
      return
    }

    if (type === "masuk") {
      if (nowMinute <= jamMasukMinute) {
        submitAbsensi({ type: "masuk", status: "hadir" })
      } else {
        setPendingType("masuk")
        setModal("terlambat")
      }
      return
    }

    if (nowMinute < jamPulangMinute) {
      setPendingType("pulang")
      setModal("pulang_cepat")
    } else {
      submitAbsensi({ type: "pulang", status: "hadir" })
    }
  }

  return (
    <div className="relative min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute left-0 top-1/4 h-96 w-96 rounded-full bg-cyan-200/30 blur-[120px]" />
        <div className="absolute right-0 bottom-1/3 h-96 w-96 rounded-full bg-emerald-200/30 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto w-full px-3 py-3 sm:px-4 sm:py-4 lg:p-8 max-w-md sm:max-w-xl md:max-w-3xl lg:max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-1 text-center rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex justify-center mb-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-200/50">
                <MapPin size={28} className="text-white" strokeWidth={2.5} />
              </div>
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              Absensi Karyawan
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-1">
              Absensi GPS Harian
            </p>
            {lokasiToko.nama && (
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Lokasi Toko: {lokasiToko.nama}
              </p>
            )}
          </motion.div>

          {isTidakWajib ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex items-center justify-center"
            >
              <p className="text-sm font-bold text-slate-500">
                Anda tidak wajib melakukan absensi hari ini.
              </p>
            </motion.div>
          ) : jadwalLoading || lokasiLoading ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm space-y-3"
            >
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 size={28} className="animate-spin text-cyan-500" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Memuat pengaturan absensi...
                </p>
              </div>
            </motion.div>
          ) : isJamAbsensiAktif && lokasiTokoValid ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
            >
              <div className="relative rounded-lg overflow-hidden border border-slate-200 z-0 bg-slate-100">
                <div ref={mapRef} className="w-full h-64 sm:h-72 z-0" />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Titik Toko
                </p>
                <p className="text-sm font-bold text-slate-700 mt-1">
                  {lokasiToko.nama || "-"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {targetLat}, {targetLng} · Radius {targetRadiusKm} km
                </p>
              </div>

              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    gpsLoading
                      ? "bg-blue-100"
                      : userLat !== null && userLng !== null
                      ? diDalamRadius
                        ? "bg-emerald-100"
                        : "bg-orange-100"
                      : "bg-red-100"
                  }`}
                >
                  {gpsLoading ? (
                    <Loader2
                      size={16}
                      className="animate-spin text-blue-600"
                      strokeWidth={2.5}
                    />
                  ) : (
                    <MapPin
                      size={16}
                      strokeWidth={2.5}
                      className={
                        userLat !== null && userLng !== null
                          ? diDalamRadius
                            ? "text-emerald-600"
                            : "text-orange-600"
                          : "text-red-600"
                      }
                    />
                  )}
                </div>

                <div className="flex-1 leading-tight">
                  {gpsLoading ? (
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-wide">
                      Mencari lokasi GPS...
                    </p>
                  ) : userLat !== null && userLng !== null ? (
                    diDalamRadius ? (
                      <div className="flex flex-col items-start gap-0.5">
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-wide">
                          Di dalam radius toko
                        </p>
                        <p className="text-[10px] font-semibold text-slate-500">
                          GPS aktif
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-start gap-0.5">
                        <p className="text-[10px] font-black text-orange-700 uppercase tracking-wide">
                          Di luar radius toko
                        </p>
                        <p className="text-[10px] font-bold text-orange-700 uppercase tracking-wide">
                          Tidak bisa melakukan absensi
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-start gap-0.5">
                      <p className="text-[10px] font-black text-red-600 uppercase tracking-wide">
                        GPS tidak aktif
                      </p>
                      <p className="text-[10px] font-semibold text-slate-500">
                        Klik tombol refresh untuk mengaktifkan
                      </p>
                    </div>
                  )}
                </div>

                {(userLat === null || userLng === null || gpsLoading) && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleRefreshGPS}
                    disabled={gpsLoading}
                    className="px-3 py-2 rounded-lg bg-gradient-to-r from-blue-400 to-cyan-500 text-white font-bold text-[10px] uppercase tracking-wider shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={gpsLoading ? "animate-spin" : ""}
                    >
                      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                    </svg>
                    {gpsLoading ? "Mencari..." : "Refresh"}
                  </motion.button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">
                    Tanggal
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={tanggal}
                      disabled
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-800 font-semibold cursor-not-allowed text-sm"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Calendar size={16} className="text-slate-400" strokeWidth={2} />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">
                    Jam
                  </label>
                  <div className="relative">
                    <input
                      type="time"
                      value={jam}
                      disabled
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-slate-800 font-semibold cursor-not-allowed text-sm"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Clock size={16} className="text-slate-400" strokeWidth={2} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 pb-20">
                <motion.button
                  whileHover={
                    !sudahAbsenHariIni && diDalamRadius && !loading ? { scale: 1.02 } : {}
                  }
                  whileTap={
                    !sudahAbsenHariIni && diDalamRadius && !loading ? { scale: 0.98 } : {}
                  }
                  disabled={sudahAbsenHariIni || !diDalamRadius || loading}
                  onClick={() => handleMasukPulang("masuk")}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-full font-black uppercase tracking-[0.1em] text-[11px] shadow-lg transition-all ${
                    sudahAbsenHariIni || !diDalamRadius
                      ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                      : "bg-gradient-to-r from-blue-400 to-cyan-500 text-white shadow-blue-200/50 hover:shadow-xl"
                  }`}
                >
                  <LogIn size={16} strokeWidth={2.5} />
                  {loading && pendingType === "masuk" ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="animate-spin" size={16} />
                      Memproses...
                    </span>
                  ) : (
                    "Masuk"
                  )}
                </motion.button>

                <motion.button
                  whileHover={
                    !(!sudahMasuk || sudahPulang || sudahIzinAtauSakit) ? { scale: 1.02 } : {}
                  }
                  whileTap={
                    !(!sudahMasuk || sudahPulang || sudahIzinAtauSakit) ? { scale: 0.98 } : {}
                  }
                  disabled={!sudahMasuk || sudahPulang || sudahIzinAtauSakit || !diDalamRadius}
                  onClick={() => handleMasukPulang("pulang")}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-full font-black uppercase tracking-[0.1em] text-[11px] shadow-lg transition-all ${
                    !sudahMasuk || sudahPulang || sudahIzinAtauSakit || !diDalamRadius
                      ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                      : "bg-gradient-to-r from-emerald-400 to-green-500 text-white shadow-emerald-200/50 hover:shadow-xl"
                  }`}
                >
                  <LogOut size={16} strokeWidth={2.5} />
                  {loading && pendingType === "pulang" ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="animate-spin" size={16} />
                      Memproses...
                    </span>
                  ) : (
                    "Pulang"
                  )}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    if (sudahMasuk || sudahPulang) {
                      showAlert(
                        "warning",
                        "Tidak Bisa Izin",
                        "Anda sudah absen hari ini."
                      )
                      return
                    }
                    setModal("izin")
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 font-black uppercase tracking-[0.1em] text-[11px] text-white shadow-lg shadow-yellow-200/50 hover:shadow-xl transition-all"
                >
                  <FileText size={16} strokeWidth={2.5} />
                  Izin
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    if (sudahMasuk || sudahPulang) {
                      showAlert(
                        "error",
                        "Tidak Bisa Sakit",
                        "Anda sudah absen hari ini."
                      )
                      return
                    }
                    setModal("sakit")
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-red-400 to-pink-500 font-black uppercase tracking-[0.1em] text-[11px] text-white shadow-lg shadow-red-200/50 hover:shadow-xl transition-all"
                >
                  <AlertCircle size={16} strokeWidth={2.5} />
                  Sakit
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex items-center justify-center"
            >
              <p className="text-sm font-bold text-slate-500 text-center">
                {!lokasiTokoValid
                  ? "Lokasi toko belum diatur. Silakan isi latitude dan longitude toko terlebih dahulu."
                  : isHariLibur
                  ? "Hari ini adalah hari libur absensi."
                  : `Absensi aktif mulai ${jadwalAbsensi.jamMasuk} sampai ${jadwalAbsensi.jamPulang}.`}
              </p>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
  {modal && (
    <motion.div
      key={`form-modal-${modal}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-white rounded-2xl border border-slate-200 w-full max-w-sm p-6 shadow-lg space-y-5"
      >
        <div className="flex items-center gap-2">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg ${
              modal === "izin"
                ? "bg-gradient-to-br from-yellow-400 to-orange-500 shadow-yellow-200/50"
                : modal === "sakit"
                ? "bg-gradient-to-br from-red-400 to-pink-500 shadow-red-200/50"
                : "bg-gradient-to-br from-blue-400 to-cyan-500 shadow-blue-200/50"
            }`}
          >
            {modal === "izin" ? (
              <FileText size={24} className="text-white" strokeWidth={2.5} />
            ) : modal === "sakit" ? (
              <AlertCircle size={24} className="text-white" strokeWidth={2.5} />
            ) : (
              <Clock size={24} className="text-white" strokeWidth={2.5} />
            )}
          </div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">
            {modal === "izin"
              ? "Form Izin"
              : modal === "sakit"
              ? "Form Sakit"
              : modal === "terlambat"
              ? "Alasan Terlambat"
              : "Alasan Pulang Cepat"}
          </h2>
        </div>

        {(modal === "izin" || modal === "terlambat" || modal === "pulang_cepat") && (
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
              Alasan
            </label>
            <select
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400/50 text-slate-800 font-semibold"
            >
              <option value="">Pilih alasan</option>
              {(modal === "izin"
                ? ["Tugas Kantor", "Tugas Dinas", "Pribadi"]
                : ALASAN_KHUSUS
              ).map((a, i) => (
                <option key={`${modal}-${i}-${a}`} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
            Keterangan
          </label>
          <textarea
            rows={3}
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400/50 text-slate-800 font-semibold placeholder:text-slate-300 resize-none"
            placeholder="Tuliskan keterangan..."
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setModal(null)}
            className="flex-1 px-5 py-3 rounded-full border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            Batal
          </motion.button>

          <motion.button
            whileHover={{ scale: loading || alasanBelumDipilih ? 1 : 1.02 }}
            whileTap={{ scale: loading || alasanBelumDipilih ? 1 : 0.98 }}
            disabled={loading || alasanBelumDipilih}
            onClick={() => {
              if (alasanBelumDipilih) return

              const isMasuk =
                pendingType === "masuk" || modal === "terlambat"

              submitAbsensi({
                type: pendingType ?? modal,
                status:
                  modal === "terlambat"
                    ? "terlambat"
                    : modal === "pulang_cepat"
                    ? "pulang_cepat"
                    : modal === "izin"
                    ? "izin"
                    : "sakit",
                ...(modal === "izin" || modal === "sakit"
                  ? {
                      alasanIzin: alasan || modal,
                      keteranganIzin: keterangan,
                    }
                  : isMasuk
                  ? {
                      alasanMasuk: alasan,
                      keteranganMasuk: keterangan,
                    }
                  : {
                      alasanPulang: alasan,
                      keteranganPulang: keterangan,
                    }),
              })
            }}
            className="flex-1 px-5 py-3 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 font-black uppercase tracking-[0.1em] text-white hover:shadow-lg hover:shadow-emerald-200/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-200/30 text-[11px]"
          >
            {loading ? "Mengirim..." : "Kirim"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )}

  {alertModal && (
    <motion.div
      key={`alert-modal-${alertModal.type}-${alertModal.title}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-[60] p-4"
      onClick={closeAlert}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-slate-200 w-full max-w-sm p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg ${
              alertModal.type === "success"
                ? "bg-gradient-to-br from-emerald-400 to-green-500 shadow-emerald-200/50"
                : alertModal.type === "error"
                ? "bg-gradient-to-br from-red-400 to-pink-500 shadow-red-200/50"
                : alertModal.type === "warning"
                ? "bg-gradient-to-br from-yellow-400 to-orange-500 shadow-yellow-200/50"
                : "bg-gradient-to-br from-blue-400 to-cyan-500 shadow-blue-200/50"
            }`}
          >
            {alertModal.type === "warning" ? (
              <AlertCircle size={24} className="text-white" strokeWidth={2.5} />
            ) : (
              <span className="text-white font-black text-xl">!</span>
            )}
          </div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">
            {alertModal.title}
          </h2>
        </div>

        <p className="text-sm font-medium text-slate-600 leading-relaxed pl-1">
          {alertModal.message}
        </p>

        <div className="pt-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={closeAlert}
            className="w-full px-5 py-3 rounded-full font-black uppercase tracking-[0.1em] text-white shadow-lg transition-all text-[11px] bg-gradient-to-r from-blue-400 to-cyan-500 shadow-blue-200/50 hover:shadow-xl"
          >
            Tutup
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
        </div>
      </div>
    </div>
  )
}