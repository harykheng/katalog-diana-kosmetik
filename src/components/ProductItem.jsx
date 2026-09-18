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
import ProductPhoto from './ProductPhoto';

/**
 * Satu kartu produk: dua baris saja supaya muat banyak barang per layar —
 * foto + nama + pemilih satuan di atas, harga + stepper di bawah.
 *
 * Satuan muncul di tiga tempat sekaligus: tombol pemilih, label di sebelah
 * angka jumlah, dan baris rekap saat barang dipilih. Salah satuan adalah
 * kesalahan paling mahal di alur ini, jadi lebih baik berlebihan daripada
 * ambigu.
 */
export default function ProductItem({ product, entry, onChange, note, onOpenPhoto }) {
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
      className={`border-l-[3px] px-4 py-3 ${
        qty === 0
          ? 'border-l-transparent'
          : berharga
            ? 'border-l-navy bg-ice/45'
            : 'border-l-warn-ink/60 bg-warn-bg/50'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <ProductPhoto product={product} onOpen={onOpenPhoto} />

        <p className="min-w-0 flex-1 text-[14px] leading-snug font-semibold text-ink">
          {product.name}
        </p>

        {canLusin && (
          <div
            className="flex shrink-0 overflow-hidden rounded-full border border-line text-[11px]"
            role="group"
            aria-label={`Satuan untuk ${product.name}`}
          >
            {[UNIT_BASE, UNIT_LUSIN].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`px-2.5 py-1 font-semibold ${
                  mode === m ? 'bg-navy text-white' : 'bg-white text-muted'
                }`}
              >
                {m === UNIT_BASE ? baseUnit(product) : 'lusin'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {berharga ? (
            <p className="text-[13px] leading-tight">
              <span className="font-bold text-navy">{formatCurrency(activePrice)}</span>
              <span className="text-muted"> / {label}</span>
            </p>
          ) : (
            // Sengaja tidak menampilkan "Rp 0" — itu terbaca seperti gratis.
            <p className="inline-block rounded-full bg-warn-bg px-2 py-0.5 text-[12px] leading-tight font-semibold whitespace-nowrap text-warn-ink">
              Harga dikonfirmasi
            </p>
          )}
          {canLusin && berharga && (
            <p className="mt-0.5 text-[11px] leading-tight text-muted">
              {perLusin
                ? `${formatCurrency(product.price)} / pcs`
                : `${formatCurrency(lusinPrice(product))} / lusin`}
            </p>
          )}
          {!berharga && (
            <p className="mt-0.5 text-[11px] leading-tight text-muted">
              Boleh dipesan, harga menyusul
            </p>
          )}
          {note && (
            <p className="mt-0.5 truncate text-[11px] leading-tight text-muted">{note}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Satu kesatuan −│angka│+, bukan tiga kotak terpisah. Saat jumlah 0,
              yang diredupkan HANYA warna tanda minusnya — border dan latarnya
              tetap utuh, supaya tombolnya tidak terlihat seperti hilang. */}
          <div className="flex h-9 items-center overflow-hidden rounded-full border border-line bg-white">
            <button
              type="button"
              onClick={() => setQty(qty - 1)}
              disabled={qty === 0}
              aria-label={`Kurangi ${product.name}`}
              className={`h-full w-9 text-[19px] leading-none font-semibold ${
                qty === 0 ? 'cursor-default text-muted/45' : 'text-navy active:bg-ice'
              }`}
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
              className="h-full w-9 border-x border-line bg-transparent text-center text-[15px] font-semibold text-ink outline-none"
            />
            <button
              type="button"
              onClick={() => setQty(qty + 1)}
              aria-label={`Tambah ${product.name}`}
              className="h-full w-9 text-[19px] leading-none font-semibold text-navy active:bg-ice"
            >
              +
            </button>
          </div>
          {/* Satuan di sebelah angka — tidak boleh hilang di layar sempit */}
          <span className="w-8 text-[11px] leading-tight font-bold text-ink">{label}</span>
        </div>
      </div>

      {qty > 0 && (
        <p
          className={`mt-2 text-[12px] font-semibold ${
            berharga ? 'text-navy' : 'text-warn-ink'
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
