import { rpc } from './supabase';

/**
 * Token diambil dari URL /t/:token. Tidak ada router library supaya bundle
 * tetap kecil — katalog ini cuma punya satu route.
 */
export function tokenFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/t\/([A-Za-z0-9_-]+)\/?$/);
  return match ? match[1] : null;
}

/** Bentuk baris produk dari RPC disamakan supaya komponen tidak perlu tahu asalnya. */
function toProduct(row) {
  return {
    id: row.product_id,
    name: row.name,
    sku: row.sku,
    price: Number(row.price),
    unit: row.unit,
    categoryName: row.category_name || 'Lainnya',
  };
}

/**
 * Barang tanpa harga tidak boleh sampai ke layar toko: "Rp 0" terbaca seolah
 * gratis dan merusak Total estimasi di pesan WhatsApp. migration39 sudah
 * menyaringnya di database; ini penjaga kedua supaya katalog tetap benar
 * meskipun dipasang di project yang migration-nya belum dijalankan.
 */
function hargaTerisi(product) {
  return Number.isFinite(product.price) && product.price > 0;
}


export async function fetchOutlet(token) {
  const rows = await rpc('catalog_get_outlet', { p_token: token });
  if (!rows.length) return null; // token tidak berlaku
  return {
    storeName: rows[0].store_name,
    distributorName: rows[0].distributor_name || '',
    whatsappNumber: rows[0].whatsapp_number || '',
  };
}

export async function fetchHistory(token) {
  const rows = await rpc('catalog_get_history', { p_token: token });
  return rows
    .map((row) => ({
      ...toProduct(row),
      orderCount: Number(row.order_count),
      totalQty: Number(row.total_qty),
      lastOrdered: row.last_ordered,
    }))
    .filter(hargaTerisi);
}

export async function fetchSuggestions(token, limit = 12) {
  const rows = await rpc('catalog_get_suggestions', {
    p_token: token,
    p_limit: limit,
  });
  return rows.map(toProduct).filter(hargaTerisi);
}

export async function fetchProducts(token) {
  const rows = await rpc('catalog_get_products', { p_token: token });
  return rows.map(toProduct).filter(hargaTerisi);
}
