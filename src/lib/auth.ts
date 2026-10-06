import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  user: { id: string; email?: string };
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const authConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

const app = authConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;
const auth = app ? getAuth(app) : null;

function mapUser(user: User) {
  return { id: user.uid, email: user.email || undefined };
}

function authError(error: unknown) {
  const code = (error as { code?: string })?.code || "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Invalid email or password",
    "auth/email-already-in-use": "An account with this email already exists",
    "auth/weak-password": "Password does not meet Firebase password policy",
    "auth/too-many-requests": "Too many attempts. Please try again later",
    "auth/user-disabled": "This account has been disabled",
  };
  return messages[code] || (error instanceof Error ? error.message : "Authentication failed");
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  if (!auth) throw new Error("Firebase Authentication is not configured");
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const accessToken = await credential.user.getIdToken();
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

export function getAccessToken() {
  return null;
}

export async function signOut() {
  if (auth) await firebaseSignOut(auth);
}

export function onAuthChange(callback: (user: { id: string; email?: string } | null) => void) {
  if (!auth) return () => undefined;
  return onAuthStateChanged(auth, user => callback(user ? mapUser(user) : null));
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const requestHeaders = new Headers(init.headers);
  if (auth?.currentUser) {
    const token = await auth.currentUser.getIdToken();
    requestHeaders.set("Authorization", "Bearer " + token);
  }
  return fetch(input, { ...init, headers: requestHeaders });
}

export async function signUp(email: string, password: string): Promise<AuthSession | null> {
  if (!auth) throw new Error("Firebase Authentication is not configured");
  if (password.length < 12) throw new Error("Password must be at least 12 characters");
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const accessToken = await credential.user.getIdToken();
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
