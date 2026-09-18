// ============================================================
// Pemanggil RPC Supabase lewat fetch biasa.
//
// Katalog ini cuma butuh 4 panggilan RPC read-only — tanpa login, tanpa
// realtime, tanpa storage. Library @supabase/supabase-js menambah ~85 KB gzip
// untuk kemampuan yang tidak satupun dipakai di sini, dan halaman ini dibuka
// dari HP kelas menengah-bawah dengan koneksi lambat. Jadi yang dipakai
// endpoint PostgREST-nya langsung: tetap Supabase, tetap anon key, RLS dan
// hak akses fungsi tetap berlaku persis sama.
// ============================================================

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configMissing = !url || !anonKey;

/**
 * URL file di bucket publik Supabase Storage. Dipakai untuk foto produk —
 * bucket publik supaya bisa di-cache CDN dan tidak perlu signed URL yang
 * kedaluwarsa. Path sudah memuat timestamp, jadi URL-nya berubah setiap foto
 * diganti dan tidak pernah ada cache yang basi.
 */
export function publicStorageUrl(bucket, path) {
  if (!path || configMissing) return null;
  return `${url}/storage/v1/object/public/${bucket}/${path}`;
}

/**
 * Panggil satu fungsi RPC. Mengembalikan array baris (bisa kosong).
 * Melempar Error kalau jaringan gagal atau server menolak.
 */
export async function rpc(fn, params) {
  if (configMissing) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diisi');

  const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(params || {}),
  });

  if (!response.ok) {
    // PostgREST mengirim { message, details, hint, code } saat menolak.
    const detail = await response.text().catch(() => '');
    throw new Error(`RPC ${fn} gagal (${response.status}): ${detail}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}
