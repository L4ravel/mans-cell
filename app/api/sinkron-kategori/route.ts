/*
  API sinkron kategori barang.
  Setelah nama kategori diubah di master kategori,
  API ini akan menyamakan kategoriNama pada semua dokumen barang
  yang memiliki kategoriId yang sama, lalu ikut menyinkronkan
  nama kategori pada kategoriBreakdown di laporan_harian dan laporan_bulanan.
*/

import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase-admin"

type Body = {
  kategoriId?: string
  kategoriNama?: string
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

function syncKategoriBreakdownNama(
  rawBreakdown: unknown,
  kategoriId: string,
  kategoriNama: string
) {
  if (!Array.isArray(rawBreakdown)) {
    return { changed: false, value: rawBreakdown }
  }

  let changed = false

  const nextBreakdown = rawBreakdown.map((item) => {
    const current = item as Record<string, unknown>
    const currentKategoriId = String(current?.kategoriId || "").trim()
    const currentNama = String(current?.nama || "").trim()

    if (currentKategoriId !== kategoriId) {
      return item
    }

    if (currentNama === kategoriNama) {
      return item
    }

    changed = true
    return {
      ...current,
      nama: kategoriNama,
    }
  })

  return {
    changed,
    value: nextBreakdown,
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body

    const kategoriId = String(body?.kategoriId || "").trim()
    const kategoriNama = String(body?.kategoriNama || "").trim()
    const adminUid = String(body?.adminUid || "").trim()
    const now = Date.now()

    if (!kategoriId) {
      return NextResponse.json({ message: "kategoriId wajib diisi" }, { status: 400 })
    }

    if (!kategoriNama) {
      return NextResponse.json({ message: "kategoriNama wajib diisi" }, { status: 400 })
    }

    const kategoriRef = adminDb.collection("kategori_barang").doc(kategoriId)
    const kategoriSnap = await kategoriRef.get()

    if (!kategoriSnap.exists) {
      return NextResponse.json({ message: "Data kategori tidak ditemukan" }, { status: 404 })
    }

    // ── Sinkron barang ───────────────────────────────────────────────────────
    const barangSnap = await adminDb
      .collection("barang")
      .where("kategoriId", "==", kategoriId)
      .get()

    const barangUpdates: BatchUpdateItem[] = barangSnap.docs
      .filter((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>
        return String(data?.kategoriNama || "").trim() !== kategoriNama
      })
      .map((docSnap) => ({
        ref: docSnap.ref,
        data: {
          kategoriNama,
          updatedAt: now,
          updatedBy: adminUid || "",
        },
      }))

    const barangUpdatedCount =
      barangUpdates.length > 0 ? await commitInChunks(barangUpdates) : 0

    // ── Sinkron laporan harian ───────────────────────────────────────────────
    const laporanHarianSnap = await adminDb.collection("laporan_harian").get()
    const laporanHarianUpdates: BatchUpdateItem[] = []

    laporanHarianSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>
      const syncResult = syncKategoriBreakdownNama(
        data?.kategoriBreakdown,
        kategoriId,
        kategoriNama
      )

      if (!syncResult.changed) return

      laporanHarianUpdates.push({
        ref: docSnap.ref,
        data: {
          kategoriBreakdown: syncResult.value,
          updatedAtMs: now,
          updatedAt: now,
          updatedBy: adminUid || "",
        },
      })
    })

    const laporanHarianUpdatedCount =
      laporanHarianUpdates.length > 0 ? await commitInChunks(laporanHarianUpdates) : 0

    // ── Sinkron laporan bulanan ──────────────────────────────────────────────
    const laporanBulananSnap = await adminDb.collection("laporan_bulanan").get()
    const laporanBulananUpdates: BatchUpdateItem[] = []

    laporanBulananSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>
      const syncResult = syncKategoriBreakdownNama(
        data?.kategoriBreakdown,
        kategoriId,
        kategoriNama
      )

      if (!syncResult.changed) return

      laporanBulananUpdates.push({
        ref: docSnap.ref,
        data: {
          kategoriBreakdown: syncResult.value,
          updatedAtMs: now,
          updatedAt: now,
          updatedBy: adminUid || "",
        },
      })
    })

    const laporanBulananUpdatedCount =
      laporanBulananUpdates.length > 0 ? await commitInChunks(laporanBulananUpdates) : 0

    const totalUpdated =
      barangUpdatedCount + laporanHarianUpdatedCount + laporanBulananUpdatedCount

    return NextResponse.json({
      success: true,
      updatedCount: totalUpdated,
      detail: {
        barang: barangUpdatedCount,
        laporanHarian: laporanHarianUpdatedCount,
        laporanBulanan: laporanBulananUpdatedCount,
      },
      message:
        totalUpdated > 0
          ? "Sinkron kategori berhasil"
          : "Semua data sudah sinkron",
    })
  } catch (error: any) {
    console.error("SYNC_KATEGORI_ERROR:", error)
    return NextResponse.json(
      { message: error?.message || "Gagal sinkron kategori barang" },
      { status: 500 }
    )
  }
}