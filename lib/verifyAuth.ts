// File ini untuk validasi bearer token Firebase di API route.
// Fungsinya cek token, baca user Firestore, validasi role, lalu return auth context yang aman.

import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"

type Role = "superadmin" | "admin" | "karyawan" | "manager"

type AuthSuccess = {
  email: string | null
  uid: string
  roles: Role[]
  ptkId: string | null
  karyawanId: string | null
  user: FirebaseFirestore.DocumentData
}

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 })
}

function forbidden(message = "Akses ditolak") {
  return NextResponse.json({ error: message }, { status: 403 })
}

function serverError(message = "Terjadi kesalahan pada server") {
  return NextResponse.json({ error: message }, { status: 500 })
}

function normalizeRoles(user: FirebaseFirestore.DocumentData): Role[] {
  const rawRoles = Array.isArray(user?.roles)
    ? user.roles
    : Array.isArray(user?.role)
    ? user.role
    : typeof user?.role === "string"
    ? [user.role]
    : []

  return rawRoles.filter((role: unknown): role is Role =>
    ["superadmin", "admin", "karyawan", "manager"].includes(String(role))
  )
}

function getAuthContext(user: FirebaseFirestore.DocumentData) {
  return {
    ptkId:
      user?.permissions?.ptkid ??
      user?.permissions?.ptkId ??
      user?.ptkId ??
      null,
    karyawanId:
      user?.permissions?.karyawanid ??
      user?.permissions?.karyawanId ??
      user?.karyawanId ??
      null,
  }
}

function getReadableVerifyTokenError(err: unknown) {
  if (typeof err === "object" && err !== null) {
    const errorObj = err as { code?: unknown; message?: unknown }
    const code = String(errorObj.code ?? "")
    const message = String(errorObj.message ?? "")

    if (code.includes("id-token-expired")) {
      return "Token Firebase expired, silakan login ulang"
    }

    if (code.includes("argument-error")) {
      return "Format token tidak valid atau Firebase Admin config bermasalah"
    }

    if (
      message.toLowerCase().includes("incorrect aud") ||
      message.toLowerCase().includes("audience")
    ) {
      return "Token berasal dari project Firebase yang berbeda"
    }

    return `${code || "auth-error"}: ${message || "Unknown error"}`
  }

  return "Unknown token verification error"
}

function getReadableFirestoreError(err: unknown) {
  if (typeof err === "object" && err !== null) {
    const errorObj = err as { code?: unknown; message?: unknown; details?: unknown }
    const code = String(errorObj.code ?? "")
    const message = String(errorObj.message ?? "")
    const details = String(errorObj.details ?? "")

    const fullText = `${message} ${details}`.toLowerCase()

    if (
      code === "16" ||
      fullText.includes("unauthenticated") ||
      fullText.includes("invalid authentication credentials")
    ) {
      return "Firebase Admin credential untuk Firestore tidak valid atau tidak cocok dengan project"
    }

    if (fullText.includes("permission_denied")) {
      return "Akses Firestore ditolak, cek service account dan project Firebase"
    }

    return `${code || "firestore-error"}: ${message || "Unknown error"}`
  }

  return "Unknown Firestore error"
}

export async function verifyAuth(
  req: Request,
  allowedRoles: Role[]
): Promise<AuthSuccess | NextResponse> {
  const authHeader = req.headers.get("authorization")

  if (!authHeader) {
    return unauthorized("Authorization header tidak ditemukan")
  }

  if (!authHeader.startsWith("Bearer ")) {
    return unauthorized("Format authorization harus Bearer token")
  }

  const token = authHeader.slice(7).trim()

  if (!token) {
    return unauthorized("Bearer token kosong")
  }

  let uid = ""

  try {
    const decoded = await adminAuth.verifyIdToken(token)
    uid = decoded.uid
  } catch (err) {
    console.error("verifyIdToken error detail:", {
      message: err instanceof Error ? err.message : "Unknown error message",
      readable: getReadableVerifyTokenError(err),
      raw: err,
    })

    return unauthorized("Token tidak valid")
  }

  let userSnap: FirebaseFirestore.DocumentSnapshot

  try {
    userSnap = await adminDb.collection("users").doc(uid).get()
  } catch (err) {
    console.error("Firestore admin read error detail:", {
      uid,
      message: err instanceof Error ? err.message : "Unknown error message",
      readable: getReadableFirestoreError(err),
      raw: err,
    })

    return serverError("Gagal mengakses data user dari Firebase Admin")
  }

  if (!userSnap.exists) {
    return forbidden("User tidak terdaftar")
  }

  const user = userSnap.data()!
  const roles = normalizeRoles(user)
  const hasAccess = roles.some((role) => allowedRoles.includes(role))

  if (!hasAccess) {
    return forbidden("Akses ditolak")
  }

  const { ptkId, karyawanId } = getAuthContext(user)

  return {
    uid,
    email: user?.email ?? null,
    roles,
    ptkId,
    karyawanId,
    user,
  }
}