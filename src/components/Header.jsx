import { normalizePhone } from '../lib/order';

/** Nama toko + identitas distributor. Semuanya dari data, tidak ada yang hardcode. */
export default function Header({ outlet }) {
  const phone = normalizePhone(outlet.whatsappNumber);
  return (
    <header className="bg-gray-900 px-3 pt-4 pb-4 text-white">
      {outlet.distributorName && (
        <p className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
          {outlet.distributorName}
        </p>
      )}
      <h1 className="mt-0.5 text-[20px] leading-tight font-bold">
        {outlet.storeName}
      </h1>
      {phone && (
        <p className="mt-2 text-[12px] text-gray-300">
          WA kantor:{' '}
          <a href={`https://wa.me/${phone}`} className="font-semibold underline">
            {outlet.whatsappNumber}
          </a>
        </p>
      )}
    </header>
  );
}
