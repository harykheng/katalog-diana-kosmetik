import { formatCurrency } from '../lib/pricing';

/**
 * Sticky bar: jumlah item terpilih + total estimasi + tombol pesan.
 * Sisi kirinya bisa diketuk untuk melihat & mengubah barang yang sudah dipilih,
 * supaya toko tidak perlu mengingat-ingat apa saja yang tadi dimasukkan.
 */
export default function BottomBar({
  itemCount,
  total,
  onOrder,
  disabled,
  onReview,
  reviewing,
  needsPriceCount = 0,
}) {
  const hasItems = itemCount > 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(15,42,71,0.10)]">
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={hasItems ? onReview : undefined}
          disabled={!hasItems}
          aria-label={hasItems ? 'Lihat barang yang dipilih' : undefined}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
        >
          <p className="text-[12px] text-muted">
            {hasItems
              ? `${itemCount} barang dipilih${reviewing ? '' : ' · lihat'}`
              : 'Belum ada barang dipilih'}
          </p>
          <p className="truncate text-[17px] font-bold text-navy">{formatCurrency(total)}</p>
          {needsPriceCount > 0 && (
            // Totalnya tidak boleh terbaca lengkap kalau ada barang yang
            // harganya belum ada — angkanya benar, tapi belum semuanya.
            <p className="truncate text-[11px] font-semibold text-warn-ink">
              +{needsPriceCount} barang tanpa harga
            </p>
          )}
        </button>

        <button
          type="button"
          onClick={onOrder}
          disabled={disabled || !hasItems}
          className="shrink-0 rounded-full bg-navy px-6 py-3 text-[15px] font-semibold text-white transition-colors disabled:bg-line disabled:text-muted"
        >
          Pesan via WA
        </button>
      </div>
    </div>
  );
}
