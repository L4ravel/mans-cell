/*
  API sinkron nama toko.
  Setelah nama toko diubah di master toko,
  API ini akan menyamakan tokoNama pada semua dokumen karyawan
  dan users yang memiliki tokoId yang sama.
*/

import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"

type Body = {
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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body

    const tokoId = String(body?.tokoId || "").trim()
    const tokoNama = String(body?.tokoNama || "").trim()
    const adminUid = String(body?.adminUid || "").trim()
    const now = Date.now()

    if (!tokoId) {
      return NextResponse.json({ message: "tokoId wajib diisi" }, { status: 400 })
    }

    if (!tokoNama) {
      return NextResponse.json({ message: "tokoNama wajib diisi" }, { status: 400 })
    }

    const tokoRef = adminDb.collection("toko").doc(tokoId)
    const tokoSnap = await tokoRef.get()

    if (!tokoSnap.exists) {
      return NextResponse.json({ message: "Data toko tidak ditemukan" }, { status: 404 })
    }

    // ── Sinkron karyawan ──────────────────────────────────────────────────────
    const karyawanSnap = await adminDb
      .collection("karyawan")
      .where("tokoId", "==", tokoId)
      .get()

    const karyawanUpdates: BatchUpdateItem[] = karyawanSnap.docs
      .filter((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>
        return String(data?.tokoNama || "").trim() !== tokoNama
      })
      .map((docSnap) => ({
        ref: docSnap.ref,
        data: {
          tokoNama,
          updatedAt: now,
          updatedBy: adminUid || "",
        },
      }))

    const karyawanUpdatedCount =
      karyawanUpdates.length > 0 ? await commitInChunks(karyawanUpdates) : 0

    // ── Sinkron users ─────────────────────────────────────────────────────────
    const usersSnap = await adminDb
      .collection("users")
      .where("tokoId", "==", tokoId)
      .get()

    const usersUpdates: BatchUpdateItem[] = usersSnap.docs
      .filter((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>
        return String(data?.tokoNama || "").trim() !== tokoNama
      })
      .map((docSnap) => ({
        ref: docSnap.ref,
        data: {
          tokoNama,
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
          ? "Sinkron nama toko berhasil"
          : "Semua data sudah sinkron",
    })
  } catch (error: any) {
    console.error("SYNC_NAMA_TOKO_ERROR:", error)
    return NextResponse.json(
      { message: error?.message || "Gagal sinkron nama toko" },
      { status: 500 }
    )
  }
}