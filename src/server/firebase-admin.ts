import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createPrivateKey } from "node:crypto";

type ServiceAccount = {
  project_id?: unknown;
  client_email?: unknown;
  private_key?: unknown;
};

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

function parseServiceAccount(raw: string): ServiceAccount | null {
  let value = normalizeConfigValue(raw);
  for (let i = 0; i < 3; i += 1) {
    if (!value.startsWith("{")) break;
    try {
      const parsed = JSON.parse(value) as ServiceAccount;
      if (typeof parsed.project_id === "string" || typeof parsed.client_email === "string" || typeof parsed.private_key === "string") {
        return parsed;
      }
    } catch {
      break;
    }
  }

  const decoded = decodeBase64Utf8(value);
  if (decoded.startsWith("{")) {
    try {
      const parsed = JSON.parse(decoded) as ServiceAccount;
      if (typeof parsed.project_id === "string" || typeof parsed.client_email === "string" || typeof parsed.private_key === "string") {
        return parsed;
      }
    } catch {
      // Not a service-account JSON value.
    }
  }
  return null;
}

function normalizePrivateKey(raw: string) {
  let value = normalizeConfigValue(raw);
  const account = parseServiceAccount(value);
  if (account && typeof account.private_key === "string") value = account.private_key;

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

  if (!value.includes("-----BEGIN ")) {
    const decoded = decodeBase64Utf8(value);
    const accountFromBase64 = parseServiceAccount(decoded);
    if (accountFromBase64 && typeof accountFromBase64.private_key === "string") {
      value = normalizePrivateKey(accountFromBase64.private_key);
    } else if (decoded.includes("-----BEGIN ")) {
      value = decoded;
    }
  }

  const match = value.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/);
  if (match) value = match[0];

  return value.trim();
}

function resolveServiceAccount() {
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64,
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    process.env.FIREBASE_PROJECT_ID,
    process.env.FIREBASE_PRIVATE_KEY,
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const raw of candidates) {
    const account = parseServiceAccount(raw);
    if (account) return account;
  }
  return null;
}

const serviceAccount = resolveServiceAccount();
const projectId = normalizeConfigValue(
  (typeof serviceAccount?.project_id === "string" ? serviceAccount.project_id : process.env.FIREBASE_PROJECT_ID) || ""
);
const clientEmail = normalizeConfigValue(
  (typeof serviceAccount?.client_email === "string" ? serviceAccount.client_email : process.env.FIREBASE_CLIENT_EMAIL) || ""
);
const privateKey = normalizePrivateKey(
  (typeof serviceAccount?.private_key === "string" ? serviceAccount.private_key : "") ||
  process.env.FIREBASE_PRIVATE_KEY_BASE64 ||
  process.env.FIREBASE_PRIVATE_KEY ||
  ""
);

export const firebaseAdminConfigured = Boolean(projectId && clientEmail && privateKey);

function assertPrivateKeyFormat(value: string) {
  if (!value) return;
  try {
    createPrivateKey({ key: value, format: "pem", type: "pkcs8" });
  } catch {
    throw new Error(
      "Firebase Admin private key is present but invalid. Provide the exact Firebase service-account credential via FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, or the private key via FIREBASE_PRIVATE_KEY_BASE64."
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
