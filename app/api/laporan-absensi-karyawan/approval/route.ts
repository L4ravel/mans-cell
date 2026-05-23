/*
  API approval izin/sakit karyawan.

  Isi revisi:
  - Dibuat konsisten dengan API approval PTK.
  - Approve menambah summary izin/sakit jika belum pernah disinkron.
  - Reject mengurangi summary jika sebelumnya sudah approved.
  - Reject membersihkan kode I/S pada absensi_karyawan_bulanan.days.
  - Menyimpan status final agar data rejected tidak terbaca lagi sebagai izin/sakit aktif.
  - Mendukung forceRepair untuk memperbaiki summary lama yang sudah approved tetapi angkanya hilang.
  - Summary bulanan karyawan dan summary harian admin dihitung aman memakai safeNextValue agar tidak minus.
  - Semua read dalam transaction dilakukan sebelum write.
*/

import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAuth } from "@/lib/verifyAuth"

// =========================
// HELPER
// =========================
function getEmptySummary() {
  return {
    hadir: 0,
    izin: 0,
    sakit: 0,
    terlambat: 0,
    pulangCepat: 0,
    kedatangan: 0,
  }
}

function getBulanKey(tahun: number, bulan: number) {
  return `${tahun}-${String(bulan).padStart(2, "0")}`
}

function getTanggalFromAbsensiData(data: FirebaseFirestore.DocumentData) {
  if (typeof data.tanggalKerja === "string" && data.tanggalKerja) {
    return data.tanggalKerja
  }

  if (typeof data.tanggal === "string" && data.tanggal) {
    return data.tanggal
  }

  return `${data.tahun}-${String(data.bulan).padStart(2, "0")}-${String(
    data.tanggalAngka || data.hari || data.day || ""
  ).padStart(2, "0")}`
}

function getDayKeyFromTanggal(tanggal: string) {
  return tanggal.slice(8, 10)
}

function normalizeNumber(value: unknown) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function safeNextValue(value: unknown, delta: number) {
  return Math.max(normalizeNumber(value) + delta, 0)
}

function getBulananCodeFromStatus(status: "izin" | "sakit") {
  return status === "izin" ? "I" : "S"
}

function buildDashboardPercent(data: FirebaseFirestore.DocumentData) {
  const hadir = normalizeNumber(data?.hadir)
  const izin = normalizeNumber(data?.izin)
  const sakit = normalizeNumber(data?.sakit)
  const totalRekam = hadir + izin + sakit

  return {
    totalRekam,
    persenHadirDariRekam:
      totalRekam > 0 ? Math.round((hadir / totalRekam) * 100) : 0,
  }
}

// =========================
// KARYAWAN DATA HELPER
// =========================
function getTokoIdFromData(
  data: FirebaseFirestore.DocumentData | null | undefined
) {
  return String(
    data?.tokoId ||
      data?.toko?.id ||
      data?.permissions?.tokoId ||
      ""
  ).trim()
}

function getTokoNamaFromData(
  data: FirebaseFirestore.DocumentData | null | undefined
) {
  return String(
    data?.tokoNama ||
      data?.toko?.nama ||
      data?.namaToko ||
      "Tanpa Toko"
  ).trim()
}

function getUnitKerjaIdFromData(
  data: FirebaseFirestore.DocumentData | null | undefined
) {
  return String(
    data?.unitKerja?.id ||
      data?.unitKerjaId ||
      ""
  ).trim()
}

function getUnitKerjaNamaFromData(
  data: FirebaseFirestore.DocumentData | null | undefined
) {
  return String(
    data?.unitKerja?.nama ||
      data?.unitKerjaNama ||
      data?.unitKerja ||
      ""
  ).trim()
}

function getNamaKaryawanFromData(
  absensi: FirebaseFirestore.DocumentData,
  karyawan: FirebaseFirestore.DocumentData | null
) {
  return String(
    absensi?.namaKaryawan ||
      absensi?.nama ||
      absensi?.karyawanNama ||
      karyawan?.nama ||
      ""
  ).trim()
}

function getNikFromData(
  absensi: FirebaseFirestore.DocumentData,
  karyawan: FirebaseFirestore.DocumentData | null
) {
  return absensi?.nik || karyawan?.nik || null
}

