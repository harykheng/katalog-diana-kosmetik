import {
  baseUnit,
  formatCurrency,
  hasPrice,
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
 * Satu baris produk: dua baris saja supaya muat banyak barang per layar —
 * nama + pemilih satuan di atas, harga + stepper di bawah.
 *
 * Satuan muncul di tiga tempat sekaligus: tombol pemilih, label di sebelah
 * angka jumlah, dan baris rekap saat barang dipilih. Salah satuan adalah
 * kesalahan paling mahal di alur ini, jadi lebih baik berlebihan daripada
 * ambigu.
 */
export default function ProductItem({ product, entry, onChange, note }) {
  const qty = entry?.qty || 0;
  const mode = entry?.unit || UNIT_BASE;
  const canLusin = supportsLusin(product);
  const perLusin = isLusinMode(product, mode);
  const activePrice = priceForUnit(product, mode);
  const label = unitLabel(product, mode);
  const berharga = hasPrice(product);

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
    <li
      className={`border-l-[3px] px-3 py-2.5 ${
        qty === 0
          ? 'border-l-transparent'
          : berharga
            ? 'border-l-emerald-500 bg-emerald-50/60'
            : 'border-l-amber-400 bg-amber-50/60'
      }`}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[14px] leading-snug font-semibold text-gray-900">
          {product.name}
        </p>

        {canLusin && (
          <div
            className="flex shrink-0 overflow-hidden rounded-lg border border-gray-300 text-[11px]"
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
                  mode === m ? 'bg-gray-900 text-white' : 'bg-white text-gray-500'
                }`}
              >
                {m === UNIT_BASE ? baseUnit(product) : 'lusin'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {berharga ? (
            <p className="text-[13px] leading-tight">
              <span className="font-bold text-gray-900">{formatCurrency(activePrice)}</span>
              <span className="text-gray-500"> / {label}</span>
            </p>
          ) : (
            // Sengaja tidak menampilkan "Rp 0" — itu terbaca seperti gratis.
            <p className="inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[12px] leading-tight font-semibold whitespace-nowrap text-amber-900">
              Harga dikonfirmasi
            </p>
          )}
          {canLusin && berharga && (
            <p className="mt-0.5 text-[11px] leading-tight text-gray-400">
              {perLusin
                ? `${formatCurrency(product.price)} / pcs`
                : `${formatCurrency(lusinPrice(product))} / lusin`}
            </p>
          )}
          {!berharga && (
            <p className="mt-0.5 text-[11px] leading-tight text-gray-500">
              Boleh dipesan, harga menyusul
            </p>
          )}
          {note && (
            <p className="mt-0.5 truncate text-[11px] leading-tight text-gray-400">{note}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setQty(qty - 1)}
            disabled={qty === 0}
            aria-label={`Kurangi ${product.name}`}
            className="h-9 w-9 rounded-lg border border-gray-300 bg-white text-lg leading-none font-bold text-gray-700 disabled:opacity-30"
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
            className="h-9 w-11 rounded-lg border border-gray-300 bg-white text-center text-[15px] font-semibold"
          />
          <button
            type="button"
            onClick={() => setQty(qty + 1)}
            aria-label={`Tambah ${product.name}`}
            className="h-9 w-9 rounded-lg border border-gray-300 bg-white text-lg leading-none font-bold text-gray-700"
          >
            +
          </button>
          {/* Satuan di sebelah angka — tidak boleh hilang di layar sempit */}
          <span className="w-9 text-[11px] leading-tight font-bold text-gray-900">
            {label}
          </span>
        </div>
      </div>

      {qty > 0 && (
        <p
          className={`mt-1.5 text-[12px] font-semibold ${
            berharga ? 'text-emerald-800' : 'text-amber-800'
          }`}
        >
          {qty} {label}
          {perLusin && ` = ${qty * PCS_PER_LUSIN} pcs`} ·{' '}
          {berharga ? formatCurrency(qty * activePrice) : 'harga dikonfirmasi'}
        </p>
      )}
    </li>
  );
}
