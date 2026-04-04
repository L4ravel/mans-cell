// API hapus user Firebase Auth dan mapping users di Firestore.
// Dipakai saat admin ingin menghapus akun karyawan permanen.

import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const uid = String(body?.uid || "")

    if (!uid) {
      return NextResponse.json({ message: "UID wajib diisi" }, { status: 400 })
    }

    await adminAuth.deleteUser(uid)
    await adminDb.collection("users").doc(uid).delete()

    return NextResponse.json({
      success: true,
      message: "Akun berhasil dihapus",
    })
  } catch (error: any) {
    console.error("DELETE_USER_ERROR:", error)
    return NextResponse.json(
      { message: error?.message || "Gagal hapus akun" },
      { status: 500 }
    )
  }
}