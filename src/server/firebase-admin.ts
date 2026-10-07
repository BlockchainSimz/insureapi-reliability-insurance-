import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID || "";
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
function normalizePrivateKey(raw: string) {
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\u003d/g, "=");
  return value.replace(/\\r?\\n/g, "\n").trim();
}
const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || "");

export const firebaseAdminConfigured = Boolean(projectId && clientEmail && privateKey);

const app = firebaseAdminConfigured
  ? (getApps().length ? getApps()[0] : initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    }))
  : null;

export const firebaseAuth = app ? getAuth(app) : null;
export const firestore = app ? getFirestore(app) : null;
export { FieldValue };

export async function verifyFirebaseIdToken(token: string) {
  if (!firebaseAuth) return null;
  try {
    return await firebaseAuth.verifyIdToken(token, true);
  } catch {
    return null;
  }
}

export async function verifyFirestoreConnection() {\n  if (!firestore) throw new Error("Firebase Admin is not configured");\n  await firestore.collection("_health").doc("connectivity").set({ checked_at: new Date().toISOString() });\n  return true;\n}\n\nexport function requireFirestore() {
  if (!firestore) throw new Error("Firebase Admin is not configured");
  return firestore;
}
