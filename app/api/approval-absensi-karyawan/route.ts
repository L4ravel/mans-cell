// API ini dipakai admin untuk approve atau reject pengajuan izin/sakit karyawan.
// Saat approved, summary bulanan dan rekap harian admin ikut diperbarui agar tetap sinkron.

import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAuth } from "@/lib/verifyAuth"

export async function POST(req: Request) {
  const auth = await verifyAuth(req, ["admin", "superadmin"])
  if ("status" in auth) return auth

  const body = await req.json()
  const { id, status } = body // approved | rejected

  if (!id || !["approved", "rejected"].includes(status)) {
    return NextResponse.json(
      { error: "Data approval tidak valid" },
      { status: 400 }
    )
  }

  try {
    const ref = adminDb.collection("absensi_karyawan").doc(id)
    const snap = await ref.get()

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Data absensi tidak ditemukan" },
        { status: 404 }
      )
    }

    const data = snap.data()!

    if (!["izin", "sakit"].includes(data.status)) {
      return NextResponse.json(
        { error: "Absensi ini tidak memerlukan persetujuan" },
        { status: 400 }
      )
    }

    const now = Date.now()

    await ref.update({
      approvalStatus: status,
      approvedAt: now,
      approvedBy: auth.uid,
    })

    if (status === "approved") {
      const summaryId = `${data.karyawanId}_${data.tahun}-${String(data.bulan).padStart(2, "0")}`
      const summaryRef = adminDb
        .collection("absensi_karyawan_summary")
        .doc(summaryId)

      const bulananRef = adminDb
        .collection("absensi_karyawan_bulanan")
        .doc(`${data.karyawanId}_${data.tahun}-${String(data.bulan).padStart(2, "0")}`)

      const adminSummaryRef = adminDb
        .collection("absensi_admin_summary_day")
        .doc(`global_${data.tanggal}`)

      await adminDb.runTransaction(async (tx) => {
        const summarySnap = await tx.get(summaryRef)

        const summaryBase = summarySnap.exists
          ? summarySnap.data()!
          : {
              hadir: 0,
              izin: 0,
              sakit: 0,
              terlambat: 0,
              pulangCepat: 0,
              kedatangan: 0,
            }

        if (data.status === "izin") summaryBase.izin += 1
        if (data.status === "sakit") summaryBase.sakit += 1

        tx.set(
          summaryRef,
          {
            ...summaryBase,
            karyawanId: data.karyawanId,
            tahun: data.tahun,
            bulan: data.bulan,
            updatedAt: now,
          },
          { merge: true }
        )

        const day = String(data.tanggal).slice(8, 10)
        const bulananSnap = await tx.get(bulananRef)

        const bulananBase = bulananSnap.exists
          ? bulananSnap.data()!
          : { days: {} }

        bulananBase.days[day] = data.status === "izin" ? "I" : "S"

        tx.set(
          bulananRef,
          {
            ...bulananBase,
            karyawanId: data.karyawanId,
            namaKaryawan: data.namaKaryawan || null,
            instansi: data.instansi || null,
            unitKerja: data.unitKerja || null,
            tahun: data.tahun,
            bulan: data.bulan,
            updatedAt: now,
          },
          { merge: true }
        )

        const adminSnap = await tx.get(adminSummaryRef)

        const adminBase = adminSnap.exists
          ? adminSnap.data()!
          : {
              hadir: 0,
              izin: 0,
              sakit: 0,
              kedatangan: 0,
              pulangCepat: 0,
              terlambat: 0,
            }

        if (data.status === "izin") adminBase.izin += 1
        if (data.status === "sakit") adminBase.sakit += 1

        tx.set(
          adminSummaryRef,
          {
            ...adminBase,
            tanggal: data.tanggal,
            tahun: data.tahun,
            bulan: data.bulan,
            updatedAt: now,
          },
          { merge: true }
        )
      })
    }

    return NextResponse.json({
      success: true,
      message: status === "approved" ? "Absensi disetujui" : "Absensi ditolak",
    })
  } catch (err) {
    console.error("Approval absensi karyawan error:", err)
    return NextResponse.json(
      { error: "Gagal memproses approval" },
      { status: 500 }
    )
  }
}