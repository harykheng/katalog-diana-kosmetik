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

/** PostgREST memotong respons di 1.000 baris; lihat rpcAll() di bawah. */
const BATAS_BARIS = 1000;

/**
 * Panggil satu fungsi RPC. Mengembalikan array baris (bisa kosong).
 * Melempar Error kalau jaringan gagal atau server menolak.
 * `range` opsional: { from, to } untuk mengambil sepotong hasil.
 */
export async function rpc(fn, params, range) {
  if (configMissing) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diisi');

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (range) {
    headers['Range-Unit'] = 'items';
    headers.Range = `${range.from}-${range.to}`;
  }

  const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
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
 * Sama seperti rpc(), tapi mengambil SELURUH baris.
 *
 * PostgREST membatasi satu respons di 1.000 baris. Katalog ini punya lebih dari
 * itu, jadi tanpa pengambilan bertahap sisanya tidak pernah sampai ke HP — dan
 * yang paling menyesatkan, kolom cari ikut tidak menemukannya karena memang
 * tidak pernah terunduh. Pola ini sama dengan fetchAll() di ERP.
 */
export async function rpcAll(fn, params, chunk = BATAS_BARIS) {
  const semua = [];
  for (let from = 0; ; from += chunk) {
    const bagian = await rpc(fn, params, { from, to: from + chunk - 1 });
    semua.push(...bagian);
    if (bagian.length < chunk) break;
    // Pengaman kalau server suatu saat mengabaikan Range: berhenti daripada
    // mengulang permintaan yang sama selamanya.
    if (semua.length > 50000) break;
  }
  return semua;
}
