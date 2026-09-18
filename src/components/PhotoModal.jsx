import { useEffect } from 'react';
import { formatCurrency, hasPrice, unitLabel, UNIT_BASE } from '../lib/pricing';

/**
 * Foto besar saat thumbnail diketuk. Versi besar baru diunduh di sini, jadi
 * toko yang cuma menggulir daftar tidak pernah menariknya.
 */
export default function PhotoModal({ product, onClose }) {
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

      <img
        src={product.photoLarge || product.photoThumb}
        alt={product.name}
        className="max-h-[70vh] w-full rounded-2xl bg-white object-contain"
        onClick={(e) => e.stopPropagation()}
      />

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
