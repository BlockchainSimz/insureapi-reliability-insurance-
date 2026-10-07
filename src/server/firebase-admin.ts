import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function normalizeConfigValue(raw: string) {
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value.trim();
}

function normalizePrivateKey(raw: string) {
  let value = normalizeConfigValue(raw);
  value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\u003d/g, "=");
  return value.replace(/\\r?\\n/g, "\n").trim();
}

const projectId = normalizeConfigValue(process.env.FIREBASE_PROJECT_ID || "");
const clientEmail = normalizeConfigValue(process.env.FIREBASE_CLIENT_EMAIL || "");
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

export function getFirebaseAdminIdentity() {
  return {
    projectId,
    clientEmail,
    keyPresent: Boolean(privateKey),
    keyFormat: /^-----BEGIN PRIVATE KEY-----\n[\s\S]+\n-----END PRIVATE KEY-----$/.test(privateKey),
    keyLength: privateKey.length,
  };
}

export async function verifyFirestoreConnection() {
  if (!firestore) throw new Error("Firebase Admin is not configured");
  await firestore.collection("_health").doc("firebase-admin").set({
    checked_at: new Date().toISOString(),
    project_id: projectId,
  });
  return getFirebaseAdminIdentity();
}

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
