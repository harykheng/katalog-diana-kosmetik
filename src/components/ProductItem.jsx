import {
  baseUnit,
  formatCurrency,
  isLusinMode,
  lusinPrice,
  PCS_PER_LUSIN,
  priceForUnit,
  supportsLusin,
  UNIT_BASE,
  UNIT_LUSIN,
  unitLabel,
} from '../lib/pricing';

/**
 * Satu baris produk: nama, harga per satuan, pemilih satuan, dan stepper.
 *
 * Satuan sengaja ditempel persis di sebelah angka jumlah dan diulang lagi di
 * baris rekap bawah ("2 lusin = 24 pcs"). Salah satuan adalah kesalahan paling
 * mahal di alur ini, jadi lebih baik berlebihan daripada ambigu.
 */
export default function ProductItem({ product, entry, onChange, note }) {
  const qty = entry?.qty || 0;
  const mode = entry?.unit || UNIT_BASE;
  const canLusin = supportsLusin(product);
  const perLusin = isLusinMode(product, mode);
  const activePrice = priceForUnit(product, mode);
  const label = unitLabel(product, mode);

  function setQty(next) {
    onChange(product.id, { qty: Math.max(0, Math.min(9999, next)), unit: mode });
  }

  function setMode(nextMode) {
    if (nextMode === mode) return;
    // Jumlah sengaja TIDAK dikonversi otomatis saat satuan diganti: "3" yang
    // tadinya pcs jangan diam-diam jadi 36 pcs tanpa toko menyadarinya.
    onChange(product.id, { qty, unit: nextMode });
  }

  return (
    <li className={`px-3 py-3 ${qty > 0 ? 'bg-emerald-50' : 'bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-semibold text-gray-900">
            {product.name}
          </p>
          <p className="mt-0.5 text-[13px] text-gray-600">
            <span className="font-semibold text-gray-900">
              {formatCurrency(activePrice)}
            </span>
            <span className="text-gray-500"> / {label}</span>
          </p>
          {canLusin && (
            <p className="mt-0.5 text-[11px] text-gray-500">
              {perLusin
                ? `${formatCurrency(product.price)} / pcs`
                : `${formatCurrency(lusinPrice(product))} / lusin`}
            </p>
          )}
          {note && <p className="mt-1 text-[11px] text-gray-500">{note}</p>}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {canLusin && (
            <div
              className="flex overflow-hidden rounded-lg border border-gray-300 text-[11px]"
              role="group"
              aria-label={`Satuan untuk ${product.name}`}
            >
              {[UNIT_BASE, UNIT_LUSIN].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`px-2 py-1 font-semibold ${
                    mode === m ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'
                  }`}
                >
                  {m === UNIT_BASE ? baseUnit(product) : 'lusin'}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setQty(qty - 1)}
              disabled={qty === 0}
              aria-label={`Kurangi ${product.name}`}
              className="h-9 w-9 rounded-lg border border-gray-300 bg-white text-lg font-bold text-gray-700 disabled:opacity-40"
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              value={qty === 0 ? '' : qty}
              placeholder="0"
              onChange={(e) => setQty(parseInt(e.target.value, 10) || 0)}
              aria-label={`Jumlah ${product.name} dalam ${label}`}
              className="h-9 w-12 rounded-lg border border-gray-300 bg-white text-center text-[15px] font-semibold"
            />
            <button
              type="button"
              onClick={() => setQty(qty + 1)}
              aria-label={`Tambah ${product.name}`}
              className="h-9 w-9 rounded-lg border border-gray-300 bg-white text-lg font-bold text-gray-700"
            >
              +
            </button>
            {/* Satuan di sebelah angka — tidak boleh hilang di layar sempit */}
            <span className="w-10 text-[12px] font-bold text-gray-900">
              {label}
            </span>
          </div>
        </div>
      </div>

      {qty > 0 && (
        <p className="mt-2 rounded-md bg-white/70 px-2 py-1 text-[12px] font-medium text-emerald-800">
          {qty} {label}
          {perLusin && ` = ${qty * PCS_PER_LUSIN} pcs`} ·{' '}
          {formatCurrency(qty * activePrice)}
        </p>
      )}
    </li>
  );
}
