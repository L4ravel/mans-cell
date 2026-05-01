/*
  API sinkron toko karyawan.
  Setelah toko karyawan diubah,
  API ini akan menyamakan tokoId dan tokoNama pada dokumen karyawan
  serta dokumen users yang terhubung ke karyawan tersebut lewat field karyawanId.

  Field users yang ikut disinkronkan:
  - tokoId
  - tokoNama
  - permissions.tokoId
  - permissions.tokoNama
  - toko.id
  - toko.nama

  Ini penting karena halaman absensi membaca toko dari permissions.tokoId lebih dulu,
  lalu fallback ke tokoId dan toko.id.
*/

import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"

type Body = {
  karyawanId?: string
  tokoId?: string
  tokoNama?: string
  adminUid?: string
}

const MAX_BATCH_OPS = 450

type BatchUpdateItem = {
  ref: FirebaseFirestore.DocumentReference
  data: Record<string, unknown>
}

async function commitInChunks(items: BatchUpdateItem[]) {
  let updatedCount = 0

  for (let i = 0; i < items.length; i += MAX_BATCH_OPS) {
    const chunk = items.slice(i, i + MAX_BATCH_OPS)
    const batch = adminDb.batch()

    chunk.forEach(({ ref, data }) => {
      batch.update(ref, data)
    })

    await batch.commit()
    updatedCount += chunk.length
  }

  return updatedCount
}

function getString(value: unknown) {
  return String(value || "").trim()
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body

    const karyawanId = getString(body?.karyawanId)
    const tokoId = getString(body?.tokoId)
    const tokoNama = getString(body?.tokoNama)
    const adminUid = getString(body?.adminUid)
    const now = Date.now()

    if (!karyawanId) {
      return NextResponse.json({ message: "karyawanId wajib diisi" }, { status: 400 })
    }

    if (!tokoId) {
      return NextResponse.json({ message: "tokoId wajib diisi" }, { status: 400 })
    }

    if (!tokoNama) {
      return NextResponse.json({ message: "tokoNama wajib diisi" }, { status: 400 })
    }

    const karyawanRef = adminDb.collection("karyawan").doc(karyawanId)
    const karyawanSnap = await karyawanRef.get()

    if (!karyawanSnap.exists) {
      return NextResponse.json({ message: "Data karyawan tidak ditemukan" }, { status: 404 })
    }

    const tokoRef = adminDb.collection("toko").doc(tokoId)
    const tokoSnap = await tokoRef.get()

    if (!tokoSnap.exists) {
      return NextResponse.json({ message: "Data toko tidak ditemukan" }, { status: 404 })
    }

    const karyawanData = karyawanSnap.data() as Record<string, unknown>
    const currentTokoId = getString(karyawanData?.tokoId)
    const currentTokoNama = getString(karyawanData?.tokoNama)

    let karyawanUpdatedCount = 0

    if (currentTokoId !== tokoId || currentTokoNama !== tokoNama) {
      await karyawanRef.update({
        tokoId,
        tokoNama,
        updatedAt: now,
        updatedBy: adminUid || "",
      })

      karyawanUpdatedCount = 1
    }

    const usersSnap = await adminDb
      .collection("users")
      .where("karyawanId", "==", karyawanId)
      .get()

    const usersUpdates: BatchUpdateItem[] = usersSnap.docs
      .filter((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>

        const permissions = data?.permissions as Record<string, unknown> | undefined
        const toko = data?.toko as Record<string, unknown> | undefined

        const userTokoId = getString(data?.tokoId)
        const userTokoNama = getString(data?.tokoNama)

        const permissionTokoId = getString(permissions?.tokoId)
        const permissionTokoNama = getString(permissions?.tokoNama)

        const nestedTokoId = getString(toko?.id)
        const nestedTokoNama = getString(toko?.nama)

        return (
          userTokoId !== tokoId ||
          userTokoNama !== tokoNama ||
          permissionTokoId !== tokoId ||
          permissionTokoNama !== tokoNama ||
          nestedTokoId !== tokoId ||
          nestedTokoNama !== tokoNama
        )
      })
      .map((docSnap) => ({
        ref: docSnap.ref,
        data: {
          tokoId,
          tokoNama,
          "permissions.tokoId": tokoId,
          "permissions.tokoNama": tokoNama,
          "toko.id": tokoId,
          "toko.nama": tokoNama,
          updatedAt: now,
          updatedBy: adminUid || "",
        },
      }))

    const usersUpdatedCount =
      usersUpdates.length > 0 ? await commitInChunks(usersUpdates) : 0

    const totalUpdated = karyawanUpdatedCount + usersUpdatedCount

    return NextResponse.json({
      success: true,
      updatedCount: totalUpdated,
      detail: {
        karyawan: karyawanUpdatedCount,
        users: usersUpdatedCount,
      },
      message:
        totalUpdated > 0
          ? "Sinkron toko karyawan berhasil"
          : "Semua data sudah sinkron",
    })
  } catch (error: any) {
    console.error("SYNC_TOKO_KARYAWAN_ERROR:", error)

    return NextResponse.json(
      { message: error?.message || "Gagal sinkron toko karyawan" },
      { status: 500 }
    )
  }
}