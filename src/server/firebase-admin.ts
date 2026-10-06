import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID || "";
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

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

export function requireFirestore() {
  if (!firestore) throw new Error("Firebase Admin is not configured");
  return firestore;
}
