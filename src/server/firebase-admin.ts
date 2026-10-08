import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createPrivateKey } from "node:crypto";

function normalizeConfigValue(raw: string) {
  let value = raw.trim().replace(/^\uFEFF/, "");
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value.trim();
}

function decodeBase64Utf8(value: string) {
  try {
    const normalized = value.replace(/\s+/g, "");
    if (!normalized || normalized.length % 4 === 1) return "";
    return Buffer.from(normalized, "base64").toString("utf8").trim();
  } catch {
    return "";
  }
}

function normalizePrivateKey(raw: string) {
  let value = normalizeConfigValue(raw);

  // Accept a full service-account JSON object.
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as { private_key?: unknown };
      if (typeof parsed.private_key === "string") value = parsed.private_key;
    } catch {
      // Continue with the original value.
    }
  }

  // Decode repeated JSON/secret-manager escaping.
  for (let i = 0; i < 4; i += 1) {
    value = value
      .replace(/\\u003d/gi, "=")
      .replace(/\\u002d/gi, "-")
      .replace(/\\u005f/gi, "_")
      .replace(/\\r/gi, "\r")
      .replace(/\\n/gi, "\n");

    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === "string") {
          value = parsed;
          continue;
        }
      } catch {
        // Continue.
      }
    }
    break;
  }

  value = value.replace(/\\r?\\n/g, "\n").replace(/\r\n?/g, "\n").trim();

  // If the secret is base64-encoded, decode either a PEM or a full JSON credential.
  if (!value.includes("-----BEGIN ")) {
    const decoded = decodeBase64Utf8(value);
    if (decoded.startsWith("{")) {
      try {
        const parsed = JSON.parse(decoded) as { private_key?: unknown };
        if (typeof parsed.private_key === "string") {
          value = normalizePrivateKey(parsed.private_key);
        }
      } catch {
        // Leave unchanged.
      }
    } else if (decoded.includes("-----BEGIN ")) {
      value = decoded;
    }
  }

  // Extract a PEM block if a secret manager added surrounding text.
  const match = value.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/);
  if (match) value = match[0];

  return value.trim();
}

function resolvePrivateKey() {
  const explicitBase64 = normalizeConfigValue(process.env.FIREBASE_PRIVATE_KEY_BASE64 || "");
  if (explicitBase64) {
    const decoded = decodeBase64Utf8(explicitBase64);
    if (decoded) return normalizePrivateKey(decoded);
  }
  return normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || "");
}

const projectId = normalizeConfigValue(process.env.FIREBASE_PROJECT_ID || "");
const clientEmail = normalizeConfigValue(process.env.FIREBASE_CLIENT_EMAIL || "");
const privateKey = resolvePrivateKey();

export const firebaseAdminConfigured = Boolean(projectId && clientEmail && privateKey);

function assertPrivateKeyFormat(value: string) {
  if (!value) return;
  try {
    createPrivateKey({ key: value, format: "pem", type: "pkcs8" });
  } catch {
    throw new Error(
      "Firebase Admin private key is present but invalid. Store the exact private_key from the Firebase service-account JSON, or provide its base64 encoding in FIREBASE_PRIVATE_KEY_BASE64."
    );
  }
}

if (firebaseAdminConfigured) assertPrivateKeyFormat(privateKey);

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
