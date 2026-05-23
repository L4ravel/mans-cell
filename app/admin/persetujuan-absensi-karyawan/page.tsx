"use client"

/*
  Page Persetujuan Absensi Karyawan.
  Dibuat dari pola Persetujuan Absensi PTK.
  - Layout emerald konsisten.
  - Data diambil dari koleksi absensi_karyawan.
  - Approval lewat API /api/laporan-absensi-karyawan/approval agar summary ikut sinkron.
  - Setelah setujui/tolak, data lokal langsung dihapus tanpa refetch penuh.
  - Mobile card rapi, desktop tabel.
  - Modal konfirmasi tengah.
*/

import { useEffect, useMemo, useState } from "react"
import { auth, db } from "@/lib/firebase"
import { collection, getDocs, query, where } from "firebase/firestore"
import {
  AlertCircle,
  CheckCircle2,
  ClipboardClock,
  Clock,
  Cpu,
  Hand,
  HeartPulse,
  RefreshCw,
  Store,
  User,
  X,
  XCircle,
} from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

const APPROVAL_API_URL = "/api/laporan-absensi-karyawan/approval"

type Absensi = {
  id: string
  karyawanId: string
  namaKaryawan?: string
  nama?: string
  karyawanNama?: string
  toko?: { nama?: string }
  tokoNama?: string
  unitKerja?: { nama?: string } | string | null
  unitKerjaNama?: string
  jabatan?: string | null
  tanggal: string
  tanggalKerja?: string
  status: string
  approvalStatus?: string
  alasanMasuk?: string | null
  keteranganMasuk?: string | null
  alasanPulang?: string | null
  keteranganPulang?: string | null
  alasanIzin?: string | null
  keteranganIzin?: string | null
}

const getHari = (tanggal: string) => {
  if (!tanggal) return "-"

  try {
    return new Date(`${tanggal}T00:00:00`).toLocaleDateString("id-ID", {
      weekday: "long",
    })
  } catch {
    return "-"
  }
}

function getTanggalTampil(data: Absensi) {
  return data.tanggalKerja || data.tanggal || "-"
}

function getNamaKaryawan(data: Absensi) {
  return data.namaKaryawan || data.nama || data.karyawanNama || "-"
}

function getTokoNama(data: Absensi) {
  return data.toko?.nama || data.tokoNama || "-"
}

function getUnitKerjaNama(data: Absensi) {
  return data.jabatan || "-"
}

function getJabatan(data: Absensi) {
  return data.jabatan || "-"
}

function getAlasan(data: Absensi) {
  return data.alasanIzin || data.alasanMasuk || data.alasanPulang || "-"
}

function getKeterangan(data: Absensi) {
  return data.keteranganIzin || data.keteranganMasuk || data.keteranganPulang || "-"
}

