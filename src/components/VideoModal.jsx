import { useEffect } from 'react';
import { CARA_PESAN_VIDEO_ID } from '../lib/video';

/**
 * Video tutorial "Cara Pesan Lewat Katalog" — muncul otomatis sekali di
 * kunjungan pertama (lihat App.jsx + lib/video.js), atau dibuka manual lewat
 * tombol "📹 Cara Pesan" di Header. Sama persis, cuma beda pemicunya.
 */
export default function VideoModal({ onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    // Kunci gulir halaman di belakang, sama seperti PhotoModal.
    const asal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = asal;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cara pesan lewat katalog"
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-navy/90 px-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup video"
        className="absolute top-3 right-3 h-10 w-10 rounded-full bg-white/15 text-[20px] leading-none font-bold text-white"
      >
        ✕
      </button>

      {/* Video aslinya vertikal (Shorts), jadi dibatasi lebar bukan tinggi —
          supaya tidak jadi raksasa di HP yang tinggi. */}
      <div
        className="w-full max-w-[280px] overflow-hidden rounded-2xl bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[9/16] w-full">
          <iframe
            src={`https://www.youtube.com/embed/${CARA_PESAN_VIDEO_ID}?rel=0&modestbranding=1&playsinline=1`}
            title="Cara pesan lewat katalog"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-4 rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-navy"
      >
        Lanjut ke Katalog
      </button>
    </div>
  );
}
