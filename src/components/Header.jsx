import { normalizePhone } from '../lib/order';

/**
 * Nama toko + identitas distributor. Sengaja ringkas satu baris nama: kolom
 * cari dan pemilih daftar di bawahnya yang harus cepat terlihat, bukan header.
 * Semuanya dari data, tidak ada yang hardcode.
 */
export default function Header({ outlet }) {
  const phone = normalizePhone(outlet.whatsappNumber);
  return (
    <header className="bg-gray-900 px-3 py-3 text-white">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="min-w-0 truncate text-[17px] leading-tight font-bold">
          {outlet.storeName}
        </h1>
        {phone && (
          <a
            href={`https://wa.me/${phone}`}
            className="shrink-0 text-[12px] font-semibold text-emerald-300 underline"
          >
            WA kantor
          </a>
        )}
      </div>
      {outlet.distributorName && (
        <p className="mt-0.5 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
          {outlet.distributorName}
        </p>
      )}
    </header>
  );
}
