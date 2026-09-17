import { formatCurrency, hasPrice, priceForUnit, unitLabel } from './pricing';

export const LABEL_TANPA_HARGA = 'harga dikonfirmasi';

/**
 * Susun daftar pesanan dari state keranjang.
 * cart: Map productId -> { qty, unit }
 * products: Map productId -> data produk
 *
 * Barang yang harganya belum ada tetap masuk daftar, tapi subtotalnya nol dan
 * ditandai `needsPrice` — supaya tidak pernah diam-diam ikut menambah total.
 */
export function buildOrderLines(cart, products) {
  const lines = [];
  for (const [productId, entry] of cart) {
    const product = products.get(productId);
    if (!product || !entry.qty) continue;
    const priced = hasPrice(product);
    const unitPrice = priced ? priceForUnit(product, entry.unit) : 0;
    lines.push({
      productId,
      name: product.name,
      qty: entry.qty,
      unit: unitLabel(product, entry.unit),
      unitPrice,
      subtotal: unitPrice * entry.qty,
      needsPrice: !priced,
    });
  }
  return lines;
}

export function orderTotal(lines) {
  return lines.reduce((sum, l) => sum + l.subtotal, 0);
}

export function countNeedsPrice(lines) {
  return lines.filter((l) => l.needsPrice).length;
}

/**
 * Teks pesanan yang dikirim ke WhatsApp. Satuan WAJIB ikut di tiap baris —
 * ini yang dibaca admin saat memproses, jadi jangan pernah disingkat.
 *
 * Barang tanpa harga ditandai di barisnya sendiri DAN disebut lagi di bawah
 * total, supaya admin maupun toko sama-sama tahu angka itu belum lengkap.
 */
export function buildOrderText(storeName, lines) {
  const body = lines
    .map((l) => `- ${l.name}: ${l.qty} ${l.unit}${l.needsPrice ? ` (${LABEL_TANPA_HARGA})` : ''}`)
    .join('\n');

  const belum = countNeedsPrice(lines);
  const catatan = belum
    ? `\n(belum termasuk ${belum} barang yang harganya dikonfirmasi dulu)`
    : '';

  return (
    `Pesanan ${storeName}\n\n` +
    `${body}\n\n` +
    `Total estimasi: ${formatCurrency(orderTotal(lines))}${catatan}`
  );
}

/** wa.me hanya menerima angka: buang +, spasi, tanda hubung, kurung. */
export function normalizePhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

export function whatsappUrl(phone, text) {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}
