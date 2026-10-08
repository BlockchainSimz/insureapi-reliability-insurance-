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

  // Railway secrets can contain a PEM directly, escaped newlines, a JSON-encoded
  // private key, or the full service-account JSON. Normalize all supported forms.
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as { private_key?: unknown };
      if (typeof parsed.private_key === "string") value = parsed.private_key;
    } catch {
      // Keep the original value; PEM validation below will fail safely.
    }
  }

  for (let i = 0; i < 3; i += 1) {
    value = value
      .replace(/\\u003d/gi, "=")
      .replace(/\\r/g, "\r")
      .replace(/\\n/g, "\n");
  }

  if (value.startsWith('\"') && value.endsWith('\"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "string") value = parsed;
    } catch {
      // Leave unchanged.
    }
  }

  value = value.replace(/\\r?\\n/g, "\n").trim();

  // Some secret managers store the entire credential (or PEM) as base64.
  // Decode only when the normalized value is not already a PEM.
  if (!value.startsWith("-----BEGIN ")) {
    try {
      const decoded = Buffer.from(value, "base64").toString("utf8").trim();
      if (decoded.startsWith("{")) {
        const parsed = JSON.parse(decoded) as { private_key?: unknown };
        if (typeof parsed.private_key === "string") {
          value = normalizePrivateKey(parsed.private_key);
        }
      } else if (decoded.startsWith("-----BEGIN ")) {
        value = decoded;
      }
    } catch {
      // Leave unchanged; Firebase Admin will reject an invalid credential.
    }
  }

  return value.trim();
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
