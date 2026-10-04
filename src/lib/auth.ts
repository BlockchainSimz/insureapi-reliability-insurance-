export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  user: { id: string; email?: string };
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const STORAGE_KEY = "insureapi_auth_session";

export const authConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

function headers() {
  if (!SUPABASE_KEY) throw new Error("Supabase publishable key is not configured");
  return { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
}

function persistSession(data: any): AuthSession {
  const session: AuthSession = {
    ...data,
    expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  if (!SUPABASE_URL) throw new Error("Supabase URL is not configured");
  const response = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.msg || data.message || "Sign in failed");
  return persistSession(data);
}

export function getStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as AuthSession : null;
  } catch { return null; }
}

export function getAccessToken() { return getStoredSession()?.access_token || null; }
export function signOut() { localStorage.removeItem(STORAGE_KEY); }

async function refreshSession(): Promise<AuthSession | null> {
  const session = getStoredSession();
  if (!SUPABASE_URL || !session?.refresh_token) return null;

  const response = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });

  if (!response.ok) {
    signOut();
    return null;
  }
  return persistSession(await response.json());
}

export async function getCurrentUser() {
  let session = getStoredSession();
  if (!session?.access_token || !SUPABASE_URL) return null;

  const expiresSoon = session.expires_at <= Math.floor(Date.now() / 1000) + 60;
  if (expiresSoon) {
    session = await refreshSession();
    if (!session) return null;
  }

  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { ...headers(), Authorization: "Bearer " + session.access_token },
  });
  if (!response.ok) { signOut(); return null; }
  return await response.json();
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  let session = getStoredSession();
  if (session?.expires_at && session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    session = await refreshSession();
  }

  const requestHeaders = new Headers(init.headers);
  if (session?.access_token) requestHeaders.set("Authorization", "Bearer " + session.access_token);
  let response = await fetch(input, { ...init, headers: requestHeaders });

  if (response.status === 401 && session?.refresh_token) {
    const refreshed = await refreshSession();
    if (refreshed) {
      requestHeaders.set("Authorization", "Bearer " + refreshed.access_token);
      response = await fetch(input, { ...init, headers: requestHeaders });
    }
  }
  return response;
}
