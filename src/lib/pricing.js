// ============================================================
// Harga & satuan — SATU-SATUNYA tempat perhitungan satuan di aplikasi ini.
//
// Aturan yang dipakai sama persis dengan ERP StokManager:
//   • Harga di database (products.price) selalu harga per satuan dasar produk
//     (products.unit), bukan harga lusin.
//   • Harga lusin = Math.round((price * 12) / 100) * 100 — dibulatkan ke
//     kelipatan 100 terdekat, identik dengan kolom "Harga / lusin" di
//     products.html dan sales.html. Jangan diubah sepihak: kalau rumusnya beda,
//     harga di katalog tidak akan cocok dengan harga yang dilihat sales.
//   • Lusin hanya berlaku untuk produk bersatuan 'pcs'. Produk dengan satuan
//     lain (lusin, box, pack, kg, ...) dijual apa adanya, tanpa konversi.
// ============================================================

export const PCS_PER_LUSIN = 12;

/** Satuan dasar produk, selalu ada isinya. */
export function baseUnit(product) {
  return product.unit || 'pcs';
}

/** Produk bersatuan pcs boleh dipesan per lusin. Selain itu tidak. */
export function supportsLusin(product) {
  return baseUnit(product) === 'pcs';
}

/** Harga satu lusin, mengikuti pembulatan ERP. */
export function lusinPrice(product) {
  return Math.round((Number(product.price) * PCS_PER_LUSIN) / 100) * 100;
}

// Mode satuan yang dipilih toko:
//   'base'  → satuan dasar produk apa adanya (products.unit)
//   'lusin' → hasil konversi 12 pcs, HANYA untuk produk bersatuan pcs
//
// Modenya sengaja bukan nama satuan. Kalau dibandingkan dengan teks 'lusin',
// produk yang satuan dasarnya memang 'lusin' akan ikut dikali 12 sekali lagi —
// Rp 470.000 jadi Rp 5.640.000 tanpa ada yang menyadarinya.
export const UNIT_BASE = 'base';
export const UNIT_LUSIN = 'lusin';

/** Mode yang benar-benar berlaku untuk produk ini. */
function resolveMode(product, mode) {
  return mode === UNIT_LUSIN && supportsLusin(product) ? UNIT_LUSIN : UNIT_BASE;
}

/** Harga untuk mode satuan yang sedang dipilih toko. */
export function priceForUnit(product, mode) {
  return resolveMode(product, mode) === UNIT_LUSIN
    ? lusinPrice(product)
    : Number(product.price);
}

/** Label satuan yang ditampilkan & dikirim ke WhatsApp. */
export function unitLabel(product, mode) {
  return resolveMode(product, mode) === UNIT_LUSIN ? 'lusin' : baseUnit(product);
}

/** Berapa pcs yang dimaksud, untuk rekap "2 lusin = 24 pcs". */
export function isLusinMode(product, mode) {
  return resolveMode(product, mode) === UNIT_LUSIN;
}

export function formatCurrency(amount) {
  return 'Rp ' + Math.round(Number(amount) || 0).toLocaleString('id-ID');
}