// =========================
// POST — APPROVAL IZIN / SAKIT KARYAWAN
// =========================
export async function POST(req: Request) {
  const auth = await verifyAuth(req, ["admin", "superadmin"])
  if ("status" in auth) return auth

  const body = await req.json().catch(() => null)

  const { id, status: rawStatus, forceRepair } = (body || {}) as {
    id?: string
    status?: string
    forceRepair?: boolean
  }

  if (!id || !["approved", "rejected"].includes(rawStatus || "")) {
    return NextResponse.json(
      { error: "Data approval tidak valid" },
      { status: 400 }
    )
  }

  const status = rawStatus as "approved" | "rejected"

  try {
    const absensiRef = adminDb.collection("absensi_karyawan").doc(id)
    const now = Date.now()

    const result = await adminDb.runTransaction(async (tx) => {
      const absensiSnap = await tx.get(absensiRef)

      if (!absensiSnap.exists) {
        return {
          ok: false,
          code: 404,
          error: "Data absensi tidak ditemukan",
        }
      }

      const data = absensiSnap.data()!

      // =========================
      // VALIDASI STATUS ABSENSI
      // =========================
      if (!["izin", "sakit"].includes(data.status)) {
        return {
          ok: false,
          code: 400,
          error: "Absensi ini tidak memerlukan persetujuan",
        }
      }

      if (!data.karyawanId || !data.tahun || !data.bulan) {
        return {
          ok: false,
          code: 400,
          error: "Data absensi belum lengkap untuk membuat summary",
        }
      }

      const tanggal = getTanggalFromAbsensiData(data)

      if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
        return {
          ok: false,
          code: 400,
          error:
            "Field tanggal tidak valid. Pastikan absensi_karyawan memiliki tanggal format YYYY-MM-DD.",
        }
      }

      const karyawanId = String(data.karyawanId)
      const fieldStatus = data.status as "izin" | "sakit"
      const tahun = Number(data.tahun)
      const bulan = Number(data.bulan)

      if (!Number.isFinite(tahun) || !Number.isFinite(bulan)) {
        return {
          ok: false,
          code: 400,
          error: "Tahun atau bulan tidak valid",
        }
      }

      const bulanKey = data.bulanKey || getBulanKey(tahun, bulan)
      const dayKey = getDayKeyFromTanggal(tanggal)
      const bulananCode = getBulananCodeFromStatus(fieldStatus)

      // =========================
      // FALLBACK KARYAWAN UNTUK DATA LAMA
      // =========================
      const karyawanRef = adminDb.collection("karyawan").doc(karyawanId)
      const karyawanSnap = await tx.get(karyawanRef)
      const karyawanData = karyawanSnap.exists ? karyawanSnap.data()! : null

      const tokoId = getTokoIdFromData(data) || getTokoIdFromData(karyawanData)
      const tokoNama =
        getTokoNamaFromData(data) || getTokoNamaFromData(karyawanData)

      const unitKerjaId =
        getUnitKerjaIdFromData(data) || getUnitKerjaIdFromData(karyawanData)

      const unitKerjaNama =
        getUnitKerjaNamaFromData(data) ||
        getUnitKerjaNamaFromData(karyawanData)

      const namaKaryawan = getNamaKaryawanFromData(data, karyawanData)
      const nik = getNikFromData(data, karyawanData)

      // =========================
      // REFS SUMMARY
      // =========================
      const karyawanSummaryRef = adminDb
        .collection("absensi_karyawan_summary")
        .doc(`${karyawanId}_${bulanKey}`)

      const adminSummaryRef = adminDb
        .collection("absensi_admin_summary_day")
        .doc(`global_${tanggal}`)

      const bulananRefById = adminDb
        .collection("absensi_karyawan_bulanan")
        .doc(`${karyawanId}_${bulanKey}`)

      const bulananQuery = adminDb
        .collection("absensi_karyawan_bulanan")
        .where("karyawanId", "==", karyawanId)
        .where("tahun", "==", tahun)
        .where("bulan", "==", bulan)
        .limit(10)

      const [
        karyawanSummarySnap,
        adminSummarySnap,
        bulananSnapById,
        bulananQuerySnap,
      ] = await Promise.all([
        tx.get(karyawanSummaryRef),
        tx.get(adminSummaryRef),
        tx.get(bulananRefById),
        tx.get(bulananQuery),
      ])

      const karyawanSummary = karyawanSummarySnap.exists
        ? karyawanSummarySnap.data()!
        : getEmptySummary()

      const adminSummary = adminSummarySnap.exists
        ? adminSummarySnap.data()!
        : getEmptySummary()

      const approvalStatusLama = data.approvalStatus || "pending"
      const approvalSummaryStatus = data.approvalSummaryStatus || null

      const alreadySynced = approvalSummaryStatus === "approved"

      const summaryValueNow = normalizeNumber(karyawanSummary[fieldStatus])
      const adminValueNow = normalizeNumber(adminSummary[fieldStatus])

      const needRepairKaryawan =
        status === "approved" &&
        approvalStatusLama === "approved" &&
        alreadySynced &&
        summaryValueNow <= 0

      const needRepairAdmin =
        status === "approved" &&
        approvalStatusLama === "approved" &&
        alreadySynced &&
        adminValueNow <= 0

      const shouldRepair = Boolean(
        forceRepair || needRepairKaryawan || needRepairAdmin
      )

      const shouldAddNormal =
        status === "approved" && approvalSummaryStatus !== "approved"

      const shouldSubtractNormal =
        status === "rejected" && approvalSummaryStatus === "approved"

      const delta =
        shouldAddNormal || shouldRepair
          ? 1
          : shouldSubtractNormal
            ? -1
            : 0

      const nextKaryawanValue = safeNextValue(karyawanSummary[fieldStatus], delta)
      const nextAdminValue = safeNextValue(adminSummary[fieldStatus], delta)

      const sameApprovalStatus = approvalStatusLama === status

      // =========================
      // UPDATE ABSENSI UTAMA
      // =========================
      tx.update(absensiRef, {
        approvalStatus: status,
        approvalFinalStatus: status,
        isApproved: status === "approved",
        isRejected: status === "rejected",

        approvedAt: status === "approved" ? now : null,
        approvedBy: status === "approved" ? auth.uid : data.approvedBy || null,

        rejectedAt: status === "rejected" ? now : null,
        rejectedBy: status === "rejected" ? auth.uid : data.rejectedBy || null,

        approvalSummaryStatus: status === "approved" ? "approved" : null,
        approvalSummaryField: status === "approved" ? fieldStatus : null,
        approvalSummaryCode: status === "approved" ? bulananCode : null,
        approvalSummarySyncedAt:
          delta !== 0 ? now : data.approvalSummarySyncedAt || null,

        tokoId,
        tokoNama,

        unitKerja: data.unitKerja || karyawanData?.unitKerja || null,
        unitKerjaId,
        unitKerjaNama,

        jabatan: data.jabatan || karyawanData?.jabatan || null,

        tahun,
        bulan,
        bulanKey,
        tanggal,
        tanggalKerja: tanggal,

        updatedAt: now,
      })

      // =========================
      // UPDATE SUMMARY JIKA ANGKA BERUBAH
      // =========================
      if (delta !== 0) {
        tx.set(
          karyawanSummaryRef,
          {
            ...karyawanSummary,
            [fieldStatus]: nextKaryawanValue,

            karyawanId,
            namaKaryawan,
            nik,

            tokoId,
            tokoNama,

            unitKerja: data.unitKerja || karyawanData?.unitKerja || null,
            unitKerjaId,
            unitKerjaNama,

            jabatan: data.jabatan || karyawanData?.jabatan || null,

            tahun,
            bulan,
            bulanKey,
            updatedAt: now,
          },
          { merge: true }
        )

        const nextAdminBase = {
          ...adminSummary,
          [fieldStatus]: nextAdminValue,
        }

        tx.set(
          adminSummaryRef,
          {
            ...nextAdminBase,
            ...buildDashboardPercent(nextAdminBase),

            tanggal,
            tanggalKerja: tanggal,
            tahun,
            bulan,
            bulanKey,
            updatedAt: now,
          },
          { merge: true }
        )
      }

      // =========================
      // UPDATE REKAP BULANAN DAYS
      // =========================
      const bulananRefs = new Map<string, FirebaseFirestore.DocumentReference>()

      if (bulananSnapById.exists) {
        bulananRefs.set(bulananSnapById.ref.path, bulananSnapById.ref)
      }

      bulananQuerySnap.docs.forEach((docSnap) => {
        bulananRefs.set(docSnap.ref.path, docSnap.ref)
      })

      if (bulananRefs.size === 0 && status === "approved") {
        bulananRefs.set(bulananRefById.path, bulananRefById)
      }

      bulananRefs.forEach((ref) => {
        if (status === "approved") {
          tx.set(
            ref,
            {
              karyawanId,
              namaKaryawan,
              nik,

              tokoId,
              tokoNama,

              unitKerja: data.unitKerja || karyawanData?.unitKerja || null,
              unitKerjaId,
              unitKerjaNama,

              jabatan: data.jabatan || karyawanData?.jabatan || null,

              tahun,
              bulan,
              bulanKey,
              [`days.${dayKey}`]: bulananCode,
              updatedAt: now,
            },
            { merge: true }
          )
        }

        if (status === "rejected") {
          tx.update(ref, {
            [`days.${dayKey}`]: FieldValue.delete(),
            updatedAt: now,
          })
        }
      })

      return {
        ok: true,
        changed:
          delta !== 0 ||
          !sameApprovalStatus ||
          (status === "rejected" && bulananRefs.size > 0),
        repair: shouldRepair,
        tokoId,
        tokoNama,
        fieldStatus,
        delta,
        message:
          delta !== 0 && status === "approved" && shouldRepair
            ? "Absensi disetujui dan summary lama diperbaiki"
            : delta !== 0 && status === "approved"
              ? "Absensi disetujui dan summary diperbarui"
              : delta !== 0 && status === "rejected"
                ? "Absensi ditolak, summary dikurangi, dan rekap bulanan dibersihkan"
                : status === "approved"
                  ? "Absensi sudah disetujui sebelumnya"
                  : "Absensi ditolak dan rekap bulanan dibersihkan",
      }
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.code }
      )
    }

    return NextResponse.json({
      success: true,
      changed: result.changed,
      repair: result.repair,
      tokoId: result.tokoId,
      tokoNama: result.tokoNama,
      fieldStatus: result.fieldStatus,
      delta: result.delta,
      message: result.message,
    })
  } catch (err) {
    console.error("Approval absensi karyawan error:", err)

    return NextResponse.json(
      { error: "Gagal memproses approval" },
      { status: 500 }
    )
  }
}
