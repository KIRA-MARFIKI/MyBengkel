import { createClient } from '@supabase/supabase-js';

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!rawSupabaseUrl || !supabaseKey) {
  throw new Error(
    'Konfigurasi Supabase belum lengkap. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY di file .env.'
  );
}

// Defensive normalization: ensure trailing slashes are removed and .supabase.com is corrected to .supabase.co
const supabaseUrl = rawSupabaseUrl
  .trim()
  .replace(/\/+$/, '')
  .replace(/\.supabase\.com$/i, '.supabase.co');

// The publishable key is safe in the browser. Data access is enforced by Row Level Security.
export const supabase = createClient(supabaseUrl, supabaseKey);

