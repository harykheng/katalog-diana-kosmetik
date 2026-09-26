/**
 * Data contoh + penyadap jaringan untuk pengujian.
 *
 * Semua panggilan RPC dan permintaan foto dijawab dari sini, jadi pengujian
 * tidak pernah menyentuh Supabase sungguhan: bisa dijalankan tanpa koneksi,
 * tanpa kredensial, dan tidak mungkin mengubah data siapa pun.
 */

export const TOKEN = 'b36a87038afe4c17ab1eee59641f56fc';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': 'content-range',
};

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

export const OUTLET = {
  store_name: 'Toko Ani',
  distributor_name: 'DIANA KOSMETIK',
  whatsapp_number: '628123456789',
};

/** Produk tanpa harga: tetap boleh dipesan, tapi tidak ikut total. */
export const TANPA_HARGA = {
  product_id: 'z1',
  name: 'Produk Belum Ada Harga',
  sku: 'NOPRICE-1',
  price: '0.00',
  unit: 'pcs',
  category_name: 'Bedak',
  photo_thumb_path: null,
  photo_large_path: null,
};

/** 18 produk riwayat; yang pertama punya foto. */
export const RIWAYAT = Array.from({ length: 18 }, (_, i) => ({
  product_id: `h${i}`,
  name: `Bedak Padat Aurora Seri ${i + 1} 12gr`,
  sku: `BD-${String(i + 1).padStart(3, '0')}`,
  price: '25000.00',
  unit: 'pcs',
  category_name: 'Bedak',
  photo_thumb_path: i === 0 ? 'h0/1780000000-thumb.webp' : null,
  photo_large_path: i === 0 ? 'h0/1780000000-large.webp' : null,
  order_count: 3,
  total_qty: 72,
  last_ordered: '2026-08-14',
}));

export const SARAN = [
  {
    product_id: 's1',
    name: 'Lipstik Matte Merah Bata',
    sku: 'LP-001',
    price: '45000.00',
    unit: 'pcs',
    category_name: 'Lipstik',
    photo_thumb_path: null,
    photo_large_path: null,
    outlet_count: 9,
  },
  {
    // Satuan dasarnya MEMANG lusin — tidak boleh dikali 12 sekali lagi.
    product_id: 's2',
    name: 'Paket Lipstik Nude (isi 12)',
    sku: 'LP-002',
    price: '470000.00',
    unit: 'lusin',
    category_name: 'Lipstik',
    photo_thumb_path: null,
    photo_large_path: null,
    outlet_count: 4,
  },
];

const SABUN = [
  { product_id: 'p5', name: 'Sabun Muka Herbal 60ml', sku: 'SB-001', price: '18500.00', unit: 'pcs', category_name: 'Sabun', photo_thumb_path: null, photo_large_path: null },
  { product_id: 'p6', name: 'Masker Wajah Timun', sku: 'SB-002', price: '7500.00', unit: 'pcs', category_name: 'Sabun', photo_thumb_path: null, photo_large_path: null },
];

/**
 * Harga per pcs yang TIDAK genap ratusan — kasus nyata yang lolos ke produksi.
 * 12 pcs × Rp 4.570 = Rp 54.840, tapi ERP membulatkan NAIK subtotal tiap
 * baris ke kelipatan 100 (Math.ceil), jadi di faktur jadi Rp 54.900. Katalog
 * yang cuma mengalikan apa adanya menampilkan Rp 54.840 — beda Rp 60 dari
 * yang admin lihat untuk pesanan yang sama persis.
 */
export const HARGA_GANJIL = {
  product_id: 'p7',
  name: 'Beautica Nail Polish 24 Colors ( Mahkota )',
  sku: 'NP-001',
  price: '4570.00',
  unit: 'pcs',
  category_name: 'Nail Art',
  photo_thumb_path: null,
  photo_large_path: null,
};

const buangKolomRiwayat = ({ order_count, total_qty, last_ordered, ...sisa }) => sisa;
const buangKolomSaran = ({ outlet_count, ...sisa }) => sisa;

export const KATALOG = {
  catalog_get_outlet: [OUTLET],
  catalog_get_history: [...RIWAYAT, { ...TANPA_HARGA, order_count: 2, total_qty: 4, last_ordered: '2026-08-01' }],
  catalog_get_suggestions: [...SARAN, { ...TANPA_HARGA, outlet_count: 3 }],
  catalog_get_products: [
    TANPA_HARGA,
    ...RIWAYAT.map(buangKolomRiwayat),
    ...SARAN.map(buangKolomSaran),
    ...SABUN,
    HARGA_GANJIL,
  ],
};

/**
 * Sadap semua panggilan RPC & foto.
 * Mengembalikan penampung yang ikut terisi selama pengujian berjalan:
 *   fotoDiminta     — URL foto yang benar-benar diunduh browser
 *   paginasiDiminta — "offset-limit" per panggilan catalog_get_products,
 *                     dibaca dari body permintaan (p_limit/p_offset), BUKAN
 *                     header Range — Supabase terbukti tidak menghormati
 *                     Range untuk RPC lewat POST, lihat migration42.
 */
export async function pasangStub(page, data = KATALOG) {
  const fotoDiminta = [];
  const paginasiDiminta = [];

  await page.route('**/rest/v1/rpc/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS, body: '' });
    }
    const fn = new URL(req.url()).pathname.split('/').pop();
    let params = {};
    try {
      params = JSON.parse(req.postData() || '{}');
    } catch {
      params = {};
    }
    if (fn === 'catalog_get_products') {
      const offset = params.p_offset ?? 0;
      const limit = params.p_limit ?? 0;
      paginasiDiminta.push(`${offset}-${offset + limit - 1}`);
    }

    const isi = typeof data[fn] === 'function' ? data[fn](params) : (data[fn] ?? []);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(isi),
    });
  });

  await page.route('**/storage/v1/object/public/**', async (route) => {
    fotoDiminta.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: PNG_1PX });
  });

  // Tombol pesan membuka tab baru; dicegat supaya isinya bisa diperiksa.
  await page.addInitScript(() => {
    window.__waUrl = null;
    window.open = (url) => {
      window.__waUrl = url;
      return null;
    };
  });

  return { fotoDiminta, paginasiDiminta };
}

export async function bukaKatalog(page, token = TOKEN) {
  await page.goto(`/t/${token}`, { waitUntil: 'networkidle' });
}

/** Teks pesanan yang akan dikirim ke WhatsApp, hasil klik tombol pesan. */
export async function teksPesananWa(page) {
  const url = await page.evaluate(() => window.__waUrl);
  return { url, teks: decodeURIComponent((url || '').split('?text=')[1] || '') };
}

/** Elemen kartu produk berdasarkan nama. */
export function kartu(page, nama) {
  return page.locator('li', { hasText: nama }).first();
}

/** Benar kalau elemen utuh terlihat tanpa perlu menggulir sama sekali. */
export async function terlihatTanpaScroll(locator, tinggiLayar = 740) {
  const box = await locator.boundingBox();
  return !!box && box.y >= 0 && box.y + box.height <= tinggiLayar;
}
