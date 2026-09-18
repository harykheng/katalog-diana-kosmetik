import { normalizePhone } from '../lib/order';

/**
 * Header ringkas: label distributor huruf kapital kecil di atas, nama toko
 * berhuruf serif di bawahnya. Sengaja tidak tinggi — kolom cari dan pemilih
 * daftar di bawahnya yang harus cepat terlihat.
 */
export default function Header({ outlet }) {
  const phone = normalizePhone(outlet.whatsappNumber);
  return (
    <header className="bg-white px-4 pt-4 pb-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {outlet.distributorName && (
            <p className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">
              {outlet.distributorName}
            </p>
          )}
          <h1 className="font-display mt-1 truncate text-[22px] leading-tight text-navy">
            {outlet.storeName}
          </h1>
        </div>
        {phone && (
          <a
            href={`https://wa.me/${phone}`}
            className="mt-0.5 shrink-0 rounded-full bg-ice px-3 py-1.5 text-[11px] font-semibold text-navy"
          >
            WA kantor
          </a>
        )}
      </div>
    </header>
  );
}
