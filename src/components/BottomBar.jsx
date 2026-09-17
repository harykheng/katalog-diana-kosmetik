import { formatCurrency } from '../lib/pricing';

/**
 * Sticky bar: jumlah item terpilih + total estimasi + tombol pesan.
 * Sisi kirinya bisa diketuk untuk melihat & mengubah barang yang sudah dipilih,
 * supaya toko tidak perlu mengingat-ingat apa saja yang tadi dimasukkan.
 */
export default function BottomBar({ itemCount, total, onOrder, disabled, onReview, reviewing }) {
  const hasItems = itemCount > 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-lg items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={hasItems ? onReview : undefined}
          disabled={!hasItems}
          aria-label={hasItems ? 'Lihat barang yang dipilih' : undefined}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
        >
          <p className="text-[12px] text-gray-500">
            {hasItems
              ? `${itemCount} barang dipilih${reviewing ? '' : ' · lihat'}`
              : 'Belum ada barang dipilih'}
          </p>
          <p className="truncate text-[16px] font-bold text-gray-900">{formatCurrency(total)}</p>
        </button>

        <button
          type="button"
          onClick={onOrder}
          disabled={disabled || !hasItems}
          className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3 text-[15px] font-bold text-white disabled:bg-gray-300"
        >
          Pesan via WA
        </button>
      </div>
    </div>
  );
}
