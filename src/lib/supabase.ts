import { createClient } from '@supabase/supabase-js';

const rawSupabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://gnnfykbnblhwlwwtzqry.supabase.co';
const supabaseKey: string | undefined =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!rawSupabaseUrl || !supabaseKey) {
  throw new Error(
    'Konfigurasi Supabase belum lengkap. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY di file .env.'
  );
}

// Defensive normalization: ensure trailing slashes are removed and .supabase.com is corrected to .supabase.co
const normalizedUrl = rawSupabaseUrl
  .trim()
  .replace(/\/+$/, '')
  .replace(/\.supabase\.com$/i, '.supabase.co');

// In local dev, route through the local Vite proxy (/supabase-api) to prevent browser ISP timeouts or CORS blocks
const isDev = import.meta.env.DEV;
const supabaseUrl =
  isDev && typeof window !== 'undefined'
    ? `${window.location.origin}/supabase-api`
    : normalizedUrl;

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
  },
});

