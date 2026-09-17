import { formatCurrency } from '../lib/pricing';

/** Sticky bar: jumlah item terpilih + total estimasi + tombol pesan. */
export default function BottomBar({ itemCount, total, onOrder, disabled }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-lg items-center gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-gray-500">
            {itemCount === 0
              ? 'Belum ada barang dipilih'
              : `${itemCount} barang dipilih`}
          </p>
          <p className="truncate text-[16px] font-bold text-gray-900">
            {formatCurrency(total)}
          </p>
        </div>
        <button
          type="button"
          onClick={onOrder}
          disabled={disabled || itemCount === 0}
          className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3 text-[15px] font-bold text-white disabled:bg-gray-300"
        >
          Pesan via WA
        </button>
      </div>
    </div>
  );
}
