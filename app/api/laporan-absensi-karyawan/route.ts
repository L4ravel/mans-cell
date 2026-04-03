// Route API ini menangani GET laporan absensi dan POST absensi karyawan.
// Revisi utama: semua read dalam Firestore transaction dipindah sebelum write agar tidak error transaction order.

import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"
import { verifyAuth } from "@/lib/verifyAuth"

// =========================
// GET — LAPORAN ABSENSI KARYAWAN
// =========================
export async function GET(req: Request) {
  const auth = await verifyAuth(req, ["admin", "superadmin", "karyawan"])
  if ("status" in auth) return auth

  const role = auth.roles.includes("karyawan") ? "karyawan" : auth.roles[0]
  const authKaryawanId =
    auth.user?.karyawanId ||
    auth.user?.permissions?.karyawanId ||
    auth.user?.permissions?.karyawanid ||
    null

  const { searchParams } = new URL(req.url)

  const tanggal = searchParams.get("tanggal")
  const bulan = searchParams.get("bulan")
  const tahun = searchParams.get("tahun")
  const summary = searchParams.get("summary")
  const unitKerjaId = searchParams.get("unitKerjaId")
  const queryKaryawanId = searchParams.get("karyawanId")
  const approvalStatus = searchParams.get("approvalStatus")
  const pendingOnly = searchParams.get("pendingOnly")

  // =========================
  // MODE SUMMARY BULANAN
  // =========================
  if (summary === "true") {
    if (!tahun || !bulan) {
      return NextResponse.json(
        { error: "tahun dan bulan wajib untuk summary" },
        { status: 400 }
      )
    }

    if (role === "karyawan" && !authKaryawanId) {
      return NextResponse.json(
        { error: "Karyawan tidak terhubung dengan data karyawan" },
        { status: 400 }
      )
    }

    const targetKaryawanId =
      role === "karyawan" ? authKaryawanId : queryKaryawanId

    if (!targetKaryawanId) {
      return NextResponse.json(
        { error: "karyawanId wajib untuk admin/superadmin pada mode summary" },
        { status: 400 }
      )
    }

    const bulanPad = String(bulan).padStart(2, "0")
    const summaryId = `${targetKaryawanId}_${tahun}-${bulanPad}`
    const summaryRef = adminDb
      .collection("absensi_karyawan_summary")
      .doc(summaryId)

    const snap = await summaryRef.get()

    if (!snap.exists) {
      return NextResponse.json({
        data: {
          hadir: 0,
          izin: 0,
          sakit: 0,
          terlambat: 0,
          pulangCepat: 0,
          kedatangan: 0,
        },
      })
    }

    return NextResponse.json({
      data: snap.data(),
    })
  }

  try {
    let query: FirebaseFirestore.Query = adminDb.collection("absensi_karyawan")

    // =========================
    // BATASAN AKSES
    // =========================
    if (role === "karyawan") {
      if (!authKaryawanId) {
        return NextResponse.json(
          { error: "Karyawan tidak terhubung dengan data karyawan" },
          { status: 400 }
        )
      }
      query = query.where("karyawanId", "==", authKaryawanId)
    } else if (queryKaryawanId) {
      query = query.where("karyawanId", "==", queryKaryawanId)
    }

    if (tanggal) query = query.where("tanggal", "==", tanggal)
    if (tahun) query = query.where("tahun", "==", Number(tahun))
    if (bulan) query = query.where("bulan", "==", Number(bulan))
    if (unitKerjaId) query = query.where("unitKerja.id", "==", unitKerjaId)

    if (approvalStatus) {
      query = query.where("approvalStatus", "==", approvalStatus)
    }

    if (pendingOnly === "true") {
      query = query.where("status", "in", ["izin", "sakit"])
    }

    const snap = await query.get()

    const data = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))

    return NextResponse.json({ data })
  } catch (err) {
    console.error("GET absensi karyawan error:", err)
    return NextResponse.json(
      { error: "Gagal mengambil data absensi karyawan" },
      { status: 500 }
    )
  }
}

