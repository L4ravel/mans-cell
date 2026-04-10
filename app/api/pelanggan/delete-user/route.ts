// API hapus user pelanggan Firebase Auth, mapping users di Firestore,
// dan kosongkan uid pada dokumen pelanggan.

import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const uid = String(body?.uid || "")
    const pelangganId = String(body?.pelangganId || "")

    if (!uid) {
      return NextResponse.json({ message: "UID wajib diisi" }, { status: 400 })
    }

    await adminAuth.deleteUser(uid)
    await adminDb.collection("users").doc(uid).delete()

    if (pelangganId) {
      await adminDb.collection("pelanggan").doc(pelangganId).update({
        uid: "",
        updatedAt: Date.now(),
      })
    }

    return NextResponse.json({
      success: true,
      message: "Akun berhasil dihapus",
    })
  } catch (error: any) {
    console.error("DELETE_PELANGGAN_USER_ERROR:", error)
    return NextResponse.json(
      { message: error?.message || "Gagal hapus akun" },
      { status: 500 }
    )
  }
}