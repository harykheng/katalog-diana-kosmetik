import { useEffect, useState } from 'react';
import { formatCurrency, hasPrice, unitLabel, UNIT_BASE } from '../lib/pricing';

/**
 * Foto besar saat thumbnail diketuk. Versi besar baru diunduh di sini, jadi
 * toko yang cuma menggulir daftar tidak pernah menariknya — artinya di
 * koneksi lambat ada jeda nyata sebelum foto ini muncul.
 */
export default function PhotoModal({ product, onClose }) {
  // Kalau tidak ada foto besar terpisah, yang dipakai ya thumbnail-nya —
  // dan itu kemungkinan besar sudah ada di cache HP dari daftar, jadi tidak
  // perlu menunggu.
  const [besarSiap, setBesarSiap] = useState(!product?.photoLarge);

  useEffect(() => {
    setBesarSiap(!product?.photoLarge);
  }, [product?.id, product?.photoLarge]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    // Kunci gulir halaman di belakang supaya jempol tidak salah sasaran.
    const asal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = asal;
    };
  }, [onClose]);

  if (!product) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${product.name}`}
      onClick={onClose}
      className="fixed inset-0 z-40 flex flex-col justify-center bg-navy/85 px-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup foto"
        className="absolute top-3 right-3 h-10 w-10 rounded-full bg-white/15 text-[20px] leading-none font-bold text-white"
      >
        ✕
      </button>

      <div className="relative" onClick={(e) => e.stopPropagation()}>
        {/* Thumbnail-nya sudah pernah diunduh untuk daftar, jadi tampil dulu
            (diburamkan) sebagai placeholder — toko tidak menatap kotak
            kosong sambil menunggu versi besar. */}
        {product.photoThumb && (
          <img
            src={product.photoThumb}
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 h-full w-full rounded-2xl object-contain blur-sm transition-opacity duration-200 ${
              besarSiap ? 'opacity-0' : 'opacity-70'
            }`}
          />
        )}

        <img
          src={product.photoLarge || product.photoThumb}
          alt={product.name}
          onLoad={() => setBesarSiap(true)}
          onError={() => setBesarSiap(true)}
          className={`relative min-h-[45vh] max-h-[70vh] w-full rounded-2xl bg-white object-contain transition-opacity duration-200 ${
            besarSiap ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {!besarSiap && (
          <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
            <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
          </div>
        )}
      </div>

      <div className="mt-3 text-center text-white" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-[17px] leading-snug">{product.name}</p>
        <p className="mt-1 text-[13px] text-ice">
          {hasPrice(product)
            ? `${formatCurrency(product.price)} / ${unitLabel(product, UNIT_BASE)}`
            : 'Harga dikonfirmasi admin'}
        </p>
      </div>
    </div>
  );
}
