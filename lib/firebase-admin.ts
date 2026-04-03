// File ini untuk inisialisasi Firebase Admin SDK di server.
// Fungsinya verifikasi token Firebase Auth dan akses Firestore pakai service account yang valid.

import { App, cert, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

const projectId = process.env.FIREBASE_PROJECT_ID?.trim()
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY

function normalizePrivateKey(key?: string) {
  if (!key) return ""
  return key
    .trim()
    .replace(/^"|"$/g, "")
    .replace(/\\n/g, "\n")
}

const privateKey = normalizePrivateKey(rawPrivateKey)

if (!projectId || !clientEmail || !privateKey) {
  throw new Error(
    [
      "Firebase Admin environment variables are missing or invalid.",
      `FIREBASE_PROJECT_ID: ${projectId ? "OK" : "MISSING"}`,
      `FIREBASE_CLIENT_EMAIL: ${clientEmail ? "OK" : "MISSING"}`,
      `FIREBASE_PRIVATE_KEY: ${privateKey ? "OK" : "MISSING"}`,
    ].join(" ")
  )
}

const APP_NAME = "firebase-admin-app"

let adminApp: App

const existingApp = getApps().find((app) => app.name === APP_NAME)

if (existingApp) {
  adminApp = existingApp
} else {
  adminApp = initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    },
    APP_NAME
  )
}

export const adminDb = getFirestore(adminApp)
export const adminAuth = getAuth(adminApp)

export default adminApp