import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from "firebase/auth";

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  user: { id: string; email?: string };
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "https://insureapi-api-production.up.railway.app").replace(/\/+$/, "");

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
};

let firebaseApp: FirebaseApp | null = null;
let auth: Auth | null = null;
let initPromise: Promise<Auth> | null = null;

// Production authentication is always required. The actual public Firebase web
// configuration is fetched at runtime from the API so Vercel does not need
// build-time VITE_FIREBASE_* variables.
export const authConfigured = true;

async function ensureAuth(): Promise<Auth> {
  if (auth) return auth;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const response = await fetch(API_BASE_URL + "/api/auth/config", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const config = await response.json().catch(() => null);
    if (!response.ok || !config?.apiKey || !config?.authDomain || !config?.projectId || !config?.appId) {
      throw new Error("Firebase Authentication configuration is unavailable");
    }

    const firebaseConfig: FirebaseWebConfig = {
      apiKey: String(config.apiKey),
      authDomain: String(config.authDomain),
      projectId: String(config.projectId),
      storageBucket: config.storageBucket ? String(config.storageBucket) : undefined,
      messagingSenderId: config.messagingSenderId ? String(config.messagingSenderId) : undefined,
      appId: String(config.appId),
    };

    firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    return auth;
  })();

  try {
    return await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

function mapUser(user: User) {
  return { id: user.uid, email: user.email || undefined };
}

function authError(error: unknown) {
  const code = (error as { code?: string })?.code || "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Invalid email or password",
    "auth/invalid-login-credentials": "Invalid email or password",
    "auth/email-already-in-use": "An account with this email already exists",
    "auth/weak-password": "Password does not meet Firebase password policy",
    "auth/too-many-requests": "Too many attempts. Please try again later",
    "auth/user-disabled": "This account has been disabled",
    "auth/network-request-failed": "Unable to reach Firebase Authentication. Check your connection and try again",
    "auth/api-key-not-valid": "Firebase Authentication configuration is invalid on the server",
    "auth/invalid-api-key": "Firebase Authentication configuration is invalid on the server",
  };
  return messages[code] || (error instanceof Error ? error.message : "Authentication failed");
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const firebaseAuth = await ensureAuth();
  try {
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const accessToken = await credential.user.getIdToken(true);
    return {
      access_token: accessToken,
      refresh_token: "",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: mapUser(credential.user),
    };
  } catch (error) {
    throw new Error(authError(error));
  }
}

export function getStoredSession(): AuthSession | null {
  const user = auth?.currentUser;
  return user ? {
    access_token: "",
    refresh_token: "",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: mapUser(user),
  } : null;
}

export async function getCurrentUser() {
  return auth?.currentUser ? mapUser(auth.currentUser) : null;
}

export async function getAccessToken() {
  const firebaseAuth = await ensureAuth();
  if (!firebaseAuth.currentUser) return null;
  return firebaseAuth.currentUser.getIdToken();
}

export async function signOut() {
  if (auth) await firebaseSignOut(auth);
}

export function onAuthChange(callback: (user: { id: string; email?: string } | null) => void) {
  let unsubscribe = () => undefined;
  void ensureAuth()
    .then(firebaseAuth => {
      unsubscribe = onAuthStateChanged(firebaseAuth, user => callback(user ? mapUser(user) : null));
    })
    .catch(error => {
      console.error("[InsureAPI] Firebase auth initialization failed", error);
      callback(null);
    });
  return () => unsubscribe();
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const firebaseAuth = await ensureAuth();
  const requestHeaders = new Headers(init.headers);
  if (firebaseAuth.currentUser) {
    const token = await firebaseAuth.currentUser.getIdToken();
    requestHeaders.set("Authorization", "Bearer " + token);
  }

  const target = typeof input === "string" && input.startsWith("/")
    ? API_BASE_URL + input
    : input;

  return fetch(target, { ...init, headers: requestHeaders });
}

export async function signUp(email: string, password: string): Promise<AuthSession | null> {
  const firebaseAuth = await ensureAuth();
  if (password.length < 12) throw new Error("Password must be at least 12 characters");
  try {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    const accessToken = await credential.user.getIdToken(true);
    return {
      access_token: accessToken,
      refresh_token: "",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: mapUser(credential.user),
    };
  } catch (error) {
    throw new Error(authError(error));
  }
}
