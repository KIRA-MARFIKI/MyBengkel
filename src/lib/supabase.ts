import { createClient } from '@supabase/supabase-js';

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
    fetch: (url, options = {}) => {
      const headers = new Headers(options.headers);
      if (!headers.has('apikey') || !headers.get('apikey')) {
        headers.set('apikey', supabaseKey);
      }
      if (!headers.has('Authorization') || !headers.get('Authorization')) {
        headers.set('Authorization', `Bearer ${supabaseKey}`);
      }
      return fetch(url, { ...options, headers });
    },
  },
});