// =========================
// POST — ABSENSI MANUAL KARYAWAN
// =========================
export async function POST(req: Request) {
  const auth = await verifyAuth(req, ["karyawan"])
  if ("status" in auth) return auth

  const karyawanId =
    auth.user?.karyawanId ||
    auth.user?.permissions?.karyawanId ||
    auth.user?.permissions?.karyawanid ||
    null

  const userId = auth.uid

  if (!karyawanId) {
    return NextResponse.json(
      { error: "Karyawan tidak terhubung dengan akun" },
      { status: 400 }
    )
  }

  const body = await req.json()

  const {
    tanggal,
    jam,
    type,
    metode,

    // MASUK
    alasanMasuk,
    keteranganMasuk,

    // IZIN / SAKIT
    alasanIzin,
    keteranganIzin,

    // PULANG
    alasanPulang,
    keteranganPulang,
  } = body

  if (!tanggal || !jam || !type) {
    return NextResponse.json(
      { error: "Data absensi tidak lengkap" },
      { status: 400 }
    )
  }

  try {
    const docId = `${karyawanId}_${tanggal}`
    const ref = adminDb.collection("absensi_karyawan").doc(docId)
    const snap = await ref.get()
    const now = Date.now()

    const karyawanSnap = await adminDb.collection("karyawan").doc(karyawanId).get()
    if (!karyawanSnap.exists) {
      return NextResponse.json(
        { error: "Data karyawan tidak ditemukan" },
        { status: 404 }
      )
    }

    const karyawan = karyawanSnap.data()!

    // =========================
    // ABSENSI BARU
    // =========================
    if (!snap.exists) {
      if (!["masuk", "izin", "sakit"].includes(type)) {
        return NextResponse.json(
          { error: "Belum absen masuk" },
          { status: 400 }
        )
      }

      const isNeedApproval = type === "izin" || type === "sakit"

      const statusFinal =
        type === "masuk" && body.status === "terlambat"
          ? "terlambat"
          : type

      await ref.set({
        karyawanId,
        userId,

        namaKaryawan: karyawan.nama,
        nik: karyawan.nik || null,

        instansi: karyawan.instansi || null,
        unitKerja: karyawan.unitKerja || null,
        jabatan: karyawan.jabatan || null,

        tanggal,
        tahun: Number(tanggal.slice(0, 4)),
        bulan: Number(tanggal.slice(5, 7)),

        jamMasuk: type === "masuk" ? jam : null,
        jamPulang: null,

        status: statusFinal,
        approvalStatus: isNeedApproval ? "pending" : "approved",

        alasanMasuk: type === "masuk" ? alasanMasuk || null : null,
        keteranganMasuk: type === "masuk" ? keteranganMasuk || null : null,

        alasanIzin: type === "izin" || type === "sakit" ? alasanIzin || null : null,
        keteranganIzin:
          type === "izin" || type === "sakit" ? keteranganIzin || null : null,

        alasanPulang: null,
        keteranganPulang: null,

        metode: metode || "manual",

        createdAt: now,
        createdBy: userId,
      })

      // =========================
      // UPDATE SUMMARY BULANAN
      // =========================
      const summaryId = `${karyawanId}_${tanggal.slice(0, 7)}`
      const summaryRef = adminDb
        .collection("absensi_karyawan_summary")
        .doc(summaryId)

      const bulananRef = adminDb
        .collection("absensi_karyawan_bulanan")
        .doc(`${karyawanId}_${tanggal.slice(0, 7)}`)

      const day = tanggal.slice(8, 10)

      await adminDb.runTransaction(async (tx) => {
        const bulananSnap = await tx.get(bulananRef)
        const summarySnap = await tx.get(summaryRef)

        const bulananBase = bulananSnap.exists
          ? bulananSnap.data()!
          : { days: {} as Record<string, string> }

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

        let code = "-"

        if (type === "izin") code = "I"
        if (type === "sakit") code = "S"
        if (type === "masuk" && body.status === "terlambat") {
          code = "T"
        }

        bulananBase.days = bulananBase.days || {}
        bulananBase.days[day] = code

        if (type === "masuk") {
          summaryBase.hadir += 1
          summaryBase.kedatangan += 1
        }

        if (type === "masuk" && body.status === "terlambat") {
          summaryBase.terlambat += 1
        }

        if (type === "izin") summaryBase.izin += 1
        if (type === "sakit") summaryBase.sakit += 1

        tx.set(
          bulananRef,
          {
            ...bulananBase,
            karyawanId,
            namaKaryawan: karyawan.nama,
            instansi: karyawan.instansi || null,
            unitKerja: karyawan.unitKerja || null,
            tahun: Number(tanggal.slice(0, 4)),
            bulan: Number(tanggal.slice(5, 7)),
            updatedAt: now,
          },
          { merge: true }
        )

        tx.set(
          summaryRef,
          {
            ...summaryBase,
            karyawanId,
            tahun: Number(tanggal.slice(0, 4)),
            bulan: Number(tanggal.slice(5, 7)),
            updatedAt: now,
          },
          { merge: true }
        )
      })

      // =========================
      // UPDATE ADMIN SUMMARY HARIAN
      // =========================
      const adminSummaryId = `global_${tanggal}`
      const adminSummaryRef = adminDb
        .collection("absensi_admin_summary_day")
        .doc(adminSummaryId)

      await adminDb.runTransaction(async (tx) => {
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

        if (type === "masuk") {
          adminBase.hadir += 1
          adminBase.kedatangan += 1

          if (statusFinal === "terlambat") {
            adminBase.terlambat += 1
          }
        }

        if (type === "izin") adminBase.izin += 1
        if (type === "sakit") adminBase.sakit += 1

        tx.set(
          adminSummaryRef,
          {
            ...adminBase,
            tanggal,
            tahun: Number(tanggal.slice(0, 4)),
            bulan: Number(tanggal.slice(5, 7)),
            updatedAt: now,
          },
          { merge: true }
        )
      })

      return NextResponse.json({
        success: true,
        message: isNeedApproval
          ? "Pengajuan berhasil, menunggu persetujuan"
          : "Absen masuk berhasil",
      })
    }

    // =========================
    // UPDATE ABSEN PULANG
    // =========================
    if (type === "pulang") {
      const currentSnap = await ref.get()
      const currentData = currentSnap.data()

      if (currentData?.jamPulang) {
        return NextResponse.json(
          {
            code: "ALREADY_ABSENT",
            error: "Anda sudah absensi pulang hari ini",
          },
          { status: 409 }
        )
      }

      await ref.update({
        jamPulang: jam,
        status: body.status === "pulang_cepat" ? "pulang_cepat" : "hadir",
        alasanPulang: alasanPulang || null,
        keteranganPulang: keteranganPulang || null,
        approvalStatus: "approved",
        updatedAt: now,
        updatedBy: userId,
      })

      const summaryId = `${karyawanId}_${tanggal.slice(0, 7)}`
      const summaryRef = adminDb
        .collection("absensi_karyawan_summary")
        .doc(summaryId)

      const bulananRef = adminDb
        .collection("absensi_karyawan_bulanan")
        .doc(`${karyawanId}_${tanggal.slice(0, 7)}`)

      const day = tanggal.slice(8, 10)

      await adminDb.runTransaction(async (tx) => {
        const bulananSnap = await tx.get(bulananRef)
        const summarySnap = await tx.get(summaryRef)

        const bulananBase = bulananSnap.exists
          ? bulananSnap.data()!
          : { days: {} as Record<string, string> }

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

        bulananBase.days = bulananBase.days || {}

        const prev = bulananBase.days?.[day]

        let code = prev ?? "-"

        if (body.status === "pulang_cepat") {
          if (prev === "T") code = "TPC"
          else code = "PC"
        } else {
          if (prev === "-" || prev === undefined) {
            code = "H"
          } else if (prev === "T") {
            code = "T"
          }
        }

        bulananBase.days[day] = code

        if (currentData?.jamMasuk && body.status === "pulang_cepat") {
          summaryBase.pulangCepat += 1
        }

        if (currentData?.jamMasuk) {
          summaryBase.kedatangan = Math.max(0, summaryBase.kedatangan - 1)
        }

        tx.set(
          bulananRef,
          {
            ...bulananBase,
            karyawanId,
            namaKaryawan: karyawan.nama,
            instansi: karyawan.instansi || null,
            unitKerja: karyawan.unitKerja || null,
            tahun: Number(tanggal.slice(0, 4)),
            bulan: Number(tanggal.slice(5, 7)),
            updatedAt: now,
          },
          { merge: true }
        )

        tx.set(
          summaryRef,
          {
            ...summaryBase,
            karyawanId,
            tahun: Number(tanggal.slice(0, 4)),
            bulan: Number(tanggal.slice(5, 7)),
            updatedAt: now,
          },
          { merge: true }
        )
      })

      // =========================
      // UPDATE ADMIN SUMMARY HARIAN
      // =========================
      const adminSummaryId = `global_${tanggal}`
      const adminSummaryRef = adminDb
        .collection("absensi_admin_summary_day")
        .doc(adminSummaryId)

      await adminDb.runTransaction(async (tx) => {
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

        if (currentData?.jamMasuk && body.status === "pulang_cepat") {
          adminBase.pulangCepat += 1
        }

        if (currentData?.jamMasuk) {
          adminBase.kedatangan = Math.max(0, adminBase.kedatangan - 1)
        }

        tx.set(
          adminSummaryRef,
          {
            ...adminBase,
            tanggal,
            tahun: Number(tanggal.slice(0, 4)),
            bulan: Number(tanggal.slice(5, 7)),
            updatedAt: now,
          },
          { merge: true }
        )
      })

      return NextResponse.json({
        success: true,
        message: "Absensi pulang berhasil",
      })
    }

    return NextResponse.json(
      {
        code: "ALREADY_ABSENT",
        error: "Anda sudah absensi hari ini",
      },
      { status: 409 }
    )
  } catch (err) {
    console.error("POST absensi karyawan error:", err)
    return NextResponse.json(
      { error: "Gagal menyimpan absensi karyawan" },
      { status: 500 }
    )
  }
}