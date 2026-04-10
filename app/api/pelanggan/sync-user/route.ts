// API sinkron / buat akun pelanggan.
// Kalau email sudah ada di Firebase Auth, pakai akun existing.
// Kalau belum ada, buat akun baru.
// Setelah itu, mapping users dan uid pelanggan disinkronkan.

import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"

type Body = {
  pelangganId?: string
  nama?: string
  email?: string
  telepon?: string
  nomorKartu?: string
  kodePelanggan?: string
  aktif?: boolean
  password?: string
  adminUid?: string
}

function sanitizeEmailBase(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").trim()
}

function sanitizeNumberBase(value: string) {
  return value.replace(/\D/g, "").trim()
}

function generateEmailCandidates(data: {
  email?: string
  nama?: string
  telepon?: string
  kodePelanggan?: string
}) {
  const rawEmail = String(data.email || "").trim().toLowerCase()

  if (rawEmail && rawEmail.includes("@")) {
    return [rawEmail]
  }

  const fromNama = sanitizeEmailBase(String(data.nama || ""))
  const fromPhone = sanitizeNumberBase(String(data.telepon || ""))
  const fromKode = sanitizeEmailBase(String(data.kodePelanggan || ""))

  const candidates = [
    fromNama ? `${fromNama}@pelanggan.id` : "",
    fromNama && fromPhone ? `${fromNama}${fromPhone.slice(-4)}@pelanggan.id` : "",
    fromKode ? `${fromKode}@pelanggan.id` : "",
    fromNama ? `${fromNama}${Date.now().toString().slice(-4)}@pelanggan.id` : "",
  ]
    .map((x) => x.trim())
    .filter(Boolean)

  return [...new Set(candidates)]
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body

    const pelangganId = String(body?.pelangganId || "").trim()
    const nama = String(body?.nama || "").trim()
    const telepon = String(body?.telepon || "").trim()
    const nomorKartu = String(body?.nomorKartu || "").trim().toUpperCase()
    const kodePelanggan = String(body?.kodePelanggan || "").trim().toUpperCase()
    const aktif = Boolean(body?.aktif)
    const password = String(body?.password || "")
    const adminUid = String(body?.adminUid || "").trim()

    if (!pelangganId) {
      return NextResponse.json({ message: "pelangganId wajib diisi" }, { status: 400 })
    }

    if (!nama) {
      return NextResponse.json({ message: "Nama pelanggan wajib diisi" }, { status: 400 })
    }

    if (!aktif) {
      return NextResponse.json(
        { message: "Pelanggan nonaktif tidak bisa dibuatkan akun" },
        { status: 400 }
      )
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { message: "Password default minimal 8 karakter" },
        { status: 400 }
      )
    }

    const pelangganRef = adminDb.collection("pelanggan").doc(pelangganId)
    const pelangganSnap = await pelangganRef.get()

    if (!pelangganSnap.exists) {
      return NextResponse.json({ message: "Data pelanggan tidak ditemukan" }, { status: 404 })
    }

    const emailCandidates = generateEmailCandidates({
      email: body?.email,
      nama,
      telepon,
      kodePelanggan,
    })

    if (!emailCandidates.length) {
      return NextResponse.json({ message: "Email pelanggan tidak valid" }, { status: 400 })
    }

    let userRecord: any = null
    let finalEmail = ""
    let action: "created" | "synced" = "synced"

    for (const email of emailCandidates) {
      try {
        userRecord = await adminAuth.getUserByEmail(email)
        finalEmail = userRecord.email || email
        action = "synced"
        break
      } catch (error: any) {
        if (error?.code !== "auth/user-not-found") {
          throw error
        }
      }
    }

    if (!userRecord) {
      const primaryEmail = emailCandidates[0]

      userRecord = await adminAuth.createUser({
        email: primaryEmail,
        password,
        displayName: nama,
        disabled: false,
      })

      finalEmail = userRecord.email || primaryEmail
      action = "created"
    } else {
      const updatePayload: {
        displayName?: string
        disabled?: boolean
      } = {}

      if (nama && userRecord.displayName !== nama) {
        updatePayload.displayName = nama
      }

      if (userRecord.disabled) {
        updatePayload.disabled = false
      }

      if (Object.keys(updatePayload).length > 0) {
        userRecord = await adminAuth.updateUser(userRecord.uid, updatePayload)
      }
    }

    const now = Date.now()

    await adminDb.collection("users").doc(userRecord.uid).set(
      {
        uid: userRecord.uid,
        email: finalEmail,
        nama,
        pelangganId,
        role: "pelanggan",
        roles: ["pelanggan"],
        aktif: true,
        nomorKartu,
        kodePelanggan,
        telepon,
        updatedAt: now,
        updatedBy: adminUid || "",
        ...(action === "created"
          ? {
              createdAt: now,
              createdBy: adminUid || "",
            }
          : {}),
      },
      { merge: true }
    )

    await pelangganRef.set(
      {
        uid: userRecord.uid,
        updatedAt: now,
        updatedBy: adminUid || "",
      },
      { merge: true }
    )

    return NextResponse.json({
      success: true,
      action,
      uid: userRecord.uid,
      email: finalEmail,
      message:
        action === "created"
          ? "Akun pelanggan berhasil dibuat"
          : "Akun pelanggan berhasil disinkronkan",
    })
  } catch (error: any) {
    console.error("SYNC_PELANGGAN_USER_ERROR:", error)
    return NextResponse.json(
      { message: error?.message || "Gagal sinkron akun pelanggan" },
      { status: 500 }
    )
  }
}