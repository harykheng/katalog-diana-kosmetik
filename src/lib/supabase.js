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

/** PostgREST membatasi respons di 1.000 baris; lihat rpcAll() di bawah. */
const BATAS_BARIS = 1000;

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

/**
 * Sama seperti rpc(), tapi mengambil SELURUH baris lewat p_limit/p_offset —
 * fungsinya sendiri (catalog_get_history, catalog_get_products) yang memotong
 * hasilnya, bukan header HTTP Range.
 *
 * Sebelumnya paginasi dilakukan lewat header "Range: 0-999", "Range:
 * 1000-1999", dst — pola yang sama dengan bypass limit 1.000 baris di ERP.
 * Ternyata Supabase TIDAK menghormati header Range untuk RPC yang dipanggil
 * lewat POST: server selalu membalas 1.000 baris pertama yang sama berapa pun
 * halaman yang diminta. Akibatnya rpcAll() tidak pernah tahu sudah sampai
 * ujung data — ia terus meminta "halaman berikutnya" tanpa henti, dan tab
 * Semua Barang tidak pernah selesai memuat. Lihat migration42.
 */
export async function rpcAll(fn, params, chunk = BATAS_BARIS) {
  const semua = [];
  for (let offset = 0; ; offset += chunk) {
    const bagian = await rpc(fn, { ...params, p_limit: chunk, p_offset: offset });
    semua.push(...bagian);
    if (bagian.length < chunk) break;
    // Pengaman kalau fungsinya suatu saat mengabaikan p_limit/p_offset:
    // berhenti daripada mengulang permintaan yang sama selamanya.
    if (semua.length > 50000) break;
  }
  return semua;
}
