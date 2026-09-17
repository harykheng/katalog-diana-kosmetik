import { formatCurrency, priceForUnit, unitLabel } from './pricing';

/**
 * Susun daftar pesanan dari state keranjang.
 * cart: Map productId -> { qty, unit }
 * products: Map productId -> data produk
 */
export function buildOrderLines(cart, products) {
  const lines = [];
  for (const [productId, entry] of cart) {
    const product = products.get(productId);
    if (!product || !entry.qty) continue;
    const unitPrice = priceForUnit(product, entry.unit);
    lines.push({
      productId,
      name: product.name,
      qty: entry.qty,
      unit: unitLabel(product, entry.unit),
      unitPrice,
      subtotal: unitPrice * entry.qty,
    });
  }
  return lines;
}

export function orderTotal(lines) {
  return lines.reduce((sum, l) => sum + l.subtotal, 0);
}

/**
 * Teks pesanan yang dikirim ke WhatsApp. Satuan WAJIB ikut di tiap baris —
 * ini yang dibaca admin saat memproses, jadi jangan pernah disingkat.
 */
export function buildOrderText(storeName, lines) {
  const body = lines.map((l) => `- ${l.name}: ${l.qty} ${l.unit}`).join('\n');
  return (
    `Pesanan ${storeName}\n\n` +
    `${body}\n\n` +
    `Total estimasi: ${formatCurrency(orderTotal(lines))}`
  );
}

/** wa.me hanya menerima angka: buang +, spasi, tanda hubung, kurung. */
export function normalizePhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

export function whatsappUrl(phone, text) {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}
