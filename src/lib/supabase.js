import { createClient } from '@supabase/supabase-js';

// Semuanya dari environment, tidak ada URL/key/ID yang ditulis di kode —
// supaya katalog ini bisa dipakai ulang untuk distributor lain cukup dengan
// mengganti environment variable di Vercel.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configMissing = !url || !anonKey;

export const supabase = configMissing
  ? null
  : createClient(url, anonKey, {
      auth: {
        // Katalog dibuka tanpa login: tidak perlu simpan atau perbarui sesi.
        persistSession: false,
        autoRefreshToken: false,
      },
    });
