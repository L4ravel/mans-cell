// API reset password akun pelanggan Firebase Auth ke password default.
// Route ini dipanggil dari admin panel akun pelanggan.

import { NextResponse } from "next/server"
import { adminAuth } from "@/lib/firebase-admin"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const uid = String(body?.uid || "")
    const password = String(body?.password || "")

    if (!uid) {
      return NextResponse.json({ message: "UID wajib diisi" }, { status: 400 })
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { message: "Password minimal 8 karakter" },
        { status: 400 }
      )
    }

    await adminAuth.updateUser(uid, { password })

    return NextResponse.json({
      success: true,
      message: "Password berhasil direset",
    })
  } catch (error: any) {
    console.error("RESET_PELANGGAN_PASSWORD_ERROR:", error)
    return NextResponse.json(
      { message: error?.message || "Gagal reset password" },
      { status: 500 }
    )
  }
}