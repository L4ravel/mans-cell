// Inisialisasi Firebase Admin untuk akses server-side seperti CRUD admin, verify token, dan akses penuh Firestore.
import { getApps, cert, initializeApp, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  throw new Error("Firebase Admin environment variables are missing");
}

let adminApp: App;

if (getApps().length > 0) {
  adminApp = getApps()[0]!;
} else {
  adminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export const adminDb = getFirestore(adminApp);
export default adminApp;