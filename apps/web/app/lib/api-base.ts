/**
 * Single source of truth for API base URL.
 * NEXT_PUBLIC_API_URL is inlined at build time; fallback keeps local dev working without .env.
 */
export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  const base =
    typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : 'http://localhost:3001';
  return base.replace(/\/$/, '');
}

/** Absolute URL for an API path (must start with `/`, may include query string). */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${p}`;
}

/** מינימום לזיהוי משתמש מחובר ב-headers */
export const AUTH_TOKEN_STORAGE_KEY = 'galit-crm-token';
const SESSION_STORAGE_KEY = 'galit-crm-session';

/** Returns the stored JWT (if any) — the basis for authenticating to the API. */
export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export type ApiAuthUser = {
  id: string;
  role: string;
};

export type ApiFetchOptions = RequestInit & {
  /**
   * משתמש מחובר — יישלחו x-user-id ו-x-user-role.
   * בלי authUser (או null) — לא נשלחים (למשל login ציבורי).
   */
  authUser?: ApiAuthUser | null;
};

function resolveApiUrl(input: string): string {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return input;
  }
  return apiUrl(input.startsWith('/') ? input : `/${input}`);
}

function headersInitToObject(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) {
    const o: Record<string, string> = {};
    h.forEach((v, k) => {
      o[k] = v;
    });
    return o;
  }
  if (Array.isArray(h)) {
    return Object.fromEntries(h);
  }
  return { ...h };
}

/**
 * קריאת API אחידה: תמיד מוסיף Content-Type (JSON) כשאין FormData,
 * ו-x-user-role / x-user-id כשמועבר authUser.
 */
export async function apiFetch(url: string, options?: ApiFetchOptions): Promise<Response> {
  const { authUser, headers: inputHeaders, body, ...rest } = options ?? {};

  const merged = headersInitToObject(inputHeaders);
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  // Identity proof: signed JWT obtained at login. This is what the server verifies.
  const token = getStoredToken();
  if (token) {
    merged['Authorization'] = `Bearer ${token}`;
  }

  // Legacy hints — ignored by the server's auth (kept only for backward compatibility).
  if (authUser?.id && authUser?.role) {
    merged['x-user-role'] = String(authUser.role).toUpperCase();
    merged['x-user-id'] = authUser.id;
  }

  if (!isFormData && merged['Content-Type'] === undefined && merged['content-type'] === undefined) {
    merged['Content-Type'] = 'application/json';
  }

  const res = await fetch(resolveApiUrl(url), {
    ...rest,
    body,
    headers: merged,
  });

  // Missing/stale/expired token → clear the session and bounce to login (skip the login call itself).
  // Firing only when a session existed both (a) covers users whose stored session predates JWT
  // (session but no token) and (b) prevents reload loops: after clearing there is nothing left to trip it.
  if (res.status === 401 && !url.includes('/auth/login') && typeof window !== 'undefined') {
    let hadSession = false;
    try {
      hadSession = !!(
        window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ||
        window.localStorage.getItem(SESSION_STORAGE_KEY)
      );
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (hadSession) window.location.reload();
  }

  return res;
}