export default function PendingAbsensiKaryawanPage() {
  const [data, setData] = useState<Absensi[]>([])
  const [loading, setLoading] = useState(false)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<"approved" | "rejected" | null>(null)
  const [executing, setExecuting] = useState(false)

  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null)

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 2400)
  }

  const fetchData = async () => {
    const user = auth.currentUser
    if (!user) return

    setLoading(true)

    try {
      const q = query(
        collection(db, "absensi_karyawan"),
        where("approvalStatus", "==", "pending"),
        where("status", "in", ["izin", "sakit"])
      )

      const snap = await getDocs(q)

      const list = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
        .sort((a, b) => {
          const tanggalA = String(a.tanggalKerja || a.tanggal || "")
          const tanggalB = String(b.tanggalKerja || b.tanggal || "")
          return tanggalB.localeCompare(tanggalA)
        })

      setData(list)
    } catch (err) {
      console.error(err)
      setData([])
      showToast("err", "Gagal memuat data pengajuan absensi")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) fetchData()
      else setData([])
    })

    return () => unsub()
  }, [])

  const updateStatus = (id: string, keputusan: "approved" | "rejected") => {
    setConfirmId(id)
    setConfirmAction(keputusan)
    setConfirmOpen(true)
  }

  const executeApproval = async () => {
    if (!confirmId || !confirmAction) return

    const user = auth.currentUser
    if (!user) return

    setExecuting(true)

    try {
      const token = await user.getIdToken()

      const res = await fetch(APPROVAL_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: confirmId,
          status: confirmAction,
          forceRepair: confirmAction === "approved",
        }),
      })

      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(json?.error || "Gagal memproses approval")
      }

      setData((prev) => prev.filter((item) => item.id !== confirmId))

      showToast(
        "ok",
        confirmAction === "approved"
          ? "Pengajuan absensi karyawan berhasil disetujui"
          : "Pengajuan absensi karyawan berhasil ditolak"
      )

      setConfirmOpen(false)
      setConfirmId(null)
      setConfirmAction(null)
    } catch (err: any) {
      console.error(err)
      showToast("err", err?.message || "Gagal memproses approval")
    } finally {
      setExecuting(false)
    }
  }

  const confirmTarget = data.find((d) => d.id === confirmId)

  const totalPending = data.length
  const totalIzin = useMemo(() => data.filter((item) => item.status === "izin").length, [data])
  const totalSakit = useMemo(() => data.filter((item) => item.status === "sakit").length, [data])

  return (
    <div className="relative min-h-screen bg-white text-slate-900">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/70 blur-[110px]" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-slate-100/70 blur-[120px]" />
        <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-zinc-50/80 blur-[110px]" />
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`fixed right-4 top-4 z-[80] rounded-2xl border px-4 py-3 shadow-lg ${
              toast.type === "ok"
                ? "border-emerald-200 bg-emerald-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            <div className="flex items-start gap-2">
              {toast.type === "ok" ? (
                <CheckCircle2 size={16} className="mt-0.5 text-emerald-600" strokeWidth={2.5} />
              ) : (
                <AlertCircle size={16} className="mt-0.5 text-red-600" strokeWidth={2.5} />
              )}

              <p className={`max-w-xs text-xs font-black leading-relaxed ${toast.type === "ok" ? "text-emerald-700" : "text-red-700"}`}>
                {toast.msg}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative z-10 w-full space-y-4 p-3 pb-28 sm:p-4 lg:p-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 px-4 py-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-18px_42px_rgba(6,78,59,0.24)] sm:px-5 sm:py-5"
        >
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12">
                <ClipboardClock size={28} className="text-white sm:h-8 sm:w-8" strokeWidth={2.5} />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Persetujuan Absensi Karyawan
                </h1>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-50/85 sm:text-sm">
                  Izin dan sakit karyawan yang menunggu persetujuan.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} strokeWidth={2.5} />
              Refresh
            </button>
          </div>

          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-yellow-300/10 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 opacity-[0.05]">
            <Cpu size={170} className="text-white" strokeWidth={1} />
          </div>
        </motion.div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <SummaryCard
            icon={<Clock size={21} strokeWidth={2.5} />}
            label="Pending"
            value={String(totalPending)}
            iconClassName="bg-emerald-50 text-emerald-600"
          />

          <SummaryCard
            icon={<Hand size={21} strokeWidth={2.5} />}
            label="Izin"
            value={String(totalIzin)}
            iconClassName="bg-amber-50 text-amber-600"
          />

          <SummaryCard
            icon={<HeartPulse size={21} strokeWidth={2.5} />}
            label="Sakit"
            value={String(totalSakit)}
            iconClassName="bg-red-50 text-red-600"
            className="hidden lg:block"
          />
        </div>

        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
              className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-emerald-500"
            />

            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              Memuat data...
            </p>
          </motion.div>
        )}

        {!loading && data.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <CheckCircle2 size={28} className="text-slate-300" strokeWidth={2} />
            </div>

            <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400">
              Tidak ada absensi pending
            </p>
          </motion.div>
        )}

        {!loading && data.length > 0 && (
          <div className="w-full space-y-2 lg:hidden">
            {data.map((d, idx) => (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.03 }}
                className={`flex w-full items-start justify-between gap-2 overflow-hidden rounded-2xl border border-slate-200 border-l-4 bg-white p-3 shadow-sm ${
                  d.status === "izin" ? "border-l-amber-400" : "border-l-red-400"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={d.status} />

                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">
                      Pending
                    </span>
                  </div>

                  <p className="mt-2 break-words text-sm font-black leading-tight text-slate-800">
                    {getNamaKaryawan(d)}
                  </p>

                  <p className="mt-0.5 break-words text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-400">
                    {getTokoNama(d)} · {getUnitKerjaNama(d)}
                  </p>

                  <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Tanggal
                    </p>
                    <p className="mt-0.5 text-xs font-black capitalize text-slate-700">
                      {getHari(getTanggalTampil(d))}, {getTanggalTampil(d)}
                    </p>
                  </div>

                  {(getAlasan(d) !== "-" || getKeterangan(d) !== "-") && (
                    <div className="mt-2 space-y-1 rounded-xl border border-slate-100 bg-white px-3 py-2">
                      {getAlasan(d) !== "-" && (
                        <p className="break-words text-[11px] font-semibold leading-relaxed text-slate-600">
                          <span className="font-black uppercase tracking-wide text-slate-400">
                            Alasan:{" "}
                          </span>
                          {getAlasan(d)}
                        </p>
                      )}

                      {getKeterangan(d) !== "-" && (
                        <p className="break-words text-[11px] font-semibold leading-relaxed text-slate-600">
                          <span className="font-black uppercase tracking-wide text-slate-400">
                            Ket:{" "}
                          </span>
                          {getKeterangan(d)}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.12, ease: "easeOut" }}
                      onClick={() => updateStatus(d.id, "approved")}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-black uppercase tracking-[0.06em] text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <CheckCircle2 size={13} strokeWidth={2.5} />
                      Setujui
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.12, ease: "easeOut" }}
                      onClick={() => updateStatus(d.id, "rejected")}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 text-[10px] font-black uppercase tracking-[0.06em] text-red-700 transition-colors hover:bg-red-100"
                    >
                      <XCircle size={13} strokeWidth={2.5} />
                      Tolak
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {!loading && data.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:block"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>
                    {[
                      "No",
                      "Nama Karyawan",
                      "Toko",
                      "Unit Kerja",
                      "Tanggal",
                      "Status",
                      "Alasan",
                      "Keterangan",
                      "Aksi",
                    ].map((h) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 ${
                          h === "No" || h === "Status" || h === "Aksi" ? "text-center" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {data.map((d, i) => (
                    <motion.tr
                      key={d.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.015 }}
                      className="border-b border-slate-100 transition-colors hover:bg-slate-50/50"
                    >
                      <td className="px-4 py-3 text-center text-xs font-bold text-slate-400">
                        {i + 1}
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-black text-slate-800">{getNamaKaryawan(d)}</p>
                        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {getJabatan(d)}
                        </p>
                      </td>

                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                        {getTokoNama(d)}
                      </td>

                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                        {getUnitKerjaNama(d)}
                      </td>

                      <td className="px-4 py-3">
                        <p className="text-xs font-bold text-slate-700">{getTanggalTampil(d)}</p>
                        <p className="text-[10px] capitalize text-slate-400">
                          {getHari(getTanggalTampil(d))}
                        </p>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={d.status} />
                      </td>

                      <td className="max-w-[180px] px-4 py-3 text-xs font-semibold text-slate-600">
                        <span className="line-clamp-2">{getAlasan(d)}</span>
                      </td>

                      <td className="max-w-[200px] px-4 py-3 text-xs font-semibold text-slate-600">
                        <span className="line-clamp-2">{getKeterangan(d)}</span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            transition={{ duration: 0.12, ease: "easeOut" }}
                            onClick={() => updateStatus(d.id, "approved")}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-black uppercase tracking-[0.06em] text-emerald-700 transition-colors hover:bg-emerald-100"
                          >
                            <CheckCircle2 size={13} strokeWidth={2.5} />
                            Setujui
                          </motion.button>

                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            transition={{ duration: 0.12, ease: "easeOut" }}
                            onClick={() => updateStatus(d.id, "rejected")}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 text-[10px] font-black uppercase tracking-[0.06em] text-red-700 transition-colors hover:bg-red-100"
                          >
                            <XCircle size={13} strokeWidth={2.5} />
                            Tolak
                          </motion.button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </main>

      <AnimatePresence>
        {confirmOpen && confirmTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-3"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            >
              <div
                className={`relative overflow-hidden px-5 py-4 ${
                  confirmAction === "approved"
                    ? "bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800"
                    : "bg-gradient-to-br from-red-500 via-red-600 to-rose-700"
                }`}
              >
                <div className="relative z-10 flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20">
                    {confirmAction === "approved" ? (
                      <CheckCircle2 size={22} className="text-white" strokeWidth={2.5} />
                    ) : (
                      <XCircle size={22} className="text-white" strokeWidth={2.5} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-black tracking-tight text-white">
                      {confirmAction === "approved"
                        ? "Konfirmasi Persetujuan"
                        : "Konfirmasi Penolakan"}
                    </h2>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white/75">
                      Rekap karyawan akan diperbarui
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (executing) return
                      setConfirmOpen(false)
                      setConfirmId(null)
                      setConfirmAction(null)
                    }}
                    disabled={executing}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-60"
                  >
                    <X size={15} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="pointer-events-none absolute right-0 top-0 opacity-10">
                  <Cpu size={120} strokeWidth={1} className="text-white" />
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <InfoRow label="Nama Karyawan" value={getNamaKaryawan(confirmTarget)} />
                  <InfoRow label="Tanggal" value={getTanggalTampil(confirmTarget)} />
                  <InfoRow label="Toko" value={getTokoNama(confirmTarget)} />
                  <InfoRow label="Unit Kerja" value={getUnitKerjaNama(confirmTarget)} />

                  <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      Status
                    </span>
                    <StatusBadge status={confirmTarget.status} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  onClick={() => {
                    if (executing) return
                    setConfirmOpen(false)
                    setConfirmId(null)
                    setConfirmAction(null)
                  }}
                  disabled={executing}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Batal
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  onClick={executeApproval}
                  disabled={executing}
                  className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full border px-4 text-[10px] font-black uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    confirmAction === "approved"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  }`}
                >
                  {executing ? (
                    <RefreshCw size={15} className="animate-spin" strokeWidth={2.5} />
                  ) : confirmAction === "approved" ? (
                    <CheckCircle2 size={15} strokeWidth={2.5} />
                  ) : (
                    <XCircle size={15} strokeWidth={2.5} />
                  )}
                  {executing ? "Memproses..." : "Ya, Lanjutkan"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  iconClassName,
  className = "",
}: {
  icon: React.ReactNode
  label: string
  value: string
  iconClassName: string
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconClassName}`}>
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {label}
          </p>
          <p className="truncate text-2xl font-black text-slate-800">
            {value}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-xs font-black text-slate-800">
        {value}
      </span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === "izin") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
        <Hand size={10} strokeWidth={2.5} />
        Izin
      </span>
    )
  }

  if (status === "sakit") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-red-700">
        <HeartPulse size={10} strokeWidth={2.5} />
        Sakit
      </span>
    )
  }

  return <span className="text-xs text-slate-300">—</span>
}
