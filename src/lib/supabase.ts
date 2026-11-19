import { createClient, type Session, type AuthError } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://gnnfykbnblhwlwwtzqry.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_m6ccsq9F7MjPmPovtjZPRw_h1VStCw8';

const rawSupabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL || '').trim() || DEFAULT_SUPABASE_URL;
const supabaseKey: string =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim() ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim() ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY;

// Defensive normalization: ensure trailing slashes are removed and .supabase.com is corrected to .supabase.co
const normalizedUrl = rawSupabaseUrl
  .trim()
  .replace(/\/+$/, '')
  .replace(/\.supabase\.com$/i, '.supabase.co');

// In local dev, route through the local Vite proxy (/supabase-api) to prevent browser ISP timeouts or CORS blocks.
// In production, always hit the Supabase project URL directly.
const isDev = import.meta.env.DEV;
const supabaseUrl =
  isDev && typeof window !== 'undefined'
    ? `${window.location.origin}/supabase-api`
    : normalizedUrl || DEFAULT_SUPABASE_URL;

/**
 * Checks whether an error object or message corresponds to an invalid, expired,
 * or missing Supabase Auth refresh token (HTTP 400 on /auth/v1/token?grant_type=refresh_token).
 */
export function isRefreshTokenError(errOrMsg: unknown): boolean {
  if (!errOrMsg) return false;
  const rawMessage =
    typeof errOrMsg === 'string'
      ? errOrMsg
      : typeof errOrMsg === 'object'
      ? `${(errOrMsg as any).message || ''} ${(errOrMsg as any).code || ''} ${(errOrMsg as any).error_description || ''} ${(errOrMsg as any).error || ''}`
      : String(errOrMsg);
  const lower = rawMessage.toLowerCase();
  return (
    lower.includes('invalid refresh token') ||
    lower.includes('refresh token not found') ||
    lower.includes('refresh_token_not_found') ||
    lower.includes('refresh_token_already_used') ||
    lower.includes('invalid_grant') ||
    lower.includes('bad_jwt') ||
    (lower.includes('refresh_token') && lower.includes('400'))
  );
}

/**
 * Removes all stale/broken Supabase auth token keys (`sb-*` or `*auth-token*`)
 * from localStorage and sessionStorage so the client stops retrying invalid refresh tokens.
 */
export function clearStaleSupabaseAuthStorage(): void {
  const cleanStorage = (storage?: Storage) => {
    if (!storage) return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('auth-token'))) {
          keysToRemove.push(key);
        }
      }
      for (const k of keysToRemove) {
        storage.removeItem(k);
      }
    } catch {
      // ignore storage access errors
    }
  };

  if (typeof window !== 'undefined') {
    try {
      cleanStorage(window.localStorage);
    } catch {
      // ignore
    }
    try {
      cleanStorage(window.sessionStorage);
    } catch {
      // ignore
    }
  }
}

/**
 * Pre-initialization sanitizer: removes malformed or expired `sb-*-auth-token` entries
 * before `createClient` runs `_loadSession()`, preventing an immediate 400 Bad Request
 * on `/auth/v1/token?grant_type=refresh_token` when the page loads with a stale token.
 */
function sanitizeStoredSupabaseTokensBeforeInit(): void {
  if (typeof window === 'undefined') return;
  try {
    const storage = window.localStorage;
    if (!storage) return;

    const hasActiveAppSession = Boolean(
      window.sessionStorage && window.sessionStorage.getItem('mock-auth-role')
    );
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    const isAuthCallbackUrl =
      search.includes('code=') ||
      search.includes('token_hash=') ||
      search.includes('step=pin') ||
      hash.includes('access_token=') ||
      hash.includes('type=recovery') ||
      hash.includes('type=email_change') ||
      hash.includes('type=signup');

    const keysToInspect: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('auth-token'))) {
        keysToInspect.push(key);
      }
    }

    for (const key of keysToInspect) {
      if (key.endsWith('-code-verifier')) continue;
      const raw = storage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const sessionObj = parsed?.currentSession || parsed?.session || parsed;
        const accessToken = sessionObj?.access_token;
        const refreshToken = sessionObj?.refresh_token;
        const expiresAt = Number(sessionObj?.expires_at || 0);
        const isExpired = expiresAt > 0 && expiresAt * 1000 <= Date.now() + 15000;

        if (!accessToken || !refreshToken || typeof refreshToken !== 'string') {
          storage.removeItem(key);
        } else if (isExpired && !hasActiveAppSession && !isAuthCallbackUrl) {
          storage.removeItem(key);
        }
      } catch {
        storage.removeItem(key);
      }
    }
  } catch {
    // ignore storage errors
  }
}

sanitizeStoredSupabaseTokensBeforeInit();

// The publishable key is safe in the browser. Data access is enforced by Row Level Security.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  global: {
    headers: {
      apikey: supabaseKey,
    },
    fetch: async (url, options = {}) => {
      const headers = new Headers(options.headers);
      if (!headers.has('apikey') || !headers.get('apikey')) {
        headers.set('apikey', supabaseKey);
      }
      if (!headers.has('Authorization') || !headers.get('Authorization')) {
        headers.set('Authorization', `Bearer ${supabaseKey}`);
      }

      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request)?.url || '';
      const response = await fetch(url, { ...options, headers });

      // Automatically clear broken refresh tokens when /auth/v1/token?grant_type=refresh_token returns 400/401/422
      if (
        urlStr.includes('/auth/v1/token') &&
        urlStr.includes('grant_type=refresh_token') &&
        (response.status === 400 || response.status === 401 || response.status === 422)
      ) {
        clearStaleSupabaseAuthStorage();
        Promise.resolve().then(() => {
          supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        });
      }

      return response;
    },
  },
});

/**
 * Safely retrieves the active Supabase Auth session without throwing or looping
 * on invalid/expired refresh tokens. Automatically purges broken `sb-*` storage keys
 * and performs a local sign-out when a refresh token error is detected.
 */
export async function safeGetSession(): Promise<{
  data: { session: Session | null };
  error: AuthError | null;
}> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      if (isRefreshTokenError(error) || error.status === 400) {
        clearStaleSupabaseAuthStorage();
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        return { data: { session: null }, error: null };
      }
      return { data: { session: data?.session ?? null }, error };
    }
    return { data: { session: data?.session ?? null }, error: null };
  } catch (err: unknown) {
    if (isRefreshTokenError(err)) {
      clearStaleSupabaseAuthStorage();
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
    return { data: { session: null }, error: null };
  }
}

